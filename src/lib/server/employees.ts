import 'server-only';
import { Prisma, type Currency, type SalaryType } from '@prisma/client';
import { prisma, withTx, type Tx } from '@/lib/db';
import { D, Dec, round2, roundMoney, type Cur } from '@/lib/money';
import { dbToIso, isValidIsoDate, isoToDb, todayIso } from '@/lib/dates';
import { PERIOD_RE, RULES, daysInMonth } from '@/lib/rules';
import { AppError, Validator, conflict, fieldError, notFound } from './errors';
import { lockVaults, nextNumber, payOut, type Src } from './ledger';
import { cleanText, currentRate, phone, reqCurrency, reqPositive } from './common';
import { cleanImage } from './catalog';
import { audit } from './audit';
import { notifyOwner } from './notify';
import { assertWalletOpen, snapshotTxn, walletOf, type Actor, type Saved } from './txns';

// Employees & salaries.
//  • Salaries are always recorded in USD (totalUsd). The money leaves ONE vault: the USD vault pays the same
//    dollars; the IQD vault pays the dinar equivalent at the current rate.
//  • Every payment is a SALARY document in the vault ledger, so a vault that can't cover it leaves the rest as an
//    unpaid vault due (shown on this page and under Vault → Unpaid dues), and deleting it reverses the money.
//  • Monthly employees are paid automatically once per month from the main USD vault. A month is never paid twice
//    automatically (runKey "salary:<employeeId>:<YYYY-MM>"); a deleted automatic salary is not re-created.
//  • Daily workers are paid by hand: days worked × daily rate, never more days than the month has.
//  • No PIN is needed for salaries.

const SALARY_TYPES: Record<string, SalaryType> = { monthly: 'MONTHLY', daily: 'DAILY', MONTHLY: 'MONTHLY', DAILY: 'DAILY' };
const runKeyOf = (employeeId: string, period: string) => `salary:${employeeId}:${period}`;
const currentPeriod = () => todayIso().slice(0, 7);

// ─── Employees ─────────────────────────────────────────────────────────────────────────────────────
export type EmployeeInput = {
  name?: string;
  salaryUsd?: string;
  salaryType?: string;
  phone?: string;
  gender?: string;
  address?: string;
  active?: boolean;
  avatar?: string | null;
};

export async function saveEmployee(input: EmployeeInput, actor: Actor, id?: string) {
  const v = new Validator();
  const name = cleanText(input.name, 120);
  if (!name) v.add('name', 'v.required');
  const salaryUsd = round2(reqPositive(v, 'salaryUsd', input.salaryUsd));
  const salaryType = SALARY_TYPES[String(input.salaryType ?? 'MONTHLY')] ?? 'MONTHLY';
  const gender = input.gender === 'male' || input.gender === 'female' ? input.gender : '';
  v.throwIfAny();
  if (!salaryUsd.gt(0)) throw fieldError('salaryUsd', 'v.positive');
  const avatar = cleanImage(input.avatar, 'avatar');
  const data = {
    name,
    salaryUsd: salaryUsd.toString(),
    salaryType,
    phone: phone(input.phone),
    gender,
    address: cleanText(input.address, 300),
    active: input.active !== false,
  };
  const saved = await withTx(async (tx) => {
    if (id) {
      const before = await tx.employee.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.employee.update({ where: { id }, data: { ...data, ...(avatar !== undefined ? { avatar } : {}) } });
      await audit({ user: actor, action: 'update', module: 'employees', reference: name, before: { ...before, avatar: before.avatar ? '[image]' : null }, after: { ...after, avatar: after.avatar ? '[image]' : null } }, tx);
      return after;
    }
    const e = await tx.employee.create({ data: { ...data, avatar: avatar ?? null } });
    await audit({ user: actor, action: 'create', module: 'employees', reference: name, after: { ...e, avatar: e.avatar ? '[image]' : null } }, tx);
    return e;
  });
  // A new (or re-activated) monthly employee gets this month's salary right away.
  await runMonthlySalaries();
  return { id: saved.id, name: saved.name };
}

/** Deletes the employee only. Their salary history stays (the documents keep the name they were paid under). */
export async function deleteEmployee(id: string, actor: Actor) {
  return withTx(async (tx) => {
    const e = await tx.employee.findUnique({ where: { id } });
    if (!e) throw notFound();
    await tx.employee.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: 'employees', reference: e.name, before: { ...e, avatar: e.avatar ? '[image]' : null } }, tx);
  });
}

/** The employee's picture as an image response. */
export async function employeeAvatar(id: string) {
  const e = await prisma.employee.findUnique({ where: { id }, select: { avatar: true } });
  const m = e?.avatar ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(e.avatar) : null;
  if (!m) throw notFound();
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable' } });
}

