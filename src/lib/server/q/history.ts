import 'server-only';
import type { TxnKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D } from '@/lib/money';
import { dbToIso, isValidIsoDate } from '@/lib/dates';
import { sql, join, where, like, kindsMatching, dateLike, numberLike, isKind, n, s, type Sql } from './sql';

export type TxnRow = {
  id: string;
  number: string;
  date: string;
  kind: TxnKind;
  partyType: 'customer' | 'beneficiary' | null;
  partyId: string | null;
  partyName: string;
  currency: 'USD' | 'IQD';
  total: string;
  totalUsd: string;
  cashPaid: string;
  vault: 'USD' | 'IQD' | null;
  vaultAmount: string;
  toVault: 'USD' | 'IQD' | null;
  toAmount: string | null;
  rate: string;
  status: 'paid' | 'partial' | 'unpaid' | 'recorded';
  products: string;
  skus: string;
  types: string;
  kg: string;
  unitPrice: string;
  label: string;
  isDemo: boolean;
  createdAt: string;
  createdByName: string;
};

export type HistoryFilters = {
  q?: string;
  kind?: string;
  partyId?: string;
  vault?: string;
  currency?: string;
  typeId?: string;
  from?: string;
  to?: string;
  customerId?: string;
  beneficiaryId?: string;
  kinds?: TxnKind[];
  /** Created at or after this moment (still inside the invoice edit window). */
  createdFrom?: Date;
  /** Created before this moment (edit window over). */
  createdBefore?: Date;
};

export const HISTORY_SORT = ['number', 'date', 'kind', 'party', 'total', 'currency', 'vault', 'kg', 'created'];

export function historyWhere(f: HistoryFilters): Sql {
  const conds: (Sql | null)[] = [sql`t."deletedAt" IS NULL`];
  if (isKind(f.kind)) conds.push(sql`t.kind = ${f.kind}::"TxnKind"`);
  if (f.kinds?.length) conds.push(sql`t.kind::text IN (${join(f.kinds)})`);
  if (f.partyId) conds.push(sql`(t."customerId" = ${f.partyId} OR t."beneficiaryId" = ${f.partyId})`);
  if (f.customerId) conds.push(sql`t."customerId" = ${f.customerId}`);
  if (f.beneficiaryId) conds.push(sql`t."beneficiaryId" = ${f.beneficiaryId}`);
  if (f.vault === 'USD' || f.vault === 'IQD') conds.push(sql`(t.vault = ${f.vault}::"Currency" OR t."toVault" = ${f.vault}::"Currency")`);
  if (f.currency === 'USD' || f.currency === 'IQD') conds.push(sql`t.currency = ${f.currency}::"Currency"`);
  if (f.typeId)
    conds.push(sql`(EXISTS (SELECT 1 FROM "TxnLine" l JOIN "Product" p ON p.id = l."productId" WHERE l."txnId" = t.id AND p."typeId" = ${f.typeId})
                    OR EXISTS (SELECT 1 FROM "Product" p WHERE p.id = t."productId" AND p."typeId" = ${f.typeId}))`);
  if (isValidIsoDate(f.from)) conds.push(sql`t.date >= ${f.from}::date`);
  if (isValidIsoDate(f.to)) conds.push(sql`t.date <= ${f.to}::date`);
  if (f.createdFrom) conds.push(sql`t."createdAt" >= ${f.createdFrom}`);
  if (f.createdBefore) conds.push(sql`t."createdAt" < ${f.createdBefore}`);
  const q = (f.q ?? '').trim();
  if (q) {
    const L = like(q);
    const kinds = kindsMatching(q);
    const num = numberLike(q);
    const dl = dateLike(q);
    const or: Sql[] = [
      sql`t.number ILIKE ${L}`,
      sql`c.name ILIKE ${L}`,
      sql`b.name ILIKE ${L}`,
      sql`t.label ILIKE ${L}`,
      sql`t.notes ILIKE ${L}`,
      sql`EXISTS (SELECT 1 FROM "TxnLine" l JOIN "Product" p ON p.id = l."productId" JOIN "AluminumType" ty ON ty.id = p."typeId"
                  WHERE l."txnId" = t.id AND (p.name ILIKE ${L} OR p.sku ILIKE ${L} OR ty.name ILIKE ${L}
                  ${num ? sql`OR l.kg = ${num}::numeric OR l."unitPrice" = ${num}::numeric OR l."lineTotal" = ${num}::numeric` : sql``}))`,
      sql`EXISTS (SELECT 1 FROM "Product" p JOIN "AluminumType" ty ON ty.id = p."typeId" WHERE p.id = t."productId" AND (p.name ILIKE ${L} OR p.sku ILIKE ${L} OR ty.name ILIKE ${L}))`,
    ];
    if (kinds.length) or.push(sql`t.kind::text IN (${join(kinds)})`);
    if (num) or.push(sql`(t.total = ${num}::numeric OR t."totalUsd" = ${num}::numeric OR t."inputKg" = ${num}::numeric OR t."outputKg" = ${num}::numeric OR t."vaultAmount" = ${num}::numeric)`);
    if (dl) or.push(sql`t.date::text LIKE ${dl}`);
    conds.push(sql`(${join(or, ' OR ')})`);
  }
  return where(conds);
}

