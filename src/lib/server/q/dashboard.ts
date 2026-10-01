import 'server-only';
import { duesSummary } from '../dues';
import type { Currency } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D, Dec, round2 } from '@/lib/money';
import { addDaysIso, dbToIso, isValidIsoDate, lastMonths, todayIso } from '@/lib/dates';
import { currentRate } from '../common';
import { recentByKind } from './history';
import { sql, where, like, isKind, n, s } from './sql';

export async function vaultBalances() {
  const g = await prisma.vaultEntry.groupBy({ by: ['vault', 'direction'], _sum: { amount: true } });
  const bal: Record<Currency, Dec> = { USD: new Dec(0), IQD: new Dec(0) };
  for (const r of g) bal[r.vault] = r.direction === 'IN' ? bal[r.vault].plus(D(r._sum.amount)) : bal[r.vault].minus(D(r._sum.amount));
  return bal;
}

/** Monthly revenue / COGS / profit for the given month keys (YYYY-MM). */
export async function monthlyProfit(months: string[]) {
  if (!months.length) return [];
  const from = `${months[0]}-01`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT to_char(date, 'YYYY-MM') AS m, COALESCE(SUM("totalUsd"),0) AS revenue, COALESCE(SUM("cogsUsd"),0) AS cogs, COUNT(*) AS cnt
    FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL AND date >= ${from}::date
    GROUP BY 1`;
  const by = new Map(rows.map((r) => [String(r.m), r]));
  return months.map((m) => {
    const r = by.get(m);
    const revenue = D(s(r?.revenue));
    const cogs = D(s(r?.cogs));
    return { month: m, revenue: revenue.toString(), cogs: round2(cogs).toString(), profit: round2(revenue.minus(cogs)).toString(), count: n(r?.cnt) };
  });
}

export async function dashboard() {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const months = lastMonths(today, 12);
  const [rate, vaults, salesAgg, monthAgg, topCustomers, topBens, monthly, recent] = await Promise.all([
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
  ]);
  const revenue = D(s(salesAgg[0]?.revenue));
  const cogs = D(s(salesAgg[0]?.cogs));
  const iqdInUsd = round2(vaults.IQD.div(rate));
  return {
    rate: rate.toString(),
    cards: {
      salesMonth: D(s(monthAgg[0]?.revenue)).toString(),
      salesMonthCount: n(monthAgg[0]?.cnt),
      totalSales: revenue.toString(),
      totalSalesCount: n(salesAgg[0]?.cnt),
      profit: round2(revenue.minus(cogs)).toString(),
      revenue: revenue.toString(),
      cogs: round2(cogs).toString(),
      vaultUsd: vaults.USD.toString(),
      vaultIqd: vaults.IQD.toString(),
      vaultIqdInUsd: iqdInUsd.toString(),
      vaultTotalUsd: round2(vaults.USD.plus(vaults.IQD.div(rate))).toString(),
      bestCustomer: topCustomers[0] ? { id: String(topCustomers[0].id), name: String(topCustomers[0].name), value: s(topCustomers[0].value), count: n(topCustomers[0].cnt) } : null,
      bestBeneficiary: topBens[0] ? { id: String(topBens[0].id), name: String(topBens[0].name), count: n(topBens[0].cnt), value: s(topBens[0].value) } : null,
    },
    monthly,
    topCustomers: topCustomers.map((r) => ({ id: String(r.id), name: String(r.name), value: s(r.value), count: n(r.cnt) })),
    topBeneficiaries: topBens.map((r) => ({ id: String(r.id), name: String(r.name), value: s(r.value), count: n(r.cnt) })),
    recent,
    hasAnyData: recent.length > 0,
  };
}

// ─── Vault page ────────────────────────────────────────────────────────────────────────────────────
export async function vaultOverview() {
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
  const dues = await duesSummary();
  for (const vault of ['USD', 'IQD'] as const) {
    const [nets, before, daily, last] = await Promise.all([
      // Net effect per document: deleted documents net to zero, edited ones to their current effect.
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END),0) AS tin, COALESCE(SUM(CASE WHEN net < 0 THEN -net ELSE 0 END),0) AS tout,
               COALESCE(SUM(net),0) AS bal
        FROM (SELECT "txnId", SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS net FROM "VaultEntry" WHERE vault = ${vault}::"Currency" GROUP BY "txnId") x`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END),0) AS bal FROM "VaultEntry" WHERE vault = ${vault}::"Currency" AND date < ${start}::date`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT date, SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS net FROM "VaultEntry"
        WHERE vault = ${vault}::"Currency" AND date >= ${start}::date AND date <= ${today}::date GROUP BY date`,
      prisma.vaultEntry.findMany({
        where: { vault },
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

export async function vaultHistory(p: { vault?: string; kind?: string; from?: string; to?: string; q?: string; sort: string; dir: 'asc' | 'desc'; size: number; offset: number }) {
  const conds = [
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
