import 'server-only';
import type { TxnKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D, Dec, round2 } from '@/lib/money';
import { dbToIso, todayIso, daysBetween } from '@/lib/dates';
import { notFound } from '../errors';
import { sql, join, where, like, n, s, type Sql } from './sql';

export type PartyKind = 'customer' | 'beneficiary';
export type BalanceFilter = '' | 'owes' | 'settled' | 'credit';

// ─── Lists ─────────────────────────────────────────────────────────────────────────────────────────
export async function listParties(
  kind: PartyKind,
  p: { q: string; state: BalanceFilter; sort: string; dir: 'asc' | 'desc'; size: number; offset: number },
) {
  const isC = kind === 'customer';
  const table = isC ? sql`"Customer"` : sql`"Beneficiary"`;
  const fk = isC ? sql`"customerId"` : sql`"beneficiaryId"`;
  const mainKind = isC ? 'SALE' : 'PURCHASE';
  const conds: Sql[] = [];
  if (p.q) conds.push(sql`(x.name ILIKE ${like(p.q)} OR x.phone ILIKE ${like(p.q)})`);
  if (p.state === 'owes') conds.push(sql`COALESCE(b.bal,0) > 0`);
  if (p.state === 'settled') conds.push(sql`COALESCE(b.bal,0) = 0`);
  if (p.state === 'credit') conds.push(sql`COALESCE(b.bal,0) < 0`);
  const order =
    p.sort === 'balance'
      ? sql`COALESCE(b.bal,0)`
      : p.sort === 'total'
        ? sql`COALESCE(t.total,0)`
        : p.sort === 'count'
          ? sql`COALESCE(t.cnt,0)`
          : p.sort === 'createdAt'
            ? sql`x."createdAt"`
            : sql`lower(x.name)`;
  const dir = p.dir === 'asc' ? sql`ASC` : sql`DESC`;
  const base = sql`
    FROM ${table} x
    LEFT JOIN (SELECT ${fk} AS pid, SUM("amountUsd") AS bal FROM "PartyEntry" WHERE ${fk} IS NOT NULL GROUP BY ${fk}) b ON b.pid = x.id
    LEFT JOIN (
      SELECT ${fk} AS pid,
             SUM(CASE WHEN kind = ${mainKind}::"TxnKind" THEN "totalUsd" ELSE 0 END) AS total,
             SUM(CASE WHEN kind = ${mainKind}::"TxnKind" THEN 1 ELSE 0 END) AS main_cnt,
             COUNT(*) AS cnt
      FROM "Txn" WHERE ${fk} IS NOT NULL AND "deletedAt" IS NULL GROUP BY ${fk}
    ) t ON t.pid = x.id
    ${where(conds)}`;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT x.id, x.name, x.phone, x.address, x."isDemo", x."updatedAt",
             ${isC ? sql`(x.avatar IS NOT NULL)` : sql`false`} AS "hasAvatar",
             COALESCE(b.bal,0) AS balance, COALESCE(t.total,0) AS total, COALESCE(t.main_cnt,0) AS "mainCount", COALESCE(t.cnt,0) AS "txCount"
      ${base}
      ORDER BY ${order} ${dir}, x.id ASC
      LIMIT ${p.size} OFFSET ${p.offset}`,
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c ${base}`,
  ]);
  // Totals over ALL parties (not the current filter), for the summary strip that doubles as the filter.
  const sum = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COUNT(*) AS all_n,
           COUNT(*) FILTER (WHERE bal > 0) AS owes_n, COALESCE(SUM(bal) FILTER (WHERE bal > 0), 0) AS owes,
           COUNT(*) FILTER (WHERE bal < 0) AS credit_n, COALESCE(-SUM(bal) FILTER (WHERE bal < 0), 0) AS credit,
           COUNT(*) FILTER (WHERE bal = 0) AS settled_n
    FROM (SELECT x.id, COALESCE(b.bal, 0) AS bal FROM ${table} x
          LEFT JOIN (SELECT ${fk} AS pid, SUM("amountUsd") AS bal FROM "PartyEntry" WHERE ${fk} IS NOT NULL GROUP BY ${fk}) b ON b.pid = x.id) z`;
  const z = sum[0] ?? {};
  return {
    summary: {
      all: n(z.all_n),
      owes: round2(D(s(z.owes))).toString(),
      owesCount: n(z.owes_n),
      credit: round2(D(s(z.credit))).toString(),
      creditCount: n(z.credit_n),
      settledCount: n(z.settled_n),
    },
    total: n(count[0]?.c),
    rows: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      phone: String(r.phone ?? ''),
      address: String(r.address ?? ''),
      isDemo: !!r.isDemo,
      hasAvatar: !!r.hasAvatar,
      avatarV: r.updatedAt ? new Date(r.updatedAt as Date).getTime() : 0,
      balance: round2(D(s(r.balance))).toString(),
      total: round2(D(s(r.total))).toString(),
      mainCount: n(r.mainCount),
      txCount: n(r.txCount),
    })),
  };
}

/** Lightweight selector source (POS, payments, filters): name + current balance. */
export async function lookupParties(kind: PartyKind, q: string, limit = 20, ids: string[] = []) {
  const isC = kind === 'customer';
  const table = isC ? sql`"Customer"` : sql`"Beneficiary"`;
  const fk = isC ? sql`"customerId"` : sql`"beneficiaryId"`;
  const cond = ids.length ? sql`x.id IN (${join(ids)})` : q ? sql`(x.name ILIKE ${like(q)} OR x.phone ILIKE ${like(q)})` : null;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT x.id, x.name, x.phone, x."isDemo", COALESCE(b.bal,0) AS balance
    FROM ${table} x
    LEFT JOIN (SELECT ${fk} AS pid, SUM("amountUsd") AS bal FROM "PartyEntry" WHERE ${fk} IS NOT NULL GROUP BY ${fk}) b ON b.pid = x.id
    ${where([cond])}
    ORDER BY lower(x.name) ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), phone: String(r.phone ?? ''), isDemo: !!r.isDemo, balance: round2(D(s(r.balance))).toString() }));
}

// ─── Statement (account page + PDF) ────────────────────────────────────────────────────────────────
export type StatementRow = {
  id: string;
  number: string;
  date: string;
  kind: TxnKind;
  details: string;
  currency: 'USD' | 'IQD';
  amount: string;
  cash: string;
  effectUsd: string;
  running: string;
  rate: string;
  vault: string | null;
  isDemo: boolean;
};

/** Every document for the party, oldest first, with the ledger-derived effect and running balance. */
export async function statementRows(kind: PartyKind, id: string): Promise<StatementRow[]> {
  const fk = kind === 'customer' ? sql`"customerId"` : sql`"beneficiaryId"`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT t.id, t.number, t.date, t.kind, t.currency, t.total, t."cashPaid", t.rate, t.vault, t."isDemo", t."createdAt",
           COALESCE(pe.eff, 0) AS eff,
           COALESCE((
             SELECT string_agg(p.name || ' (' || p.sku || ') ' || trim(to_char(l.kg, 'FM999G999G990D00')) || ' kg', ', ' ORDER BY l.position)
             FROM "TxnLine" l JOIN "Product" p ON p.id = l."productId" WHERE l."txnId" = t.id
           ), '') AS details
    FROM "Txn" t
    LEFT JOIN (SELECT "txnId", SUM("amountUsd") AS eff FROM "PartyEntry" GROUP BY "txnId") pe ON pe."txnId" = t.id
    WHERE t.${fk} = ${id} AND t."deletedAt" IS NULL
    ORDER BY t.date ASC, t."createdAt" ASC, t.number ASC`;
  let running = new Dec(0);
  return rows.map((r) => {
    const eff = D(s(r.eff));
    running = running.plus(eff);
    return {
      id: String(r.id),
      number: String(r.number),
      date: dbToIso(r.date as Date),
      kind: r.kind as TxnKind,
      details: String(r.details ?? ''),
      currency: r.currency as 'USD' | 'IQD',
      amount: s(r.total),
      cash: s(r.cashPaid),
      effectUsd: eff.toString(),
      running: running.toString(),
      rate: s(r.rate),
      vault: (r.vault as string) ?? null,
      isDemo: !!r.isDemo,
    };
  });
}