const FROM = sql`
  FROM "Txn" t
  LEFT JOIN "Customer" c ON c.id = t."customerId"
  LEFT JOIN "Beneficiary" b ON b.id = t."beneficiaryId"`;

const SELECT = sql`
  SELECT t.id, t.number, t.date, t.kind, t."customerId", t."beneficiaryId", c.name AS cname, b.name AS bname,
         t.currency, t.total, t."totalUsd", t."cashPaid", t.vault, t."vaultAmount", t."toVault", t."toAmount", t.rate,
         t.label, t."isDemo", t."inputKg", t."outputKg", t."createdAt", t."createdByName",
         lx.products, lx.skus, lx.types, lx.kg, lx.price_min, lx.price_max,
         pp.name AS proc_name, pp.sku AS proc_sku, pty.name AS proc_type`;

const LATERALS = sql`
  LEFT JOIN LATERAL (
    SELECT string_agg(p.name, ', ' ORDER BY l.position) AS products,
           string_agg(p.sku, ', ' ORDER BY l.position) AS skus,
           string_agg(DISTINCT ty.name, ', ') AS types,
           SUM(l.kg) AS kg, MIN(l."unitPrice") AS price_min, MAX(l."unitPrice") AS price_max
    FROM "TxnLine" l JOIN "Product" p ON p.id = l."productId" JOIN "AluminumType" ty ON ty.id = p."typeId"
    WHERE l."txnId" = t.id
  ) lx ON true
  LEFT JOIN "Product" pp ON pp.id = t."productId"
  LEFT JOIN "AluminumType" pty ON pty.id = pp."typeId"`;

export function mapTxnRow(r: Record<string, unknown>): TxnRow {
  const kind = r.kind as TxnKind;
  const total = D(s(r.total));
  const cash = D(s(r.cashPaid));
  const status: TxnRow['status'] =
    kind === 'SALE' || kind === 'PURCHASE' ? (cash.gte(total) ? 'paid' : cash.isZero() ? 'unpaid' : 'partial') : 'recorded';
  const isProc = kind === 'PROCESSING';
  return {
    id: String(r.id),
    number: String(r.number),
    date: dbToIso(r.date as Date),
    kind,
    partyType: r.customerId ? 'customer' : r.beneficiaryId ? 'beneficiary' : null,
    partyId: (r.customerId as string) ?? (r.beneficiaryId as string) ?? null,
    partyName: String(r.cname ?? r.bname ?? ''),
    currency: r.currency as 'USD' | 'IQD',
    total: total.toString(),
    totalUsd: s(r.totalUsd),
    cashPaid: cash.toString(),
    vault: (r.vault as 'USD' | 'IQD') ?? null,
    vaultAmount: s(r.vaultAmount),
    toVault: (r.toVault as 'USD' | 'IQD') ?? null,
    toAmount: r.toAmount === null || r.toAmount === undefined ? null : s(r.toAmount),
    rate: s(r.rate),
    status,
    products: String((isProc ? r.proc_name : r.products) ?? ''),
    skus: String((isProc ? r.proc_sku : r.skus) ?? ''),
    types: String((isProc ? r.proc_type : r.types) ?? ''),
    kg: isProc ? s(r.inputKg) : r.kg === null || r.kg === undefined ? '' : s(r.kg),
    unitPrice: r.price_min !== null && r.price_min !== undefined && s(r.price_min) === s(r.price_max) ? s(r.price_min) : '',
    label: String(r.label ?? ''),
    isDemo: !!r.isDemo,
    createdAt: (r.createdAt as Date).toISOString(),
    createdByName: String(r.createdByName ?? ''),
  };
}

