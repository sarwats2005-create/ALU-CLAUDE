import 'server-only';
import { duesSummary } from '../dues';
import type { Currency } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D, Dec, round2 } from '@/lib/money';
import { addDaysIso, dbToIso, isValidIsoDate, lastMonths, todayIso } from '@/lib/dates';
import { currentRate } from '../common';
import { recentByKind } from './history';
import { sql, where, like, isKind, n, s } from './sql';

/** Main factory vault when `ownerUserId` is null; otherwise that staff user's personal wallets. */
export async function vaultBalances(ownerUserId: string | null = null) {
  const g = await prisma.vaultEntry.groupBy({
    by: ['vault', 'direction'],
    where: { ownerUserId },
    _sum: { amount: true },
  });
  const bal: Record<Currency, Dec> = { USD: new Dec(0), IQD: new Dec(0) };
  for (const r of g) bal[r.vault] = r.direction === 'IN' ? bal[r.vault].plus(D(r._sum.amount)) : bal[r.vault].minus(D(r._sum.amount));
  return bal;
}

/**
 * Monthly sales / cost / profit for the given month keys (YYYY-MM).
 * profit = sales − cost of the aluminium sold − expenses − salaries (the real, net profit of the month).
 */
export async function monthlyProfit(months: string[]) {
  if (!months.length) return [];
  const from = `${months[0]}-01`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT to_char(date, 'YYYY-MM') AS m,
      COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "totalUsd" ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "cogsUsd" ELSE 0 END),0) AS cogs,
      COALESCE(SUM(CASE WHEN kind = 'EXPENSE' THEN "totalUsd" ELSE 0 END),0) AS expenses,
      COALESCE(SUM(CASE WHEN kind = 'SALARY' THEN "totalUsd" ELSE 0 END),0) AS salaries,
      COUNT(*) FILTER (WHERE kind = 'SALE') AS cnt
    FROM "Txn" WHERE kind IN ('SALE','EXPENSE','SALARY') AND "deletedAt" IS NULL AND date >= ${from}::date
    GROUP BY 1`;
  const by = new Map(rows.map((r) => [String(r.m), r]));
  return months.map((m) => {
    const r = by.get(m);
    const revenue = D(s(r?.revenue));
    const cogs = D(s(r?.cogs));
    const expenses = D(s(r?.expenses));
    const salaries = D(s(r?.salaries));
    return {
      month: m,
      revenue: revenue.toString(),
      cogs: round2(cogs).toString(),
      expenses: round2(expenses).toString(),
      salaries: round2(salaries).toString(),
      grossProfit: round2(revenue.minus(cogs)).toString(),
      profit: round2(revenue.minus(cogs).minus(expenses).minus(salaries)).toString(),
      count: n(r?.cnt),
    };
  });
}

export async function dashboard() {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const months = lastMonths(today, 12);
  const [rate, vaults, salesAgg, monthAgg, topCustomers, topBens, monthly, recent, recv, pay, expAgg, dues, staffCash, staffDues, costAgg, salMonthAgg, stockAgg] = await Promise.all([
    currentRate(),
    vaultBalances(),
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM("totalUsd"),0) AS revenue, COALESCE(SUM("cogsUsd"),0) AS cogs, COUNT(*) AS cnt
      FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM("totalUsd"),0) AS revenue, COUNT(*) AS cnt
      FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL AND date >= ${monthStart}::date AND date <= ${today}::date`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT c.id, c.name, SUM(t."totalUsd") AS value, COUNT(*) AS cnt
      FROM "Txn" t JOIN "Customer" c ON c.id = t."customerId"
      WHERE t.kind = 'SALE' AND t."deletedAt" IS NULL
      GROUP BY c.id, c.name ORDER BY value DESC, c.name ASC LIMIT 5`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.name, COUNT(*) AS cnt,
             COALESCE(SUM(CASE WHEN t.kind = 'PURCHASE' THEN t."totalUsd" END),0) AS value
      FROM "Txn" t JOIN "Beneficiary" b ON b.id = t."beneficiaryId"
      WHERE t."deletedAt" IS NULL
      GROUP BY b.id, b.name ORDER BY cnt DESC, value DESC, b.name ASC LIMIT 5`,
    monthlyProfit(months),
    recentByKind(3),
    // What customers owe the factory (sum of positive customer balances) …
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(b),0) AS total, COUNT(*) AS cnt FROM (
        SELECT "customerId", SUM("amountUsd") AS b FROM "PartyEntry" WHERE "customerId" IS NOT NULL GROUP BY 1
      ) x WHERE b > 0`,
    // … and what the factory owes its beneficiaries (positive beneficiary balances).
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(b),0) AS total, COUNT(*) AS cnt FROM (
        SELECT "beneficiaryId", SUM("amountUsd") AS b FROM "PartyEntry" WHERE "beneficiaryId" IS NOT NULL GROUP BY 1
      ) x WHERE b > 0`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM("totalUsd"),0) AS total, COUNT(*) AS cnt
      FROM "Txn" WHERE kind = 'EXPENSE' AND "deletedAt" IS NULL AND date >= ${monthStart}::date AND date <= ${today}::date`,
    duesSummary(),
    // Cash the owner handed to staff: every personal vault together.
    prisma.vaultEntry.groupBy({ by: ['vault', 'direction'], where: { ownerUserId: { not: null } }, _sum: { amount: true } }),
    prisma.vaultDue.findMany({ where: { settledAt: null, ownerUserId: { not: null }, txn: { deletedAt: null } }, select: { vault: true, amount: true, paid: true } }),
    // Every expense and salary ever recorded (USD at each document's rate): part of the total cost.
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(CASE WHEN kind = 'EXPENSE' THEN "totalUsd" ELSE 0 END),0) AS expenses,
             COALESCE(SUM(CASE WHEN kind = 'SALARY' THEN "totalUsd" ELSE 0 END),0) AS salaries
      FROM "Txn" WHERE kind IN ('EXPENSE','SALARY') AND "deletedAt" IS NULL`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM("totalUsd"),0) AS total, COUNT(*) AS cnt
      FROM "Txn" WHERE kind = 'SALARY' AND "deletedAt" IS NULL AND date >= ${monthStart}::date AND date <= ${today}::date`,
    // Aluminium in stock (raw + finished, every inventory) at what it cost to buy — never at its sale price.
    prisma.stockEntry.aggregate({ _sum: { valueUsd: true } }),
  ]);
  const revenue = D(s(salesAgg[0]?.revenue));
  const staff: Record<Currency, Dec> = { USD: new Dec(0), IQD: new Dec(0) };
  for (const r of staffCash) staff[r.vault] = r.direction === 'IN' ? staff[r.vault].plus(D(r._sum.amount)) : staff[r.vault].minus(D(r._sum.amount));
  const staffDuesUsd = staffDues.reduce((t, d) => {
    const left = D(d.amount).minus(D(d.paid));
    return t.plus(d.vault === 'USD' ? left : left.div(rate));
  }, new Dec(0));
  const cogs = D(s(salesAgg[0]?.cogs));
  const iqdInUsd = round2(vaults.IQD.div(rate));
  // Money position: what the factory really has once debts on both sides are counted.
  const mainCashUsd = vaults.USD.plus(vaults.IQD.div(rate));
  const staffCashUsd = staff.USD.plus(staff.IQD.div(rate));
  const receivable = D(s(recv[0]?.total));
  const payable = D(s(pay[0]?.total));
  const duesUsd = dues.USD.total.plus(dues.IQD.total.div(rate)).plus(staffDuesUsd);
  const grossProfit = round2(revenue.minus(cogs));
  const expensesAll = D(s(costAgg[0]?.expenses));
  const salariesAll = D(s(costAgg[0]?.salaries));
  // Total cost = cost of the aluminium sold (scrap loss included) + expenses + salaries.
  const totalCost = round2(cogs.plus(expensesAll).plus(salariesAll));
  const netProfit = round2(revenue.minus(totalCost));
  const stockValue = round2(D(stockAgg._sum.valueUsd));
  // Everything the factory still has to pay: suppliers + unpaid vault dues (unpaid salaries are dues too).
  const youOwe = payable.plus(duesUsd);
  // What the factory is worth: cash (main + staff) + customers owe + stock at cost − everything it owes.
  const factoryWorth = round2(mainCashUsd.plus(staffCashUsd).plus(receivable).plus(stockValue).minus(youOwe));
  return {
    rate: rate.toString(),
    cards: {
      salesMonth: D(s(monthAgg[0]?.revenue)).toString(),
      salesMonthCount: n(monthAgg[0]?.cnt),
      totalSales: revenue.toString(),
      totalSalesCount: n(salesAgg[0]?.cnt),
      grossProfit: grossProfit.toString(),
      revenue: revenue.toString(),
      cogs: round2(cogs).toString(),
      expensesAll: round2(expensesAll).toString(),
      salariesAll: round2(salariesAll).toString(),
      totalCost: totalCost.toString(),
      /** Sales − cost of the aluminium sold − expenses − salaries, all time. */
      netProfit: netProfit.toString(),
      salariesMonth: D(s(salMonthAgg[0]?.total)).toString(),
      salariesMonthCount: n(salMonthAgg[0]?.cnt),
      stockValue: stockValue.toString(),
      youOwe: round2(youOwe).toString(),
      factoryWorth: factoryWorth.toString(),
      vaultUsd: vaults.USD.toString(),
      vaultIqd: vaults.IQD.toString(),
      vaultIqdInUsd: iqdInUsd.toString(),
      vaultTotalUsd: round2(vaults.USD.plus(vaults.IQD.div(rate))).toString(),
      receivable: D(s(recv[0]?.total)).toString(),
      receivableCount: n(recv[0]?.cnt),
      payable: D(s(pay[0]?.total)).toString(),
      payableCount: n(pay[0]?.cnt),
      expensesMonth: D(s(expAgg[0]?.total)).toString(),
      expensesMonthCount: n(expAgg[0]?.cnt),
      duesUsd: dues.USD.total.toString(),
      duesIqd: dues.IQD.total.toString(),
      duesTotalUsd: round2(dues.USD.total.plus(dues.IQD.total.div(rate))).toString(),
      duesCount: dues.USD.count + dues.IQD.count,
      staffUsd: staff.USD.toString(),
      staffIqd: staff.IQD.toString(),
      staffTotalUsd: round2(staffCashUsd).toString(),
      allDuesUsd: round2(duesUsd).toString(),
      allDuesCount: dues.USD.count + dues.IQD.count + staffDues.length,
      mainVaultNegative: vaults.USD.isNegative() || vaults.IQD.isNegative(),
      bestCustomer: topCustomers[0] ? { id: String(topCustomers[0].id), name: String(topCustomers[0].name), value: s(topCustomers[0].value), count: n(topCustomers[0].cnt) } : null,
      bestBeneficiary: topBens[0] ? { id: String(topBens[0].id), name: String(topBens[0].name), count: n(topBens[0].cnt), value: s(topBens[0].value) } : null,
    },
    monthly,
    topCustomers: topCustomers.map((r) => ({ id: String(r.id), name: String(r.name), value: s(r.value), count: n(r.cnt) })),
    topBeneficiaries: topBens.map((r) => ({ id: String(r.id), name: String(r.name), value: s(r.value), count: n(r.cnt) })),
    recent: recent.slice(0, 6),
    hasAnyData: recent.length > 0,
  };
}

// ─── Vault page ────────────────────────────────────────────────────────────────────────────────────
export async function vaultOverview(ownerUserId: string | null = null) {
  const today = todayIso();
  const start = addDaysIso(today, -29);
  const rate = await currentRate();
  const out = [] as Array<{
    vault: Currency;
    balance: string;
    totalIn: string;
    totalOut: string;
    series: { date: string; value: string }[];
    last: { id: number; txnId: string; number: string; kind: string; direction: string; amount: string; date: string; isReversal: boolean; party: string; label: string; duePayment: boolean }[];
    usdEquivalent: string | null;
    /** Unpaid dues of this vault, and cash − dues. */
    dues: string;
    duesCount: number;
    net: string;
  }>;
  const dues = await duesSummary(ownerUserId);
  const ownerFilter = ownerUserId === null ? sql`e."ownerUserId" IS NULL` : sql`e."ownerUserId" = ${ownerUserId}`;
  for (const vault of ['USD', 'IQD'] as const) {
    const [nets, before, daily, last] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END),0) AS tin, COALESCE(SUM(CASE WHEN net < 0 THEN -net ELSE 0 END),0) AS tout,
               COALESCE(SUM(net),0) AS bal
        FROM (
          SELECT e."txnId", SUM(CASE WHEN e.direction = 'IN' THEN e.amount ELSE -e.amount END) AS net
          FROM "VaultEntry" e
          WHERE e.vault = ${vault}::"Currency" AND ${ownerFilter}
          GROUP BY e."txnId"
        ) x`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END),0) AS bal
        FROM "VaultEntry" e WHERE e.vault = ${vault}::"Currency" AND ${ownerFilter} AND e.date < ${start}::date`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT e.date, SUM(CASE WHEN e.direction = 'IN' THEN e.amount ELSE -e.amount END) AS net FROM "VaultEntry" e
        WHERE e.vault = ${vault}::"Currency" AND ${ownerFilter} AND e.date >= ${start}::date AND e.date <= ${today}::date GROUP BY e.date`,
      prisma.vaultEntry.findMany({
        where: { vault, ownerUserId },
        orderBy: { id: 'desc' },
        take: 5,
        include: { txn: { select: { number: true, kind: true, label: true, customer: { select: { name: true } }, beneficiary: { select: { name: true } } } } },
      }),
    ]);
    const byDay = new Map(daily.map((d) => [dbToIso(d.date as Date), D(s(d.net))]));
    let run = D(s(before[0]?.bal));
    const series: { date: string; value: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDaysIso(start, i);
      run = run.plus(byDay.get(d) ?? 0);
      series.push({ date: d, value: run.toString() });
    }
    const bal = D(s(nets[0]?.bal));
    out.push({
      vault,
      balance: bal.toString(),
      totalIn: s(nets[0]?.tin),
      totalOut: s(nets[0]?.tout),
      series,
      last: last.map((e) => ({
        id: e.id,
        txnId: e.txnId,
        number: e.txn.number,
        kind: e.sourceType,
        direction: e.direction,
        amount: e.amount.toString(),
        date: dbToIso(e.date),
        isReversal: e.isReversal,
        party: e.txn.customer?.name ?? e.txn.beneficiary?.name ?? '',
        label: e.txn.label,
        duePayment: !!e.dueId,
      })),
      usdEquivalent: vault === 'IQD' ? round2(bal.div(rate)).toString() : null,
      dues: dues[vault].total.toString(),
      duesCount: dues[vault].count,
      net: bal.minus(dues[vault].total).toString(),
    });
  }
  return { rate: rate.toString(), vaults: out };
}

