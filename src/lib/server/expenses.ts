import 'server-only';
import bcrypt from 'bcryptjs';
import type { Currency, RecurFrequency, RecurState } from '@prisma/client';
import { prisma, withTx, type Tx } from '@/lib/db';
import { D, Dec, fmtMoney, round2, round3, round4, roundMoney, toUsd } from '@/lib/money';
import { dbToIso, isValidIsoDate, isoToDb, todayIso } from '@/lib/dates';
import { addPeriod, isSkippedDay } from '@/lib/recurrence';
import { AppError, Validator, conflict, fieldError, notFound } from './errors';
import { lockVaults, nextNumber, payOut, reverseEffects, vaultBalance, vaultMove, type Src } from './ledger';
import { cleanMultiline, cleanText, currentRate, getSettings, nameKey, reqCurrency, reqDate, reqPositive } from './common';
import { audit } from './audit';
import { snapshotTxn, type Actor, type Saved } from './txns';

// Expenses: every expense is an EXPENSE transaction that takes money OUT of one vault, in that vault's own
// currency. Recurring rules post the same expense automatically on a daily / weekly / monthly schedule.

// ─── Settings: vault mode + PIN ────────────────────────────────────────────────────────────────────
export type VaultMode = 'ask' | 'USD' | 'IQD';
export const asVaultMode = (v: unknown): VaultMode => (v === 'USD' || v === 'IQD' ? v : 'ask');

export async function expenseConfig() {
  const s = await getSettings();
  return { vaultMode: asVaultMode(s.expenseVaultMode), pinRequired: !!s.expensePinHash };
}

export async function updateExpenseSettings(input: { vaultMode?: unknown }, actor: Actor) {
  const vaultMode = asVaultMode(input.vaultMode);
  await getSettings();
  await prisma.appSettings.update({ where: { id: 1 }, data: { expenseVaultMode: vaultMode } });
  await audit({ user: actor, action: 'settings', module: 'expenses', reference: 'vault', after: { vaultMode } });
  return expenseConfig();
}

/** Owner only (checked by the route). Empty pin removes the PIN. */
export async function setExpensePin(input: { pin?: unknown }, actor: Actor) {
  const pin = typeof input.pin === 'string' ? input.pin.trim() : '';
  if (pin && !/^\d{4,8}$/.test(pin)) throw fieldError('pin', 'exp.pinFormat');
  await getSettings();
  await prisma.appSettings.update({ where: { id: 1 }, data: { expensePinHash: pin ? await bcrypt.hash(pin, 10) : null } });
  await audit({ user: actor, action: 'settings', module: 'expenses', reference: pin ? 'pin set' : 'pin removed' });
  return expenseConfig();
}

/** Creating an expense or a recurring rule needs the PIN when one is set. Wrong guesses are rate-limited. */
export async function checkExpensePin(pin: unknown, userId: string) {
  const s = await getSettings();
  if (!s.expensePinHash) return;
  const key = `pin:${userId}`;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  if ((await prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } })) >= 5) throw new AppError(429, 'exp.pinLocked');
  const ok = typeof pin === 'string' && pin.length > 0 && (await bcrypt.compare(pin, s.expensePinHash));
  if (!ok) {
    await prisma.loginAttempt.create({ data: { key, success: false } });
    throw new AppError(403, 'exp.pinWrong');
  }
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

/** The vault that pays: fixed by Settings, or the one picked on the form. */
async function payingVault(v: Validator, input: unknown): Promise<Currency> {
  const mode = asVaultMode((await getSettings()).expenseVaultMode);
  return mode === 'ask' ? reqCurrency(v, 'vault', input) : mode;
}

// ─── Categories ────────────────────────────────────────────────────────────────────────────────────
export type CategoryInput = { name?: string; unitEnabled?: boolean; unitName?: string };

export async function listCategories() {
  const rows = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { txns: true, rules: true } } } });
  return rows.map((c) => ({ id: c.id, name: c.name, unitEnabled: c.unitEnabled, unitName: c.unitName, used: c._count.txns + c._count.rules }));
}