export async function listHistory(f: HistoryFilters, p: { sort: string; dir: 'asc' | 'desc'; size: number; offset: number }) {
  const dir = p.dir === 'asc' ? sql`ASC` : sql`DESC`;
  const order =
    p.sort === 'number'
      ? sql`split_part(t.number,'-',1) ${dir}, t.number ${dir}`
      : p.sort === 'kind'
        ? sql`t.kind ${dir}, t.date DESC`
        : p.sort === 'party'
          ? sql`lower(COALESCE(c.name, b.name, '')) ${dir}, t.date DESC`
          : p.sort === 'total'
            ? sql`t."totalUsd" ${dir}`
            : p.sort === 'currency'
              ? sql`t.currency ${dir}, t.date DESC`
              : p.sort === 'vault'
                ? sql`t.vault ${dir} NULLS LAST, t.date DESC`
                : p.sort === 'kg'
                  ? sql`COALESCE(lx.kg, t."inputKg", 0) ${dir}`
                  : p.sort === 'created'
                    ? sql`t."createdAt" ${dir}`
                    : sql`t.date ${dir}, t."createdAt" ${dir}`;
  const w = historyWhere(f);
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`${SELECT} ${FROM} ${LATERALS} ${w} ORDER BY ${order}, t.id DESC LIMIT ${p.size} OFFSET ${p.offset}`,
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c ${FROM} ${w}`,
  ]);
  return { total: n(count[0]?.c), rows: rows.map(mapTxnRow) };
}

/** Latest 3 of every transaction type. */
export async function recentByKind(perKind = 3) {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM (
      ${SELECT}, ROW_NUMBER() OVER (PARTITION BY t.kind ORDER BY t.date DESC, t."createdAt" DESC) AS rn
      ${FROM} ${LATERALS}
      WHERE t."deletedAt" IS NULL
    ) x WHERE x.rn <= ${perKind}
    ORDER BY x.date DESC, x."createdAt" DESC`;
  return rows.map(mapTxnRow);
}

/** Full detail for the detail panel / edit forms. */
export async function txnDetail(id: string) {
  const t = await prisma.txn.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: 'asc' }, include: { product: { include: { type: true } } } },
      customer: { select: { id: true, name: true, phone: true, address: true } },
      beneficiary: { select: { id: true, name: true, phone: true, address: true } },
      product: { include: { type: true } },
      dues: { select: { vault: true, amount: true, paid: true, settledAt: true } },
    },
  });
  if (!t) return null;
  const openDues = t.dues.filter((d) => !d.settledAt);
  return {
    id: t.id,
    number: t.number,
    kind: t.kind,
    date: dbToIso(t.date),
    customer: t.customer,
    beneficiary: t.beneficiary,
    currency: t.currency,
    rate: t.rate.toString(),
    total: t.total.toString(),
    totalUsd: t.totalUsd.toString(),
    cashPaid: t.cashPaid.toString(),
    cashPaidUsd: t.cashPaidUsd.toString(),
    vault: t.vault,
    vaultAmount: t.vaultAmount.toString(),
    toVault: t.toVault,
    toAmount: t.toAmount?.toString() ?? null,
    cogsUsd: t.cogsUsd.toString(),
    product: t.product ? { id: t.product.id, name: t.product.name, sku: t.product.sku, typeName: t.product.type.name } : null,
    inputKg: t.inputKg?.toString() ?? null,
    lossKg: t.lossKg?.toString() ?? null,
    outputKg: t.outputKg?.toString() ?? null,
    lossMethod: t.lossMethod,
    lossPercent: t.lossPercent?.toString() ?? null,
    label: t.label,
    notes: t.notes,
    categoryId: t.categoryId,
    unitName: t.unitName,
    unitPrice: t.unitPrice?.toString() ?? null,
    quantity: t.quantity?.toString() ?? null,
    recurringId: t.recurringId,
    /** Part of this document the vault couldn't pay yet (unpaid vault due), in the vault's currency. */
    dueRemaining: openDues.length ? openDues.reduce((s, d) => s.plus(D(d.amount).minus(D(d.paid))), D(0)).toString() : null,
    dueVault: openDues[0]?.vault ?? null,
    isDemo: t.isDemo,
    createdAt: t.createdAt.toISOString(),
    createdByName: t.createdByName,
    updatedAt: t.updatedAt.toISOString(),
    updatedByName: t.updatedByName,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    lines: t.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.product.name,
      sku: l.product.sku,
      typeName: l.product.type.name,
      state: l.state,
      kg: l.kg.toString(),
      unitPrice: l.unitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
      lineTotalUsd: l.lineTotalUsd.toString(),
      unitCostUsd: l.unitCostUsd.toString(),
      cogsUsd: l.cogsUsd.toString(),
    })),
  };
}
export type TxnDetail = NonNullable<Awaited<ReturnType<typeof txnDetail>>>;