export async function vaultHistory(p: {
  vault?: string;
  kind?: string;
  from?: string;
  to?: string;
  q?: string;
  sort: string;
  dir: 'asc' | 'desc';
  size: number;
  offset: number;
  ownerUserId?: string | null;
}) {
  const ownerUserId = p.ownerUserId === undefined ? null : p.ownerUserId;
  const conds = [
    ownerUserId === null ? sql`e."ownerUserId" IS NULL` : sql`e."ownerUserId" = ${ownerUserId}`,
    p.vault === 'USD' || p.vault === 'IQD' ? sql`e.vault = ${p.vault}::"Currency"` : null,
    isKind(p.kind) ? sql`e."sourceType" = ${p.kind}::"TxnKind"` : null,
    isValidIsoDate(p.from) ? sql`e.date >= ${p.from}::date` : null,
    isValidIsoDate(p.to) ? sql`e.date <= ${p.to}::date` : null,
    p.q ? sql`(t.number ILIKE ${like(p.q)} OR t.label ILIKE ${like(p.q)} OR c.name ILIKE ${like(p.q)} OR b.name ILIKE ${like(p.q)})` : null,
  ];
  const dir = p.dir === 'asc' ? sql`ASC` : sql`DESC`;
  const order = p.sort === 'date' ? sql`e.date ${dir}, e.id ${dir}` : p.sort === 'amount' ? sql`e.amount ${dir}, e.id DESC` : sql`e.id ${dir}`;
  const base = sql`FROM "VaultEntry" e JOIN "Txn" t ON t.id = e."txnId" LEFT JOIN "Customer" c ON c.id = t."customerId" LEFT JOIN "Beneficiary" b ON b.id = t."beneficiaryId" ${where(conds)}`;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.id, e.vault, e.direction, e.amount, e."balanceAfter", e.date, e."isReversal", e."sourceType", e."txnId", e."dueId",
             t.number, t.label, t."deletedAt", COALESCE(c.name, b.name, '') AS party
      ${base} ORDER BY ${order} LIMIT ${p.size} OFFSET ${p.offset}`,
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c ${base}`,
  ]);
  return {
    total: n(count[0]?.c),
    rows: rows.map((r) => ({
      id: n(r.id),
      vault: r.vault as Currency,
      direction: r.direction as 'IN' | 'OUT',
      amount: s(r.amount),
      balanceAfter: s(r.balanceAfter),
      date: dbToIso(r.date as Date),
      isReversal: !!r.isReversal,
      kind: String(r.sourceType),
      txnId: String(r.txnId),
      number: String(r.number),
      label: String(r.label ?? ''),
      party: String(r.party ?? ''),
      deleted: !!r.deletedAt,
      duePayment: !!r.dueId,
    })),
  };
}