export async function partyDetail(kind: PartyKind, id: string) {
  const isC = kind === 'customer';
  const party = isC
    ? await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true, phone: true, address: true, isDemo: true, updatedAt: true, avatar: true } })
    : await prisma.beneficiary.findUnique({ where: { id }, select: { id: true, name: true, phone: true, address: true, isDemo: true, updatedAt: true } });
  if (!party) throw notFound();
  const fk = isC ? sql`"customerId"` : sql`"beneficiaryId"`;
  const agg = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COALESCE(SUM(CASE WHEN kind IN ('SALE','PURCHASE') THEN "totalUsd" END),0) AS main_total,
      COALESCE(SUM(CASE WHEN kind IN ('SALE','PURCHASE') THEN "cashPaidUsd" END),0) AS main_cash,
      COALESCE(SUM(CASE WHEN kind IN ('CUSTOMER_PAYMENT','BENEFICIARY_PAYMENT') THEN "totalUsd" END),0) AS payments,
      COALESCE(SUM(CASE WHEN kind IN ('CUSTOMER_REFUND','BENEFICIARY_REFUND') THEN "totalUsd" END),0) AS refunds,
      COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "cogsUsd" END),0) AS cogs,
      COUNT(*) FILTER (WHERE kind IN ('SALE','PURCHASE')) AS main_count,
      COUNT(*) AS tx_count
    FROM "Txn" WHERE ${fk} = ${id} AND "deletedAt" IS NULL`;
  const kgRow = isC
    ? [{ kg: 0 }]
    : await prisma.$queryRaw<{ kg: unknown }[]>`
        SELECT COALESCE(SUM(l.kg),0) AS kg FROM "TxnLine" l JOIN "Txn" t ON t.id = l."txnId"
        WHERE t."beneficiaryId" = ${id} AND t."deletedAt" IS NULL AND t.kind = 'PURCHASE'`;
  const bal = await prisma.partyEntry.aggregate({ where: isC ? { customerId: id } : { beneficiaryId: id }, _sum: { amountUsd: true } });
  const a = agg[0] ?? {};
  const mainTotal = D(s(a.main_total));
  return {
    party: {
      id: party.id,
      name: party.name,
      phone: party.phone,
      address: party.address,
      isDemo: party.isDemo,
      hasAvatar: 'avatar' in party && !!party.avatar,
      avatarV: party.updatedAt.getTime(),
    },
    cards: {
      total: mainTotal.toString(),
      cashReceived: D(s(a.main_cash)).plus(D(s(a.payments))).toString(), // customers: cash received; beneficiaries: paid out
      refunds: D(s(a.refunds)).toString(),
      balance: round2(D(bal._sum.amountUsd)).toString(),
      profit: round2(mainTotal.minus(D(s(a.cogs)))).toString(),
      mainCount: n(a.main_count),
      txCount: n(a.tx_count),
      kg: s(kgRow[0]?.kg),
    },
  };
}

/** Filter + sort + paginate a statement in memory (running balance is always computed over the full history). */
export function pageStatement(
  rows: StatementRow[],
  p: { q: string; from?: string; to?: string; sort: string; dir: 'asc' | 'desc'; size: number; offset: number; kindLabel: (k: TxnKind) => string },
) {
  const q = p.q.toLocaleLowerCase();
  let out = rows.filter((r) => (!p.from || r.date >= p.from) && (!p.to || r.date <= p.to));
  if (q)
    out = out.filter(
      (r) => r.number.toLowerCase().includes(q) || r.details.toLocaleLowerCase().includes(q) || p.kindLabel(r.kind).toLocaleLowerCase().includes(q) || r.amount.includes(q),
    );
  const key = p.sort;
  const cmp = (a: StatementRow, b: StatementRow) => {
    let r = 0;
    if (key === 'number') r = a.number.localeCompare(b.number);
    else if (key === 'amount') r = D(a.amount).cmp(D(b.amount));
    else if (key === 'effect') r = D(a.effectUsd).cmp(D(b.effectUsd));
    else r = rows.indexOf(a) - rows.indexOf(b); // chronological
    return p.dir === 'asc' ? r : -r;
  };
  out = [...out].sort(cmp);
  return { total: out.length, rows: out.slice(p.offset, p.offset + p.size) };
}

/** Running balance over time (one point per day with activity). */
export function balanceSeries(rows: StatementRow[]) {
  const byDay = new Map<string, string>();
  for (const r of rows) byDay.set(r.date, r.running);
  return [...byDay.entries()].map(([date, value]) => ({ date, value }));
}

// ─── Aging (FIFO) ──────────────────────────────────────────────────────────────────────────────────
export type Aging = { b0: Dec; b31: Dec; b61: Dec; b90: Dec; total: Dec; oldestDays: number };

/** Apply credits to the oldest debits first; the unpaid remainder of each debit is aged by its date. */
export function fifoAging(rows: { date: string; effectUsd: string }[], asOf = todayIso()): Aging {
  const debits: { date: string; left: Dec }[] = [];
  let credit = new Dec(0);
  for (const r of rows) {
    const e = D(r.effectUsd);
    if (e.gt(0)) debits.push({ date: r.date, left: e });
    else credit = credit.plus(e.neg());
  }
  for (const d of debits) {
    if (credit.isZero()) break;
    const use = Dec.min(credit, d.left);
    d.left = d.left.minus(use);
    credit = credit.minus(use);
  }
  const res: Aging = { b0: new Dec(0), b31: new Dec(0), b61: new Dec(0), b90: new Dec(0), total: new Dec(0), oldestDays: 0 };
  for (const d of debits) {
    if (!d.left.gt(0)) continue;
    const age = daysBetween(d.date, asOf);
    res.oldestDays = Math.max(res.oldestDays, age);
    if (age <= 30) res.b0 = res.b0.plus(d.left);
    else if (age <= 60) res.b31 = res.b31.plus(d.left);
    else if (age <= 90) res.b61 = res.b61.plus(d.left);
    else res.b90 = res.b90.plus(d.left);
    res.total = res.total.plus(d.left);
  }
  return res;
}

/** Effects per party for aging across everyone (one query). */
export async function allPartyEffects(kind: PartyKind) {
  const fk = kind === 'customer' ? sql`"customerId"` : sql`"beneficiaryId"`;
  const table = kind === 'customer' ? sql`"Customer"` : sql`"Beneficiary"`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT t.${fk} AS pid, x.name, x.phone, t.date, t."createdAt", COALESCE(SUM(pe."amountUsd"),0) AS eff
    FROM "Txn" t
    JOIN ${table} x ON x.id = t.${fk}
    LEFT JOIN "PartyEntry" pe ON pe."txnId" = t.id
    WHERE t.${fk} IS NOT NULL AND t."deletedAt" IS NULL
    GROUP BY t.id, t.${fk}, x.name, x.phone, t.date, t."createdAt"
    ORDER BY t.date ASC, t."createdAt" ASC`;
  const map = new Map<string, { id: string; name: string; phone: string; rows: { date: string; effectUsd: string }[] }>();
  for (const r of rows) {
    const id = String(r.pid);
    const e = map.get(id) ?? { id, name: String(r.name), phone: String(r.phone ?? ''), rows: [] };
    e.rows.push({ date: dbToIso(r.date as Date), effectUsd: s(r.eff) });
    map.set(id, e);
  }
  return [...map.values()];
}
