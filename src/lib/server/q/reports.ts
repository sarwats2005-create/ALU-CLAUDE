import 'server-only';
import { prisma } from '@/lib/db';
import { D, Dec, round2, round3, round4 } from '@/lib/money';
import { addDaysIso, dbToIso, isValidIsoDate, todayIso } from '@/lib/dates';
import type { ReportData, ReportType } from '@/lib/reports-meta';
import { sql, where, n, s, type Sql } from './sql';
import { fifoAging, allPartyEffects } from './parties';

export type ReportParams = {
  from?: string;
  to?: string;
  customerId?: string;
  beneficiaryId?: string;
  productId?: string;
  typeId?: string;
  currency?: string;
};

function range(p: ReportParams) {
  const to = isValidIsoDate(p.to) ? p.to! : todayIso();
  const from = isValidIsoDate(p.from) ? p.from! : `${addDaysIso(to, -364).slice(0, 7)}-01`;
  return from <= to ? { from, to } : { from: to, to: from };
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 240) break;
  }
  return out;
}

const dateCond = (col: Sql, from: string, to: string) => sql`${col} >= ${from}::date AND ${col} <= ${to}::date`;

// ─── Profit & loss ─────────────────────────────────────────────────────────────────────────────────
async function pl(p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const [sales, proc, cash] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM("totalUsd"),0) AS revenue, COALESCE(SUM("cogsUsd"),0) AS cogs
      FROM "Txn" WHERE kind = 'SALE' AND "deletedAt" IS NULL AND ${dateCond(sql`date`, from, to)} GROUP BY 1`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(date,'YYYY-MM') AS m, COALESCE(SUM("lossKg"),0) AS loss_kg,
             COALESCE(SUM(CASE WHEN "inputKg" > 0 THEN "cogsUsd" * "lossKg" / "inputKg" ELSE 0 END),0) AS loss_usd
      FROM "Txn" WHERE kind = 'PROCESSING' AND "deletedAt" IS NULL AND ${dateCond(sql`date`, from, to)} GROUP BY 1`,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(date,'YYYY-MM') AS m,
        COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "cashPaidUsd"
                          WHEN kind IN ('CUSTOMER_PAYMENT','BENEFICIARY_REFUND','VAULT_DEPOSIT') THEN "totalUsd" ELSE 0 END),0) AS cash_in,
        COALESCE(SUM(CASE WHEN kind = 'PURCHASE' THEN "cashPaidUsd"
                          WHEN kind IN ('BENEFICIARY_PAYMENT','CUSTOMER_REFUND','VAULT_WITHDRAWAL') THEN "totalUsd" ELSE 0 END),0) AS cash_out
      FROM "Txn" WHERE "deletedAt" IS NULL AND ${dateCond(sql`date`, from, to)} GROUP BY 1`,
  ]);
  const S = new Map(sales.map((r) => [String(r.m), r]));
  const P = new Map(proc.map((r) => [String(r.m), r]));
  const C = new Map(cash.map((r) => [String(r.m), r]));
  const tot = { revenue: new Dec(0), cogs: new Dec(0), lossKg: new Dec(0), lossUsd: new Dec(0), cashIn: new Dec(0), cashOut: new Dec(0) };
  const rows = monthsBetween(from, to).map((m) => {
    const revenue = D(s(S.get(m)?.revenue));
    const cogs = D(s(S.get(m)?.cogs));
    const lossKg = D(s(P.get(m)?.loss_kg));
    const lossUsd = D(s(P.get(m)?.loss_usd));
    const cashIn = D(s(C.get(m)?.cash_in));
    const cashOut = D(s(C.get(m)?.cash_out));
    tot.revenue = tot.revenue.plus(revenue);
    tot.cogs = tot.cogs.plus(cogs);
    tot.lossKg = tot.lossKg.plus(lossKg);
    tot.lossUsd = tot.lossUsd.plus(lossUsd);
    tot.cashIn = tot.cashIn.plus(cashIn);
    tot.cashOut = tot.cashOut.plus(cashOut);
    return {
      month: m,
      revenue: round2(revenue).toString(),
      cogs: round2(cogs).toString(),
      profit: round2(revenue.minus(cogs)).toString(),
      lossKg: round3(lossKg).toString(),
      lossUsd: round2(lossUsd).toString(),
      cashIn: round2(cashIn).toString(),
      cashOut: round2(cashOut).toString(),
      net: round2(cashIn.minus(cashOut)).toString(),
    };
  });
  const profit = round2(tot.revenue.minus(tot.cogs));
  return {
    type: 'pl',
    from,
    to,
    summary: [
      { label: 'rep.revenue', value: round2(tot.revenue).toString(), fmt: 'money' },
      { label: 'rep.cogs', value: round2(tot.cogs).toString(), fmt: 'money' },
      { label: 'rep.grossProfit', value: profit.toString(), fmt: 'money', tone: 'auto' },
      { label: 'rep.processingLossKg', value: round3(tot.lossKg).toString(), fmt: 'kg' },
      { label: 'rep.processingLossUsd', value: round2(tot.lossUsd).toString(), fmt: 'money' },
      { label: 'rep.netCashFlow', value: round2(tot.cashIn.minus(tot.cashOut)).toString(), fmt: 'money', tone: 'auto' },
    ],
    chart: { kind: 'signedBars', title: 'dash.monthlyPl', fmt: 'money', series: [{ name: 'profit', points: rows.map((r) => ({ label: r.month, value: r.profit })) }] },
    tables: [
      {
        columns: [
          { key: 'month', label: 'common.month', fmt: 'month' },
          { key: 'revenue', label: 'rep.revenue', fmt: 'money' },
          { key: 'cogs', label: 'rep.cogs', fmt: 'money' },
          { key: 'profit', label: 'rep.grossProfit', fmt: 'money' },
          { key: 'lossKg', label: 'rep.processingLossKg', fmt: 'kg' },
          { key: 'lossUsd', label: 'rep.processingLossUsd', fmt: 'money' },
          { key: 'cashIn', label: 'rep.cashIn', fmt: 'money' },
          { key: 'cashOut', label: 'rep.cashOut', fmt: 'money' },
          { key: 'net', label: 'rep.netCashFlow', fmt: 'money' },
        ],
        rows,
        totals: {
          month: '',
          revenue: round2(tot.revenue).toString(),
          cogs: round2(tot.cogs).toString(),
          profit: profit.toString(),
          lossKg: round3(tot.lossKg).toString(),
          lossUsd: round2(tot.lossUsd).toString(),
          cashIn: round2(tot.cashIn).toString(),
          cashOut: round2(tot.cashOut).toString(),
          net: round2(tot.cashIn.minus(tot.cashOut)).toString(),
        },
      },
    ],
  };
}

// ─── Sales / purchases (line level) ────────────────────────────────────────────────────────────────
async function lineReport(kind: 'SALE' | 'PURCHASE', p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const isSale = kind === 'SALE';
  const conds: (Sql | null)[] = [
    sql`t.kind = ${kind}::"TxnKind"`,
    sql`t."deletedAt" IS NULL`,
    dateCond(sql`t.date`, from, to),
    isSale && p.customerId ? sql`t."customerId" = ${p.customerId}` : null,
    !isSale && p.beneficiaryId ? sql`t."beneficiaryId" = ${p.beneficiaryId}` : null,
    p.productId ? sql`l."productId" = ${p.productId}` : null,
    p.typeId ? sql`pr."typeId" = ${p.typeId}` : null,
    p.currency === 'USD' || p.currency === 'IQD' ? sql`t.currency = ${p.currency}::"Currency"` : null,
  ];
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT t.id AS "txnId", t.number, t.date, t.currency, t."cashPaid", COALESCE(c.name, b.name) AS party,
           pr.name AS product, pr.sku, ty.name AS type, l.state, l.kg, l."unitPrice", l."lineTotal", l."lineTotalUsd", l."cogsUsd", l.position
    FROM "TxnLine" l JOIN "Txn" t ON t.id = l."txnId" JOIN "Product" pr ON pr.id = l."productId" JOIN "AluminumType" ty ON ty.id = pr."typeId"
    LEFT JOIN "Customer" c ON c.id = t."customerId" LEFT JOIN "Beneficiary" b ON b.id = t."beneficiaryId"
    ${where(conds)}
    ORDER BY t.date ASC, t.number ASC, l.position ASC`;
  let kg = new Dec(0);
  let usd = new Dec(0);
  let cogs = new Dec(0);
  const docs = new Set<string>();
  const out = rows.map((r) => {
    const lk = D(s(r.kg));
    const lu = D(s(r.lineTotalUsd));
    const lc = D(s(r.cogsUsd));
    kg = kg.plus(lk);
    usd = usd.plus(lu);
    cogs = cogs.plus(lc);
    docs.add(String(r.txnId));
    return {
      date: dbToIso(r.date as Date),
      number: String(r.number),
      party: String(r.party ?? ''),
      product: String(r.product),
      sku: String(r.sku),
      type: String(r.type),
      state: String(r.state),
      kg: s(r.kg),
      unitPrice: s(r.unitPrice),
      currency: String(r.currency),
      lineTotal: s(r.lineTotal),
      lineTotalUsd: round2(lu).toString(),
      cogs: round2(lc).toString(),
      profit: round2(lu.minus(lc)).toString(),
    };
  });
  const summary: ReportData['summary'] = isSale
    ? [
        { label: 'rep.invoiceCount', value: String(docs.size), fmt: 'int' },
        { label: 'rep.kgTotal', value: round3(kg).toString(), fmt: 'kg' },
        { label: 'rep.revenue', value: round2(usd).toString(), fmt: 'money' },
        { label: 'rep.cogs', value: round2(cogs).toString(), fmt: 'money' },
        { label: 'rep.grossProfit', value: round2(usd.minus(cogs)).toString(), fmt: 'money', tone: 'auto' },
      ]
    : [
        { label: 'pur.count', value: String(docs.size), fmt: 'int' },
        { label: 'pur.totalKg', value: round3(kg).toString(), fmt: 'kg' },
        { label: 'pur.totalValue', value: round2(usd).toString(), fmt: 'money' },
        { label: 'pur.avgPrice', value: kg.gt(0) ? round4(usd.div(kg)).toString() : '0', fmt: 'cost' },
      ];
  const columns = [
    { key: 'date', label: 'common.date', fmt: 'date' },
    { key: 'number', label: 'common.number' },
    { key: 'party', label: isSale ? 'pos.customer' : 'nav.beneficiaries' },
    { key: 'product', label: 'common.product' },
    { key: 'sku', label: 'common.sku' },
    { key: 'type', label: 'common.aluminumType' },
    { key: 'state', label: 'common.stockState', fmt: 'state' },
    { key: 'kg', label: 'common.kg', fmt: 'kg' },
    { key: 'unitPrice', label: 'common.unitPriceShort', fmt: 'amountCur' },
    { key: 'lineTotal', label: 'common.total', fmt: 'moneyCur' },
    { key: 'lineTotalUsd', label: 'common.usdEquivalent', fmt: 'money' },
    ...(isSale
      ? [
          { key: 'cogs', label: 'rep.cogs', fmt: 'money' },
          { key: 'profit', label: 'detail.profit', fmt: 'money' },
        ]
      : []),
  ] as ReportData['tables'][number]['columns'];
  return {
    type: isSale ? 'sales' : 'purchases',
    from,
    to,
    summary,
    tables: [
      {
        columns,
        rows: out,
        totals: { kg: round3(kg).toString(), lineTotalUsd: round2(usd).toString(), ...(isSale ? { cogs: round2(cogs).toString(), profit: round2(usd.minus(cogs)).toString() } : {}) },
      },
    ],
  };
}