/**
 * A staff user's own dashboard: their vault, their unpaid dues, their sales and their recent documents.
 * No factory totals, no cost of goods and no profit.
 */
export async function staffDashboard(userId: string) {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const months = lastMonths(today, 6);
  const [rate, vaults, dues, overview, monthAgg, byMonth, recent] = await Promise.all([
    currentRate(),
    vaultBalances(userId),
    duesSummary(userId),
    vaultOverview(userId),
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM("totalUsd"),0) AS revenue, COUNT(*) AS cnt, COALESCE(SUM("cashPaidUsd"),0) AS cash
      FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL AND "createdById" = ${userId}
        AND date >= ${monthStart}::date AND date <= ${today}::date`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(date, 'YYYY-MM') AS m, COALESCE(SUM("totalUsd"),0) AS revenue, COUNT(*) AS cnt
      FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL AND "createdById" = ${userId} AND date >= ${`${months[0]}-01`}::date
      GROUP BY 1`,
    prisma.txn.findMany({
      where: { deletedAt: null, createdById: userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 8,
      select: { id: true, number: true, kind: true, date: true, total: true, currency: true, customer: { select: { name: true } }, beneficiary: { select: { name: true } }, label: true },
    }),
  ]);
  const by = new Map(byMonth.map((r) => [String(r.m), r]));
  return {
    rate: rate.toString(),
    vault: {
      USD: vaults.USD.toString(),
      IQD: vaults.IQD.toString(),
      totalUsd: round2(vaults.USD.plus(vaults.IQD.div(rate))).toString(),
      duesUsd: dues.USD.total.toString(),
      duesIqd: dues.IQD.total.toString(),
      duesCount: dues.USD.count + dues.IQD.count,
      series: overview.vaults.map((v) => ({ vault: v.vault, series: v.series })),
    },
    month: { sales: D(s(monthAgg[0]?.revenue)).toString(), count: n(monthAgg[0]?.cnt), cash: D(s(monthAgg[0]?.cash)).toString() },
    salesByMonth: months.map((m) => ({ month: m, revenue: D(s(by.get(m)?.revenue)).toString(), count: n(by.get(m)?.cnt) })),
    recent: recent.map((t) => ({
      id: t.id,
      number: t.number,
      kind: t.kind,
      date: dbToIso(t.date),
      total: t.total.toString(),
      currency: t.currency,
      party: t.customer?.name ?? t.beneficiary?.name ?? t.label ?? '',
    })),
  };
}
export type StaffDashboard = Awaited<ReturnType<typeof staffDashboard>>;

