import 'server-only';
import type { StockState, TxnKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { D, Dec, round4 } from '@/lib/money';
import { dbToIso } from '@/lib/dates';
import { notFound } from '../errors';
import { getSettings } from '../common';
import { sql, join, where, like, n, s, type Sql } from './sql';

export type StockStatus = 'in' | 'low' | 'out';

const STOCK_SUB = sql`
  SELECT "productId",
         SUM(CASE WHEN state = 'RAW' THEN kg ELSE 0 END) AS raw_kg,
         SUM(CASE WHEN state = 'RAW' THEN "valueUsd" ELSE 0 END) AS raw_val,
         SUM(CASE WHEN state = 'FINISHED' THEN kg ELSE 0 END) AS fin_kg,
         SUM(CASE WHEN state = 'FINISHED' THEN "valueUsd" ELSE 0 END) AS fin_val,
         COUNT(*) AS moves
  FROM "StockEntry" GROUP BY "productId"`;

export async function listInventory(p: {
  q: string;
  typeId?: string;
  status?: string;
  sort: string;
  dir: 'asc' | 'desc';
  size: number;
  offset: number;
  onlyInStock?: boolean;
  ids?: string[];
}) {
  const settings = await getSettings();
  const globalLow = D(settings.lowStockKg).toString();
  const total = sql`(COALESCE(st.raw_kg,0) + COALESCE(st.fin_kg,0))`;
  const threshold = sql`COALESCE(p."lowStockKg", ${globalLow}::numeric)`;
  const statusExpr = sql`CASE WHEN ${total} <= 0 THEN 'out' WHEN ${total} <= ${threshold} THEN 'low' ELSE 'in' END`;
  const conds: (Sql | null)[] = [
    p.q ? sql`(p.name ILIKE ${like(p.q)} OR p.sku ILIKE ${like(p.q)})` : null,
    p.typeId ? sql`p."typeId" = ${p.typeId}` : null,
    p.status === 'in' || p.status === 'low' || p.status === 'out' ? sql`${statusExpr} = ${p.status}` : null,
    p.status === 'attention' ? sql`${statusExpr} IN ('low', 'out')` : null,
    p.onlyInStock ? sql`${total} > 0` : null,
    p.ids?.length ? sql`p.id IN (${join(p.ids)})` : null,
  ];
  const order =
    p.sort === 'sku'
      ? sql`p.sku`
      : p.sort === 'type'
        ? sql`lower(ty.name)`
        : p.sort === 'raw'
          ? sql`COALESCE(st.raw_kg,0)`
          : p.sort === 'finished'
            ? sql`COALESCE(st.fin_kg,0)`
            : p.sort === 'value'
              ? sql`(COALESCE(st.raw_val,0) + COALESCE(st.fin_val,0))`
              : sql`lower(p.name)`;
  const dir = p.dir === 'asc' ? sql`ASC` : sql`DESC`;
  const base = sql`FROM "Product" p JOIN "AluminumType" ty ON ty.id = p."typeId" LEFT JOIN (${STOCK_SUB}) st ON st."productId" = p.id ${where(conds)}`;
  const [rows, count, sums] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.name, p.sku, p."typeId", ty.name AS type_name, p."lowStockKg", p."isDemo",
             COALESCE(st.raw_kg,0) AS raw_kg, COALESCE(st.raw_val,0) AS raw_val,
             COALESCE(st.fin_kg,0) AS fin_kg, COALESCE(st.fin_val,0) AS fin_val,
             COALESCE(st.moves,0) AS moves, ${statusExpr} AS status, ${threshold} AS threshold
      ${base}
      ORDER BY ${order} ${dir}, p.id ASC
      LIMIT ${p.size} OFFSET ${p.offset}`,
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c ${base}`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(st.raw_kg),0) AS raw_kg, COALESCE(SUM(st.fin_kg),0) AS fin_kg,
             COALESCE(SUM(st.raw_val + st.fin_val),0) AS value
      FROM (${STOCK_SUB}) st`,
  ]);
  const attn = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COUNT(*) FILTER (WHERE ${statusExpr} = 'low') AS low, COUNT(*) FILTER (WHERE ${statusExpr} = 'out') AS out
    FROM "Product" p LEFT JOIN (${STOCK_SUB}) st ON st."productId" = p.id`;
  return {
    total: n(count[0]?.c),
    globalLowKg: globalLow,
    totals: { rawKg: s(sums[0]?.raw_kg), finishedKg: s(sums[0]?.fin_kg), value: s(sums[0]?.value), low: n(attn[0]?.low), out: n(attn[0]?.out) },
    rows: rows.map((r) => {
      const rawKg = D(s(r.raw_kg));
      const finKg = D(s(r.fin_kg));
      const rawVal = D(s(r.raw_val));
      const finVal = D(s(r.fin_val));
      return {
        id: String(r.id),
        name: String(r.name),
        sku: String(r.sku),
        typeId: String(r.typeId),
        typeName: String(r.type_name),
        lowStockKg: r.lowStockKg === null ? null : s(r.lowStockKg),
        threshold: s(r.threshold),
        isDemo: !!r.isDemo,
        rawKg: rawKg.toString(),
        finishedKg: finKg.toString(),
        rawAvg: rawKg.gt(0) ? round4(rawVal.div(rawKg)).toString() : '0',
        finishedAvg: finKg.gt(0) ? round4(finVal.div(finKg)).toString() : '0',
        value: rawVal.plus(finVal).toDecimalPlaces(2).toString(),
        status: r.status as StockStatus,
        hasMoves: n(r.moves) > 0,
      };
    }),
  };
}