// ─── Aging ─────────────────────────────────────────────────────────────────────────────────────────
async function aging(kind: 'customer' | 'beneficiary', p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const parties = await allPartyEffects(kind);
  const owing: Record<string, unknown>[] = [];
  const credits: Record<string, unknown>[] = [];
  const tot = { b0: new Dec(0), b31: new Dec(0), b61: new Dec(0), b90: new Dec(0), total: new Dec(0), credit: new Dec(0) };
  for (const party of parties) {
    const rows = party.rows.filter((r) => r.date <= to);
    const balance = rows.reduce((a, r) => a.plus(D(r.effectUsd)), new Dec(0));
    if (balance.gt(0)) {
      const a = fifoAging(rows, to);
      tot.b0 = tot.b0.plus(a.b0);
      tot.b31 = tot.b31.plus(a.b31);
      tot.b61 = tot.b61.plus(a.b61);
      tot.b90 = tot.b90.plus(a.b90);
      tot.total = tot.total.plus(a.total);
      owing.push({
        name: party.name,
        phone: party.phone,
        b0: round2(a.b0).toString(),
        b31: round2(a.b31).toString(),
        b61: round2(a.b61).toString(),
        b90: round2(a.b90).toString(),
        total: round2(a.total).toString(),
        oldest: a.oldestDays,
      });
    } else if (balance.lt(0)) {
      tot.credit = tot.credit.plus(balance.neg());
      credits.push({ name: party.name, phone: party.phone, credit: round2(balance.neg()).toString() });
    }
  }
  owing.sort((a, b) => D(b.total as string).cmp(D(a.total as string)));
  credits.sort((a, b) => D(b.credit as string).cmp(D(a.credit as string)));
  const isC = kind === 'customer';
  return {
    type: isC ? 'custAging' : 'benAging',
    from,
    to,
    summary: [
      { label: isC ? 'due.customerOwes' : 'due.factoryOwes', value: round2(tot.total).toString(), fmt: 'money' },
      { label: 'rep.b0_30', value: round2(tot.b0).toString(), fmt: 'money' },
      { label: 'rep.b31_60', value: round2(tot.b31).toString(), fmt: 'money' },
      { label: 'rep.b61_90', value: round2(tot.b61).toString(), fmt: 'money' },
      { label: 'rep.b90', value: round2(tot.b90).toString(), fmt: 'money' },
      { label: isC ? 'rep.credits' : 'rep.advances', value: round2(tot.credit).toString(), fmt: 'money' },
    ],
    tables: [
      {
        title: isC ? 'due.customerOwes' : 'due.factoryOwes',
        columns: [
          { key: 'name', label: 'common.name' },
          { key: 'phone', label: 'common.phone' },
          { key: 'b0', label: 'rep.b0_30', fmt: 'money' },
          { key: 'b31', label: 'rep.b31_60', fmt: 'money' },
          { key: 'b61', label: 'rep.b61_90', fmt: 'money' },
          { key: 'b90', label: 'rep.b90', fmt: 'money' },
          { key: 'total', label: 'rep.outstanding', fmt: 'money' },
          { key: 'oldest', label: 'rep.oldestDue', fmt: 'int' },
        ],
        rows: owing,
        totals: { b0: round2(tot.b0).toString(), b31: round2(tot.b31).toString(), b61: round2(tot.b61).toString(), b90: round2(tot.b90).toString(), total: round2(tot.total).toString() },
      },
      {
        title: isC ? 'rep.credits' : 'rep.advances',
        columns: [
          { key: 'name', label: 'common.name' },
          { key: 'phone', label: 'common.phone' },
          { key: 'credit', label: isC ? 'due.customerCredit' : 'due.beneficiaryOwes', fmt: 'money' },
        ],
        rows: credits,
        totals: { credit: round2(tot.credit).toString() },
      },
    ],
  };
}