// ─── Paying a salary ───────────────────────────────────────────────────────────────────────────────
export type PayInput = {
  employeeId?: string;
  /** "YYYY-MM": the month this salary is for. */
  period?: string;
  /** Daily workers only: days worked (half days allowed). */
  days?: string;
  vault?: string;
  date?: string;
  allowShortfall?: boolean;
};

/** A live (not deleted) monthly salary already paid for this employee and month? */
async function monthlyAlreadyPaid(tx: Tx, employeeId: string, period: string) {
  return tx.txn.findFirst({ where: { kind: 'SALARY', employeeId, period, quantity: null, deletedAt: null }, select: { number: true } });
}

type Post = {
  employee: { id: string; name: string; salaryType: SalaryType; salaryUsd: Prisma.Decimal };
  period: string;
  days: Dec | null;
  vault: Currency;
  date: string;
  allowShortfall: boolean;
  ownerId: string | null;
  runKey?: string;
  actor: Actor | null;
};

/** Writes one SALARY document and takes the money out of the vault (the rest becomes an unpaid due). */
async function postSalary(tx: Tx, p: Post): Promise<Saved> {
  const rateUsd = D(p.employee.salaryUsd);
  const amountUsd = round2(p.days ? rateUsd.times(p.days) : rateUsd);
  const rate = await currentRate(tx);
  const vaultAmount = roundMoney(p.vault === 'USD' ? amountUsd : amountUsd.times(rate), p.vault as Cur);
  const number = await nextNumber(tx, 'SALARY');
  const date = isoToDb(p.date);
  const t = await tx.txn.create({
    data: {
      number,
      kind: 'SALARY',
      date,
      currency: p.vault,
      rate: rate.toString(),
      total: vaultAmount.toString(),
      totalUsd: amountUsd.toString(),
      vault: p.vault,
      vaultAmount: vaultAmount.toString(),
      vaultOwnerUserId: p.ownerId,
      label: p.employee.name,
      employeeId: p.employee.id,
      period: p.period,
      unitName: p.days ? 'day' : '',
      unitPrice: p.days ? rateUsd.toString() : null,
      quantity: p.days ? p.days.toString() : null,
      runKey: p.runKey ?? null,
      createdById: p.actor?.id ?? null,
      createdByName: p.actor?.name ?? '',
      updatedById: p.actor?.id ?? null,
      updatedByName: p.actor?.name ?? '',
    },
  });
  const src: Src = { txnId: t.id, kind: 'SALARY', date };
  await payOut(tx, src, p.vault, vaultAmount, p.allowShortfall, p.ownerId);
  await audit({ user: p.actor, action: 'create', module: 'employees', reference: p.runKey ? `${number} (automatic)` : number, after: await snapshotTxn(tx, t.id) }, tx);
  if (p.actor) await notifyOwner(tx, p.actor, t.id, 'create');
  return { id: t.id, number };
}

/**
 * Pay an employee by hand. Daily worker: days worked × daily rate. Monthly employee: their monthly salary for the
 * chosen month (refused when that month is already paid). A short vault asks first (allowShortfall), then pays
 * what is there and keeps the rest as an unpaid due.
 */
export async function paySalary(input: PayInput, actor: Actor): Promise<Saved> {
  const v = new Validator();
  if (!input.employeeId) v.add('employeeId', 'v.required');
  const period = typeof input.period === 'string' && PERIOD_RE.test(input.period) ? input.period : (v.add('period', 'v.required'), '');
  const vault = reqCurrency(v, 'vault', input.vault);
  const date = input.date === undefined || input.date === '' ? todayIso() : isValidIsoDate(input.date) ? input.date : (v.add('date', 'v.date'), todayIso());
  v.throwIfAny();
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId! } });
  if (!employee) throw notFound();
  if (!employee.active) throw conflict('emp.inactive', { name: employee.name });

  let days: Dec | null = null;
  if (employee.salaryType === 'DAILY') {
    const dv = new Validator();
    days = reqPositive(dv, 'days', input.days);
    dv.throwIfAny();
    const max = daysInMonth(period);
    if (days.gt(max)) throw fieldError('days', 'emp.tooManyDays', { max });
    if (!days.div(RULES.salaryDayStep).isInteger()) throw fieldError('days', 'emp.dayStep');
  }

  return withTx(async (tx) => {
    const ownerId = walletOf(actor);
    await lockVaults(tx, [ownerId]);
    await assertWalletOpen(tx, ownerId);
    // Serialize payments per employee so the same month can't be paid twice by two clicks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'alu:employee:' + employee.id}))`;
    if (employee.salaryType === 'MONTHLY') {
      const paid = await monthlyAlreadyPaid(tx, employee.id, period);
      if (paid) throw conflict('emp.alreadyPaid', { name: employee.name, number: paid.number });
    }
    return postSalary(tx, { employee, period, days, vault, date, allowShortfall: input.allowShortfall === true, ownerId, actor });
  });
}

/**
 * This month's salary for every active monthly employee who hasn't been paid for it yet. Paid from the main USD
 * vault on the day it runs; when the vault is short, what is there is paid and the rest is kept as an unpaid due,
 * so the salary is never silently skipped. Safe to call often.
 */