/** Product picker for POS/purchase: name, SKU, type and availability per state. */
export async function lookupProducts(q: string, opts: { inStockOnly?: boolean; limit?: number; ids?: string[] } = {}) {
  const res = await listInventory({
    q,
    sort: 'name',
    dir: 'asc',
    size: opts.limit ?? 30,
    offset: 0,
    onlyInStock: opts.inStockOnly && !opts.ids?.length,
    ids: opts.ids,
  });
  return res.rows;
}

export async function productStock(productId: string) {
  const g = await prisma.stockEntry.groupBy({ by: ['state'], where: { productId }, _sum: { kg: true, valueUsd: true } });
  const out: Record<StockState, { kg: string; avg: string }> = { RAW: { kg: '0', avg: '0' }, FINISHED: { kg: '0', avg: '0' } };
  for (const r of g) {
    const kg = D(r._sum.kg);
    const val = D(r._sum.valueUsd);
    out[r.state] = { kg: kg.toString(), avg: kg.gt(0) ? round4(val.div(kg)).toString() : '0' };
  }
  return out;
}

export type HistoryRow = {
  id: number;
  date: string;
  number: string;
  txnId: string;
  kind: TxnKind;
  state: StockState;
  kg: string;
  valueUsd: string;
  unitCostUsd: string;
  movement: 'purchase' | 'sale' | 'processOut' | 'processIn' | 'reversal' | 'adjust';
  rawAfter: string;
  finishedAfter: string;
  lossKg: string | null;
  deleted: boolean;
  /** A processing run that was reverted to raw (its rows stay, shown as reverted). */
  reverted: boolean;
};

/** Every stock movement for the product, in posting order, with running kg per state. */
export async function productHistory(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { type: true } });
  if (!product) throw notFound();
  const entries = await prisma.stockEntry.findMany({
    where: { productId },
    orderBy: { id: 'asc' },
    include: { txn: { select: { number: true, kind: true, lossKg: true, deletedAt: true, label: true } } },
  });
  let raw = new Dec(0);
  let fin = new Dec(0);
  const rows: HistoryRow[] = entries.map((e) => {
    const kg = D(e.kg);
    if (e.state === 'RAW') raw = raw.plus(kg);
    else fin = fin.plus(kg);
    const movement: HistoryRow['movement'] = e.isReversal
      ? 'reversal'
      : kg.isZero()
        ? 'adjust'
        : e.sourceType === 'PURCHASE'
          ? 'purchase'
          : e.sourceType === 'SALE'
            ? 'sale'
            : kg.isNegative()
              ? 'processOut'
              : 'processIn';
    return {
      id: e.id,
      date: dbToIso(e.date),
      number: e.txn.number,
      txnId: e.txnId,
      kind: e.sourceType,
      state: e.state,
      kg: kg.toString(),
      valueUsd: D(e.valueUsd).toString(),
      unitCostUsd: D(e.unitCostUsd).toString(),
      movement,
      rawAfter: raw.toString(),
      finishedAfter: fin.toString(),
      lossKg: movement === 'processIn' && e.txn.lossKg ? D(e.txn.lossKg).toString() : null,
      deleted: !!e.txn.deletedAt,
      reverted: !!e.txn.deletedAt && e.txn.kind === 'PROCESSING' && e.txn.label === 'reverted',
    };
  });
  return {
    product: { id: product.id, name: product.name, sku: product.sku, typeName: product.type.name, isDemo: product.isDemo },
    stock: await productStock(productId),
    rows: rows.reverse(), // newest first for display
  };
}