export async function saveCategory(input: CategoryInput, actor: Actor, id?: string) {
  const v = new Validator();
  const name = cleanText(input.name, 60);
  const unitEnabled = input.unitEnabled === true;
  const unitName = unitEnabled ? cleanText(input.unitName, 30) : '';
  if (!name) v.add('name', 'v.required');
  if (unitEnabled && !unitName) v.add('unitName', 'v.required');
  v.throwIfAny();
  return withTx(async (tx) => {
    const key = nameKey(name);
    const clash = await tx.expenseCategory.findUnique({ where: { nameKey: key }, select: { id: true } });
    if (clash && clash.id !== id) throw fieldError('name', 'exp.catExists');
    const data = { name, nameKey: key, unitEnabled, unitName };
    if (id) {
      const before = await tx.expenseCategory.findUnique({ where: { id } });
      if (!before) throw notFound();
      const after = await tx.expenseCategory.update({ where: { id }, data });
      await audit({ user: actor, action: 'update', module: 'expenses', reference: `category:${name}`, before, after }, tx);
      return after;
    }
    const c = await tx.expenseCategory.create({ data });
    await audit({ user: actor, action: 'create', module: 'expenses', reference: `category:${name}`, after: c }, tx);
    return c;
  });
}

export async function deleteCategory(id: string, actor: Actor) {
  return withTx(async (tx) => {
    const c = await tx.expenseCategory.findUnique({ where: { id }, include: { _count: { select: { txns: true, rules: true } } } });
    if (!c) throw notFound();
    const n = c._count.txns + c._count.rules;
    if (n > 0) throw conflict('exp.catInUse', { n });
    await tx.expenseCategory.delete({ where: { id } });
    await audit({ user: actor, action: 'delete', module: 'expenses', reference: `category:${c.name}`, before: c }, tx);
  });
}

// ─── Expense (manual) ──────────────────────────────────────────────────────────────────────────────
export type ExpenseInput = {
  date?: string;
  categoryId?: string;
  note?: string;
  amount?: string;
  unitPrice?: string;
  quantity?: string;
  vault?: string;
  recurring?: boolean;
  frequency?: string;
  skipFridays?: boolean;
  skipWeekdays?: unknown;
  skipDates?: unknown;
  pin?: string;
  allowShortfall?: boolean;
};

/** Create or edit a manual expense. Edit = reverse the old vault movement, then post the new one. */
export async function saveExpense(input: ExpenseInput, actor: Actor, editId?: string): Promise<Saved> {
  const v = new Validator();
  const date = reqDate(v, 'date', input.date);
  if (!input.categoryId) v.add('categoryId', 'exp.categoryRequired');
  const vault = await payingVault(v, input.vault);
  const cat = input.categoryId ? await prisma.expenseCategory.findUnique({ where: { id: input.categoryId } }) : null;
  if (input.categoryId && !cat) v.add('categoryId', 'exp.categoryRequired');
  const unitOn = !!cat?.unitEnabled;
  let amount = D(0);
  let unitPrice: Dec | null = null;
  let quantity: Dec | null = null;
  if (unitOn) {
    unitPrice = round4(reqPositive(v, 'unitPrice', input.unitPrice));
    quantity = round3(reqPositive(v, 'quantity', input.quantity));
    amount = roundMoney(unitPrice.times(quantity), vault);
  } else {
    amount = roundMoney(reqPositive(v, 'amount', input.amount), vault);
  }
  v.throwIfAny();
  if (!amount.gt(0)) throw fieldError(unitOn ? 'quantity' : 'amount', 'v.positive');

  return withTx(async (tx) => {
    await lockVaults(tx);
    const old = editId ? await tx.txn.findUnique({ where: { id: editId } }) : null;
    if (editId && (!old || old.deletedAt || old.kind !== 'EXPENSE')) throw notFound();
    const before = old ? await snapshotTxn(tx, old.id) : null;
    if (old) await reverseEffects(tx, { txnId: old.id, kind: old.kind, date: old.date });

    const rate = old ? D(old.rate) : await currentRate(tx);
    const data = {
      date,
      currency: vault,
      rate: rate.toString(),
      total: amount.toString(),
      totalUsd: round2(toUsd(amount, vault, rate)).toString(),
      vault,
      vaultAmount: amount.toString(),
      label: cat!.name,
      categoryId: cat!.id,
      unitName: unitOn ? cat!.unitName : '',
      unitPrice: unitPrice?.toString() ?? null,
      quantity: quantity?.toString() ?? null,
      notes: cleanMultiline(input.note, 500),
    };
    let id: string;
    let number: string;
    if (old) {
      await tx.txn.update({ where: { id: old.id }, data: { ...data, updatedById: actor.id, updatedByName: actor.name } });
      id = old.id;
      number = old.number;
    } else {
      number = await nextNumber(tx, 'EXPENSE');
      const t = await tx.txn.create({
        data: { ...data, number, kind: 'EXPENSE', createdById: actor.id, createdByName: actor.name, updatedById: actor.id, updatedByName: actor.name },
      });
      id = t.id;
    }
    // Not enough in the vault: pay what's there, the rest becomes an unpaid due (only after the user confirms).
    await payOut(tx, { txnId: id, kind: 'EXPENSE', date }, vault, amount, input.allowShortfall === true);
    await audit({ user: actor, action: old ? 'update' : 'create', module: 'expenses', reference: number, before, after: await snapshotTxn(tx, id) }, tx);
    return { id, number };
  });
}