export async function runMonthlySalaries(): Promise<number> {
  const period = currentPeriod();
  const employees = await prisma.employee.findMany({ where: { active: true, salaryType: 'MONTHLY' } });
  let posted = 0;
  for (const employee of employees) {
    const runKey = runKeyOf(employee.id, period);
    try {
      const done = await withTx(async (tx) => {
        await lockVaults(tx, [null]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'alu:employee:' + employee.id}))`;
        // Already posted (even if it was later deleted on purpose), or already paid by hand for this month.
        if (await tx.txn.findUnique({ where: { runKey }, select: { id: true } })) return false;
        if (await monthlyAlreadyPaid(tx, employee.id, period)) return false;
        await postSalary(tx, { employee, period, days: null, vault: 'USD', date: todayIso(), allowShortfall: true, ownerId: null, runKey, actor: null });
        return true;
      });
      if (done) posted++;
    } catch (e) {
      // A parallel run posted the same month first (unique runKey) — nothing to do.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  return posted;
}

// ─── Page data ─────────────────────────────────────────────────────────────────────────────────────
export async function employeesOverview(actor: Actor & { isOwner: boolean }) {
  const posted = await runMonthlySalaries();
  const period = currentPeriod();
  const monthStart = isoToDb(`${period}-01`);
  // Staff see only salaries that moved their own vault; the owner sees all of them.
  const scope: Prisma.TxnWhereInput = actor.isOwner ? {} : { vaultOwnerUserId: actor.id };
  const [employees, payments, dues, monthPaid] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, salaryUsd: true, salaryType: true, phone: true, gender: true, address: true, active: true, updatedAt: true, avatar: true },
    }),
    prisma.txn.findMany({
      where: { kind: 'SALARY', deletedAt: null, ...scope },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: { dues: { where: { settledAt: null }, select: { id: true, vault: true, amount: true, paid: true } } },
    }),
    prisma.vaultDue.findMany({
      where: { settledAt: null, ownerUserId: walletOf(actor), txn: { kind: 'SALARY', deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      include: { txn: { select: { id: true, number: true, label: true, period: true, totalUsd: true, date: true } } },
    }),
    prisma.txn.aggregate({ where: { kind: 'SALARY', deletedAt: null, date: { gte: monthStart }, ...scope }, _sum: { totalUsd: true }, _count: true }),
  ]);
  const active = employees.filter((e) => e.active);
  return {
    posted,
    period,
    stats: {
      activeCount: active.length,
      monthlyPayrollUsd: active.filter((e) => e.salaryType === 'MONTHLY').reduce((s, e) => s.plus(D(e.salaryUsd)), new Dec(0)).toString(),
      paidThisMonthUsd: D(monthPaid._sum.totalUsd).toString(),
      paidThisMonthCount: monthPaid._count,
      duesCount: dues.length,
    },
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      salaryUsd: e.salaryUsd.toString(),
      salaryType: e.salaryType,
      phone: e.phone,
      gender: e.gender,
      address: e.address,
      active: e.active,
      hasAvatar: !!e.avatar,
      avatarV: e.updatedAt.getTime(),
    })),
    dues: dues.map((d) => ({
      id: d.id,
      vault: d.vault,
      remaining: D(d.amount).minus(D(d.paid)).toString(),
      txnId: d.txn.id,
      number: d.txn.number,
      name: d.txn.label,
      period: d.txn.period ?? '',
      totalUsd: d.txn.totalUsd.toString(),
    })),
    payments: payments.map((t) => {
      const owed = t.dues.reduce((s, d) => s.plus(D(d.amount).minus(D(d.paid))), new Dec(0));
      return {
        id: t.id,
        number: t.number,
        date: dbToIso(t.date),
        name: t.label,
        employeeId: t.employeeId,
        period: t.period ?? '',
        days: t.quantity?.toString() ?? null,
        amountUsd: t.totalUsd.toString(),
        vault: t.vault as Currency,
        vaultAmount: t.vaultAmount.toString(),
        status: owed.gt(0) ? ('due' as const) : ('paid' as const),
        owed: owed.toString(),
        automatic: !!t.runKey,
      };
    }),
  };
}
export type EmployeesOverview = Awaited<ReturnType<typeof employeesOverview>>;
export type EmployeeRow = EmployeesOverview['employees'][number];
export type SalaryRow = EmployeesOverview['payments'][number];
export type SalaryDueRow = EmployeesOverview['dues'][number];

/** A due on a salary document, paid from the salaries page. Only salary dues are accepted here. */
export async function assertSalaryDue(dueId: string) {
  const d = await prisma.vaultDue.findUnique({ where: { id: dueId }, select: { txn: { select: { kind: true } } } });
  if (!d || d.txn.kind !== 'SALARY') throw new AppError(404, 'err.notFound');
}
