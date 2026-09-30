// Report catalogue shared by the reports page, the API and the document renderer.
import type { DictKey } from './i18n';
import type { Col, Fmt } from './format';

export const REPORT_TYPES = ['pl', 'sales', 'purchases', 'custAging', 'benAging', 'inventory', 'vault', 'bestCustomers', 'bestBeneficiaries'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const isReportType = (v: unknown): v is ReportType => typeof v === 'string' && (REPORT_TYPES as readonly string[]).includes(v);

export type ReportFilter = 'customer' | 'beneficiary' | 'product' | 'type' | 'currency';

export const REPORT_META: Record<ReportType, { title: DictKey; desc: DictKey; landscape: boolean; filters: ReportFilter[] }> = {
  pl: { title: 'rep.pl', desc: 'rep.plDesc', landscape: true, filters: [] },
  sales: { title: 'rep.sales', desc: 'rep.salesDesc', landscape: true, filters: ['customer', 'product', 'type', 'currency'] },
  purchases: { title: 'rep.purchases', desc: 'rep.purchasesDesc', landscape: true, filters: ['beneficiary', 'product', 'type'] },
  custAging: { title: 'rep.custAging', desc: 'rep.custAgingDesc', landscape: true, filters: [] },
  benAging: { title: 'rep.benAging', desc: 'rep.benAgingDesc', landscape: true, filters: [] },
  inventory: { title: 'rep.inventory', desc: 'rep.inventoryDesc', landscape: true, filters: ['type'] },
  vault: { title: 'rep.vault', desc: 'rep.vaultDesc', landscape: true, filters: [] },
  bestCustomers: { title: 'rep.bestCustomers', desc: 'rep.bestCustomersDesc', landscape: false, filters: [] },
  bestBeneficiaries: { title: 'rep.bestBeneficiaries', desc: 'rep.bestBeneficiariesDesc', landscape: false, filters: [] },
};

export type SummaryItem = { label: DictKey; value: string; fmt: Fmt; tone?: 'auto' | 'neutral' };
export type ReportTable = { title?: DictKey; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };
export type ChartPoint = { label: string; value: string };
export type ReportChart = { kind: 'signedBars' | 'bars' | 'lines'; title: DictKey; fmt: Fmt; series: { name: string; points: ChartPoint[] }[] };

export type ReportData = {
  type: ReportType;
  from: string;
  to: string;
  summary: SummaryItem[];
  tables: ReportTable[];
  chart?: ReportChart;
};