// ─── Recurring rules ───────────────────────────────────────────────────────────────────────────────
const FREQ: Record<string, RecurFrequency> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY' };

function cleanSkips(input: ExpenseInput) {
  const weekdays = Array.isArray(input.skipWeekdays)
    ? [...new Set(input.skipWeekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : [];
  const dates = Array.isArray(input.skipDates) ? [...new Set(input.skipDates.filter(isValidIsoDate))].sort().slice(0, 366) : [];
  return { skipFridays: input.skipFridays === true, skipWeekdays: weekdays, skipDates: dates };
}

export async function createRule(input: ExpenseInput, actor: Actor) {
  const v = new Validator();
  const start = isValidIsoDate(input.date) ? input.date : (v.add('date', 'v.date'), todayIso());
  if (!input.categoryId) v.add('categoryId', 'exp.categoryRequired');
  const vault = await payingVault(v, input.vault);
  const amount = roundMoney(reqPositive(v, 'amount', input.amount), vault);
  const frequency = FREQ[String(input.frequency ?? 'monthly')] ?? 'MONTHLY';
  const cat = input.categoryId ? await prisma.expenseCategory.findUnique({ where: { id: input.categoryId } }) : null;
  if (input.categoryId && !cat) v.add('categoryId', 'exp.categoryRequired');
  v.throwIfAny();
  if (!amount.gt(0)) throw fieldError('amount', 'v.positive');
  const skips = cleanSkips(input);
  const state: RecurState = start > todayIso() ? 'SCHEDULED' : 'ACTIVE';
  const rule = await prisma.recurringExpense.create({
    data: {
      categoryId: cat!.id,
      amount: amount.toString(),
      vault,
      frequency,
      state,
      startDate: isoToDb(start),
      nextRun: isoToDb(start),
      note: cleanMultiline(input.note, 500),
      ...skips,
      createdById: actor.id,
      createdByName: actor.name,
    },
  });
  await audit({ user: actor, action: 'create', module: 'expenses', reference: `recurring:${cat!.name}`, after: rule });
  await runRecurringExpenses();
  return { id: rule.id };
}

export async function listRules() {
  const rows = await prisma.recurringExpense.findMany({ orderBy: { createdAt: 'desc' }, include: { category: { select: { name: true } } } });
  return rows.map((r) => ({
    id: r.id,
    category: r.category.name,
    amount: r.amount.toString(),
    vault: r.vault,
    frequency: r.frequency,
    state: r.state,
    startDate: dbToIso(r.startDate),
    nextRun: dbToIso(r.nextRun),
    note: r.note,
    dueFlag: r.dueFlag,
    dueReason: r.dueReason,
    skipFridays: r.skipFridays,
    skipWeekdays: r.skipWeekdays,
    skipDates: r.skipDates,
  }));
}
export type RuleRow = Awaited<ReturnType<typeof listRules>>[number];

/** Pause ↔ resume. Resuming a rule whose start date is still ahead puts it back to "scheduled". */
export async function toggleRule(id: string, actor: Actor) {
  const r = await prisma.recurringExpense.findUnique({ where: { id } });
  if (!r) throw notFound();
  const state: RecurState = r.state === 'PAUSED' ? (dbToIso(r.startDate) > todayIso() ? 'SCHEDULED' : 'ACTIVE') : 'PAUSED';
  await prisma.recurringExpense.update({ where: { id }, data: { state } });
  await audit({ user: actor, action: 'update', module: 'expenses', reference: `recurring:${id}`, before: { state: r.state }, after: { state } });
  if (state !== 'PAUSED') await runRecurringExpenses();
  return { state };
}

/** Deleting a rule stops future postings; expenses it already posted stay (they are real vault movements). */
export async function deleteRule(id: string, actor: Actor) {
  const r = await prisma.recurringExpense.findUnique({ where: { id } });
  if (!r) throw notFound();
  await prisma.recurringExpense.delete({ where: { id } });
  await audit({ user: actor, action: 'delete', module: 'expenses', reference: `recurring:${id}`, before: r });
}

// ─── Scheduler ─────────────────────────────────────────────────────────────────────────────────────
type Step = 'posted' | 'wait' | 'failed' | 'stop';

/** One posting attempt for one rule, in its own transaction (row-locked, so two runs can't double-post). */
async function stepRule(ruleId: string, today: string): Promise<Step> {
  return withTx(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RecurringExpense" WHERE "id" = ${ruleId} FOR UPDATE`;
    const rule = await tx.recurringExpense.findUnique({ where: { id: ruleId }, include: { category: true } });
    if (!rule || (rule.state !== 'ACTIVE' && rule.state !== 'SCHEDULED')) return 'stop';
    if (rule.state === 'SCHEDULED' && dbToIso(rule.startDate) > today) return 'stop';
    let next = dbToIso(rule.nextRun);
    if (next > today) return 'stop';

    // Skip-days: move forward one period at a time until an allowed day.
    const anchor = Number(dbToIso(rule.startDate).slice(8, 10));
    for (let guard = 0; isSkippedDay(next, rule) && guard < 1000; guard++) next = addPeriod(next, rule.frequency, anchor);
    if (next > today) {
      await tx.recurringExpense.update({ where: { id: rule.id }, data: { nextRun: isoToDb(next), dueFlag: false, dueReason: '' } });
      return 'wait';
    }

    await lockVaults(tx);
    const amount = D(rule.amount);
    const bal = await vaultBalance(tx, rule.vault);
    if (bal.lt(amount)) {
      await tx.recurringExpense.update({
        where: { id: rule.id },
        data: { dueFlag: true, dueReason: `insufficient:${rule.vault}`, nextRun: isoToDb(next), state: 'ACTIVE' },
      });
      return 'failed';
    }

    const runKey = `${rule.id}:${next}`;
    if (await tx.txn.findUnique({ where: { runKey }, select: { id: true } })) {
      await tx.recurringExpense.update({ where: { id: rule.id }, data: { nextRun: isoToDb(addPeriod(next, rule.frequency, anchor)) } });
      return 'posted';
    }
    const rate = await currentRate(tx);
    const date = isoToDb(next);
    const number = await nextNumber(tx, 'EXPENSE');
    const t = await tx.txn.create({
      data: {
        number,
        kind: 'EXPENSE',
        date,
        currency: rule.vault,
        rate: rate.toString(),
        total: amount.toString(),
        totalUsd: round2(toUsd(amount, rule.vault, rate)).toString(),
        vault: rule.vault,
        vaultAmount: amount.toString(),
        label: rule.category.name,
        categoryId: rule.categoryId,
        notes: rule.note,
        recurringId: rule.id,
        runKey,
        createdById: rule.createdById,
        createdByName: rule.createdByName,
        updatedById: rule.createdById,
        updatedByName: rule.createdByName,
      },
    });
    const src: Src = { txnId: t.id, kind: 'EXPENSE', date };
    await vaultMove(tx, src, rule.vault, 'OUT', amount);
    await tx.recurringExpense.update({
      where: { id: rule.id },
      data: { nextRun: isoToDb(addPeriod(next, rule.frequency, anchor)), state: 'ACTIVE', dueFlag: false, dueReason: '' },
    });
    await audit({ user: null, action: 'create', module: 'expenses', reference: `${number} (recurring)`, after: await snapshotTxn(tx, t.id) }, tx);
    return 'posted';
  });
}

/**
 * Posts every recurring expense that is due (catching up missed periods), skipping excluded days. A rule
 * that can't post (not enough money) is flagged "Due" with the reason and retried on the next run.
 */
export async function runRecurringExpenses(): Promise<number> {
  const today = todayIso();
  const due = await prisma.recurringExpense.findMany({
    where: { state: { in: ['ACTIVE', 'SCHEDULED'] }, nextRun: { lte: isoToDb(today) } },
    select: { id: true },
  });
  let posted = 0;
  for (const { id } of due) {
    for (let i = 0; i < 400; i++) {
      const r = await stepRule(id, today);
      if (r !== 'posted') break;
      posted++;
    }
  }
  return posted;
}