// ─── Inventory movement ────────────────────────────────────────────────────────────────────────────
async function inventory(p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const typeCond = p.typeId ? sql`AND pr."typeId" = ${p.typeId}` : sql``;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT pr.id, pr.name, pr.sku, ty.name AS type,
      COALESCE((SELECT SUM(se.kg) FROM "StockEntry" se WHERE se."productId" = pr.id AND se."sourceType" = 'PURCHASE' AND se.date >= ${from}::date AND se.date <= ${to}::date),0) AS in_kg,
      COALESCE((SELECT SUM(t."inputKg") FROM "Txn" t WHERE t."productId" = pr.id AND t.kind = 'PROCESSING' AND t."deletedAt" IS NULL AND t.date >= ${from}::date AND t.date <= ${to}::date),0) AS processed,
      COALESCE((SELECT SUM(t."lossKg") FROM "Txn" t WHERE t."productId" = pr.id AND t.kind = 'PROCESSING' AND t."deletedAt" IS NULL AND t.date >= ${from}::date AND t.date <= ${to}::date),0) AS loss,
      COALESCE((SELECT -SUM(se.kg) FROM "StockEntry" se WHERE se."productId" = pr.id AND se."sourceType" = 'SALE' AND se.date >= ${from}::date AND se.date <= ${to}::date),0) AS sold,
      COALESCE((SELECT SUM(se.kg) FROM "StockEntry" se WHERE se."productId" = pr.id AND se.state = 'RAW' AND se.date <= ${to}::date),0) AS raw_left,
      COALESCE((SELECT SUM(se.kg) FROM "StockEntry" se WHERE se."productId" = pr.id AND se.state = 'FINISHED' AND se.date <= ${to}::date),0) AS fin_left,
      COALESCE((SELECT SUM(se."valueUsd") FROM "StockEntry" se WHERE se."productId" = pr.id AND se.date <= ${to}::date),0) AS value
    FROM "Product" pr JOIN "AluminumType" ty ON ty.id = pr."typeId"
    WHERE EXISTS (SELECT 1 FROM "StockEntry" se WHERE se."productId" = pr.id) ${typeCond}
    ORDER BY lower(pr.name)`;
  const tot = { in: new Dec(0), processed: new Dec(0), loss: new Dec(0), sold: new Dec(0), raw: new Dec(0), fin: new Dec(0), value: new Dec(0) };
  const out = rows.map((r) => {
    const x = {
      in: D(s(r.in_kg)),
      processed: D(s(r.processed)),
      loss: D(s(r.loss)),
      sold: D(s(r.sold)),
      raw: D(s(r.raw_left)),
      fin: D(s(r.fin_left)),
      value: D(s(r.value)),
    };
    (Object.keys(tot) as (keyof typeof tot)[]).forEach((k) => (tot[k] = tot[k].plus(x[k])));
    return {
      product: String(r.name),
      sku: String(r.sku),
      type: String(r.type),
      in: x.in.toString(),
      processed: x.processed.toString(),
      loss: x.loss.toString(),
      sold: x.sold.toString(),
      raw: x.raw.toString(),
      fin: x.fin.toString(),
      value: round2(x.value).toString(),
    };
  });
  return {
    type: 'inventory',
    from,
    to,
    summary: [
      { label: 'rep.inKg', value: tot.in.toString(), fmt: 'kg' },
      { label: 'rep.processedKg', value: tot.processed.toString(), fmt: 'kg' },
      { label: 'rep.lossKg', value: tot.loss.toString(), fmt: 'kg' },
      { label: 'rep.soldKg', value: tot.sold.toString(), fmt: 'kg' },
      { label: 'inv.stockValue', value: round2(tot.value).toString(), fmt: 'money' },
    ],
    tables: [
      {
        columns: [
          { key: 'product', label: 'common.product' },
          { key: 'sku', label: 'common.sku' },
          { key: 'type', label: 'common.aluminumType' },
          { key: 'in', label: 'rep.inKg', fmt: 'kg' },
          { key: 'processed', label: 'rep.processedKg', fmt: 'kg' },
          { key: 'loss', label: 'rep.lossKg', fmt: 'kg' },
          { key: 'sold', label: 'rep.soldKg', fmt: 'kg' },
          { key: 'raw', label: 'rep.remainingRaw', fmt: 'kg' },
          { key: 'fin', label: 'rep.remainingFinished', fmt: 'kg' },
          { key: 'value', label: 'inv.stockValue', fmt: 'money' },
        ],
        rows: out,
        totals: {
          in: tot.in.toString(),
          processed: tot.processed.toString(),
          loss: tot.loss.toString(),
          sold: tot.sold.toString(),
          raw: tot.raw.toString(),
          fin: tot.fin.toString(),
          value: round2(tot.value).toString(),
        },
      },
    ],
  };
}

// ─── Vault history ─────────────────────────────────────────────────────────────────────────────────
async function vault(p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const summary: ReportData['summary'] = [];
  const rows: Record<string, unknown>[] = [];
  const series: { name: string; points: { label: string; value: string }[] }[] = [];
  for (const v of ['USD', 'IQD'] as const) {
    const [opening, entries] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END),0) AS bal FROM "VaultEntry" WHERE vault = ${v}::"Currency" AND date < ${from}::date`,
      prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT e.id, e.date, e.direction, e.amount, e."isReversal", e."sourceType", t.number, t.label, COALESCE(c.name, b.name, '') AS party
        FROM "VaultEntry" e JOIN "Txn" t ON t.id = e."txnId" LEFT JOIN "Customer" c ON c.id = t."customerId" LEFT JOIN "Beneficiary" b ON b.id = t."beneficiaryId"
        WHERE e.vault = ${v}::"Currency" AND e.date >= ${from}::date AND e.date <= ${to}::date
        ORDER BY e.date ASC, e.id ASC`,
    ]);
    let run = D(s(opening[0]?.bal));
    const open = run;
    const pts = new Map<string, string>();
    for (const e of entries) {
      const amt = D(s(e.amount));
      run = e.direction === 'IN' ? run.plus(amt) : run.minus(amt);
      const date = dbToIso(e.date as Date);
      pts.set(date, run.toString());
      rows.push({
        date,
        vault: v,
        kind: String(e.sourceType),
        number: String(e.number),
        description: [e.isReversal ? `↺ ${e.number}` : '', String(e.party ?? ''), String(e.label ?? '')].filter(Boolean).join(' · '),
        currency: v,
        in: e.direction === 'IN' ? amt.toString() : '',
        out: e.direction === 'OUT' ? amt.toString() : '',
        balance: run.toString(),
      });
    }
    summary.push({ label: v === 'USD' ? 'vault.USD' : 'vault.IQD', value: run.toString(), fmt: v === 'USD' ? 'money' : 'iqd' });
    series.push({ name: v, points: [{ label: from, value: open.toString() }, ...[...pts.entries()].map(([label, value]) => ({ label, value }))] });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    type: 'vault',
    from,
    to,
    summary,
    chart: { kind: 'lines', title: 'common.balance', fmt: 'amountCur', series },
    tables: [
      {
        columns: [
          { key: 'date', label: 'common.date', fmt: 'date' },
          { key: 'vault', label: 'common.vault', fmt: 'vault' },
          { key: 'kind', label: 'common.type', fmt: 'kind' },
          { key: 'number', label: 'common.reference' },
          { key: 'description', label: 'common.description' },
          { key: 'in', label: 'common.in', fmt: 'amountCur' },
          { key: 'out', label: 'common.out', fmt: 'amountCur' },
          { key: 'balance', label: 'common.balanceAfter', fmt: 'moneyCur' },
        ],
        rows,
      },
    ],
  };
}

// ─── Rankings ──────────────────────────────────────────────────────────────────────────────────────
async function bestCustomers(p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT c.id, c.name,
      COUNT(*) FILTER (WHERE t.kind = 'SALE') AS invoices,
      COALESCE(SUM(CASE WHEN t.kind = 'SALE' THEN t."totalUsd" END),0) AS value,
      COALESCE(SUM(CASE WHEN t.kind = 'SALE' THEN t."cashPaidUsd" WHEN t.kind = 'CUSTOMER_PAYMENT' THEN t."totalUsd" END),0) AS cash,
      (SELECT COALESCE(SUM(pe."amountUsd"),0) FROM "PartyEntry" pe WHERE pe."customerId" = c.id) AS balance
    FROM "Customer" c JOIN "Txn" t ON t."customerId" = c.id AND t."deletedAt" IS NULL AND t.date >= ${from}::date AND t.date <= ${to}::date
    GROUP BY c.id, c.name
    HAVING COUNT(*) FILTER (WHERE t.kind = 'SALE') > 0
    ORDER BY value DESC, c.name ASC`;
  const out = rows.map((r, i) => ({ rank: i + 1, name: String(r.name), invoices: n(r.invoices), value: s(r.value), cash: s(r.cash), balance: round2(D(s(r.balance))).toString() }));
  const total = out.reduce((a, r) => a.plus(D(r.value)), new Dec(0));
  return {
    type: 'bestCustomers',
    from,
    to,
    summary: [
      { label: 'nav.customers', value: String(out.length), fmt: 'int' },
      { label: 'rep.revenue', value: round2(total).toString(), fmt: 'money' },
    ],
    chart: { kind: 'bars', title: 'dash.topCustomers', fmt: 'money', series: [{ name: 'value', points: out.slice(0, 10).map((r) => ({ label: r.name, value: r.value })) }] },
    tables: [
      {
        columns: [
          { key: 'rank', label: 'rep.rank', fmt: 'int' },
          { key: 'name', label: 'common.name' },
          { key: 'invoices', label: 'rep.invoiceCount', fmt: 'int' },
          { key: 'value', label: 'common.value', fmt: 'money' },
          { key: 'cash', label: 'cust.cashReceived', fmt: 'money' },
          { key: 'balance', label: 'cust.currentBalance', fmt: 'signedMoney' },
        ],
        rows: out,
      },
    ],
  };
}

