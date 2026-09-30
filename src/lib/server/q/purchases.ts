import 'server-only';
import { prisma } from '@/lib/db';
import { D, round2, round4 } from '@/lib/money';
import { isValidIsoDate, lastMonths, todayIso } from '@/lib/dates';
import { sql, where, like, n, s, type Sql } from './sql';

export type PurchaseFilters = { q?: string; typeId?: string; beneficiaryId?: string; from?: string; to?: string; productId?: string };

/** WHERE over purchase lines (l) joined to their document (t), product (p), type (ty), beneficiary (b). */
export function purchaseLineWhere(f: PurchaseFilters): Sql {
  const conds: (Sql | null)[] = [
    sql`t.kind = 'PURCHASE'`,
    sql`t."deletedAt" IS NULL`,
    f.typeId ? sql`p."typeId" = ${f.typeId}` : null,
    f.productId ? sql`p.id = ${f.productId}` : null,
    f.beneficiaryId ? sql`t."beneficiaryId" = ${f.beneficiaryId}` : null,
    isValidIsoDate(f.from) ? sql`t.date >= ${f.from}::date` : null,
    isValidIsoDate(f.to) ? sql`t.date <= ${f.to}::date` : null,
    f.q ? sql`(t.number ILIKE ${like(f.q)} OR p.name ILIKE ${like(f.q)} OR p.sku ILIKE ${like(f.q)} OR ty.name ILIKE ${like(f.q)} OR b.name ILIKE ${like(f.q)})` : null,
  ];
  return where(conds);
}

const FROM = sql`FROM "TxnLine" l JOIN "Txn" t ON t.id = l."txnId" JOIN "Product" p ON p.id = l."productId"
                 JOIN "AluminumType" ty ON ty.id = p."typeId" JOIN "Beneficiary" b ON b.id = t."beneficiaryId"`;

export async function purchasesOverview(f: PurchaseFilters) {
  const w = purchaseLineWhere(f);
  const end = isValidIsoDate(f.to) ? f.to! : todayIso();
  const months = lastMonths(end, 12);
  const [cards, byType, byBen, monthly] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(l.kg),0) AS kg, COALESCE(SUM(l."lineTotalUsd"),0) AS value, COUNT(DISTINCT t.id) AS cnt ${FROM} ${w}`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ty.name AS label, COALESCE(SUM(l.kg),0) AS kg ${FROM} ${w} GROUP BY ty.name ORDER BY kg DESC`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.name AS label, COALESCE(SUM(l."lineTotalUsd"),0) AS value ${FROM} ${w} GROUP BY b.name ORDER BY value DESC LIMIT 8`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(t.date,'YYYY-MM') AS m, COALESCE(SUM(l."lineTotalUsd"),0) AS value, COALESCE(SUM(l.kg),0) AS kg ${FROM} ${w} GROUP BY 1`,
  ]);
  const kg = D(s(cards[0]?.kg));
  const value = D(s(cards[0]?.value));
  const byMonth = new Map(monthly.map((r) => [String(r.m), r]));
  return {
    cards: {
      totalKg: kg.toString(),
      totalValue: round2(value).toString(),
      // Weighted average: Σ value ÷ Σ kg — never a simple average of prices.
      avgPrice: kg.gt(0) ? round4(value.div(kg)).toString() : '0',
      count: n(cards[0]?.cnt),
    },
    kgByType: byType.map((r) => ({ label: String(r.label), value: s(r.kg) })),
    valueByBeneficiary: byBen.map((r) => ({ label: String(r.label), value: round2(D(s(r.value))).toString() })),
    monthlyValue: months.map((m) => ({ label: m, value: round2(D(s(byMonth.get(m)?.value))).toString() })),
    monthlyKg: months.map((m) => ({ label: m, value: s(byMonth.get(m)?.kg) })),
  };
}
