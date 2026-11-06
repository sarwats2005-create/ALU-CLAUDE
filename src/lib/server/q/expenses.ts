import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D } from '@/lib/money';
import { dbToIso, isValidIsoDate, isoToDb, parseDmy } from '@/lib/dates';

export type ExpenseFilters = {
  q?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  /** Restrict to expenses created by this user. */
  createdById?: string;
  /**
   * `null` = factory (main) vault expenses;
   * `'personal'` = any staff personal-vault expense;
   * a user id = that user's personal vault.
   */
  vaultOwner?: string | null | 'personal';
};

export type ExpenseRow = {
  id: string;
  number: string;
  date: string;
  category: string;
  categoryId: string | null;
  unitName: string;
  unitPrice: string | null;
  quantity: string | null;
  amount: string;
  currency: 'USD' | 'IQD';
  totalUsd: string;
  vault: 'USD' | 'IQD';
  note: string;
  source: 'manual' | 'recurring';
  createdByName: string;
  createdById: string | null;
  vaultOwnerUserId: string | null;
};

function where(f: ExpenseFilters): Prisma.TxnWhereInput {
  const w: Prisma.TxnWhereInput = { kind: 'EXPENSE', deletedAt: null };
  if (f.categoryId) w.categoryId = f.categoryId;
  if (f.createdById) w.createdById = f.createdById;
  if (f.vaultOwner === 'personal') w.vaultOwnerUserId = { not: null };
  else if (f.vaultOwner === null) w.vaultOwnerUserId = null;
  else if (typeof f.vaultOwner === 'string') w.vaultOwnerUserId = f.vaultOwner;
  const date: Prisma.DateTimeFilter = {};
  if (isValidIsoDate(f.from)) date.gte = isoToDb(f.from);
  if (isValidIsoDate(f.to)) date.lte = isoToDb(f.to);
  if (date.gte || date.lte) w.date = date;
  const q = (f.q ?? '').trim();
  if (q) {
    const or: Prisma.TxnWhereInput[] = [
      { number: { contains: q, mode: 'insensitive' } },
      { label: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
      { createdByName: { contains: q, mode: 'insensitive' } },
    ];
    const n = q.replace(/[,\s$]/g, '').replace(/iqd$/i, '');
    if (/^\d+(\.\d+)?$/.test(n)) or.push({ total: { equals: n } });
    const iso = isValidIsoDate(q) ? q : parseDmy(q);
    if (iso) or.push({ date: isoToDb(iso) });
    if (/^usd$/i.test(q) || /^iqd$/i.test(q)) or.push({ vault: q.toUpperCase() as 'USD' | 'IQD' });
    w.OR = or;
  }
  return w;
}

export async function listExpenses(f: ExpenseFilters, p: { size: number; offset: number; dir: 'asc' | 'desc' }) {
  const w = where(f);
  const [rows, total] = await Promise.all([
    prisma.txn.findMany({ where: w, orderBy: [{ date: p.dir }, { createdAt: p.dir }], take: p.size, skip: p.offset }),
    prisma.txn.count({ where: w }),
  ]);
  return {
    total,
    rows: rows.map(
      (t): ExpenseRow => ({
        id: t.id,
        number: t.number,
        date: dbToIso(t.date),
        category: t.label,
        categoryId: t.categoryId,
        unitName: t.unitName,
        unitPrice: t.unitPrice?.toString() ?? null,
        quantity: t.quantity?.toString() ?? null,
        amount: t.total.toString(),
        currency: t.currency,
        totalUsd: t.totalUsd.toString(),
        vault: (t.vault ?? t.currency) as 'USD' | 'IQD',
        note: t.notes,
        source: t.recurringId || t.runKey ? 'recurring' : 'manual',
        createdByName: t.createdByName,
        createdById: t.createdById,
        vaultOwnerUserId: t.vaultOwnerUserId,
      }),
    ),
  };
}

/** Totals over matching expenses. USD equivalents use each expense's own rate. */
export async function expenseStats(f: Pick<ExpenseFilters, 'createdById' | 'vaultOwner'> = {}) {
  const base = where(f);
  const [byCur, count, largest, byCat] = await Promise.all([
    prisma.txn.groupBy({ by: ['currency'], where: base, _sum: { total: true, totalUsd: true } }),
    prisma.txn.count({ where: base }),
    prisma.txn.findFirst({ where: base, orderBy: [{ totalUsd: 'desc' }, { date: 'desc' }], select: { number: true, total: true, currency: true, label: true } }),
    prisma.txn.groupBy({ by: ['label'], where: base, _sum: { totalUsd: true }, _count: { _all: true }, orderBy: { _sum: { totalUsd: 'desc' } }, take: 1 }),
  ]);
  const sum = (c: 'USD' | 'IQD') => D(byCur.find((r) => r.currency === c)?._sum.total);
  const overallUsd = byCur.reduce((s, r) => s.plus(D(r._sum.totalUsd)), D(0));
  return {
    usdTotal: sum('USD').toString(),
    iqdTotal: sum('IQD').toString(),
    overallUsd: overallUsd.toString(),
    count,
    largest: largest ? { number: largest.number, amount: largest.total.toString(), currency: largest.currency, category: largest.label } : null,
    topCategory: byCat[0] ? { name: byCat[0].label, totalUsd: D(byCat[0]._sum.totalUsd).toString(), count: byCat[0]._count._all } : null,
  };
}
export type ExpenseStats = Awaited<ReturnType<typeof expenseStats>>;