async function bestBeneficiaries(p: ReportParams): Promise<ReportData> {
  const { from, to } = range(p);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT b.id, b.name, COUNT(DISTINCT t.id) AS cnt,
      COALESCE((SELECT SUM(l.kg) FROM "TxnLine" l JOIN "Txn" t2 ON t2.id = l."txnId" WHERE t2."beneficiaryId" = b.id AND t2.kind = 'PURCHASE' AND t2."deletedAt" IS NULL AND t2.date >= ${from}::date AND t2.date <= ${to}::date),0) AS kg,
      COALESCE(SUM(CASE WHEN t.kind = 'PURCHASE' THEN t."totalUsd" END),0) AS value,
      (SELECT COALESCE(SUM(pe."amountUsd"),0) FROM "PartyEntry" pe WHERE pe."beneficiaryId" = b.id) AS balance
    FROM "Beneficiary" b JOIN "Txn" t ON t."beneficiaryId" = b.id AND t."deletedAt" IS NULL AND t.date >= ${from}::date AND t.date <= ${to}::date
    GROUP BY b.id, b.name
    ORDER BY cnt DESC, value DESC, b.name ASC`;
  const out = rows.map((r, i) => ({ rank: i + 1, name: String(r.name), count: n(r.cnt), kg: s(r.kg), value: s(r.value), balance: round2(D(s(r.balance))).toString() }));
  return {
    type: 'bestBeneficiaries',
    from,
    to,
    summary: [
      { label: 'nav.beneficiaries', value: String(out.length), fmt: 'int' },
      { label: 'rep.transactions', value: String(out.reduce((a, r) => a + r.count, 0)), fmt: 'int' },
    ],
    chart: { kind: 'bars', title: 'dash.topBeneficiaries', fmt: 'int', series: [{ name: 'count', points: out.slice(0, 10).map((r) => ({ label: r.name, value: String(r.count) })) }] },
    tables: [
      {
        columns: [
          { key: 'rank', label: 'rep.rank', fmt: 'int' },
          { key: 'name', label: 'common.name' },
          { key: 'count', label: 'rep.transactions', fmt: 'int' },
          { key: 'kg', label: 'rep.kgTotal', fmt: 'kg' },
          { key: 'value', label: 'common.value', fmt: 'money' },
          { key: 'balance', label: 'ben.currentBalance', fmt: 'signedMoney' },
        ],
        rows: out,
      },
    ],
  };
}

export async function runReport(type: ReportType, p: ReportParams): Promise<ReportData> {
  switch (type) {
    case 'pl':
      return pl(p);
    case 'sales':
      return lineReport('SALE', p);
    case 'purchases':
      return lineReport('PURCHASE', p);
    case 'custAging':
      return aging('customer', p);
    case 'benAging':
      return aging('beneficiary', p);
    case 'inventory':
      return inventory(p);
    case 'vault':
      return vault(p);
    case 'bestCustomers':
      return bestCustomers(p);
    case 'bestBeneficiaries':
      return bestBeneficiaries(p);
  }
}