/**
 * The owner's money position in USD: what customers owe, what the factory owes suppliers, unpaid vault dues
 * (main + staff) and cash held by staff. Shown on the vault page so debts are never out of sight.
 */
export async function moneyPosition() {
  const [rate, recv, pay, dues, staffCash] = await Promise.all([
    currentRate(),
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(b),0) AS total, COUNT(*) AS cnt FROM (
        SELECT "customerId", SUM("amountUsd") AS b FROM "PartyEntry" WHERE "customerId" IS NOT NULL GROUP BY 1
      ) x WHERE b > 0`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(b),0) AS total, COUNT(*) AS cnt FROM (
        SELECT "beneficiaryId", SUM("amountUsd") AS b FROM "PartyEntry" WHERE "beneficiaryId" IS NOT NULL GROUP BY 1
      ) x WHERE b > 0`,
    prisma.vaultDue.findMany({ where: { settledAt: null, txn: { deletedAt: null } }, select: { vault: true, amount: true, paid: true } }),
    prisma.vaultEntry.groupBy({ by: ['vault', 'direction'], where: { ownerUserId: { not: null } }, _sum: { amount: true } }),
  ]);
  let duesUsd = new Dec(0);
  for (const d of dues) {
    const left = D(d.amount).minus(D(d.paid));
    duesUsd = duesUsd.plus(d.vault === 'USD' ? left : left.div(rate));
  }
  const staff: Record<Currency, Dec> = { USD: new Dec(0), IQD: new Dec(0) };
  for (const r of staffCash) staff[r.vault] = r.direction === 'IN' ? staff[r.vault].plus(D(r._sum.amount)) : staff[r.vault].minus(D(r._sum.amount));
  return {
    receivable: D(s(recv[0]?.total)).toString(),
    receivableCount: n(recv[0]?.cnt),
    payable: D(s(pay[0]?.total)).toString(),
    payableCount: n(pay[0]?.cnt),
    duesUsd: round2(duesUsd).toString(),
    duesCount: dues.length,
    staffUsd: round2(staff.USD.plus(staff.IQD.div(rate))).toString(),
  };
}
export type MoneyPosition = Awaited<ReturnType<typeof moneyPosition>>;
