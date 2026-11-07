'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile, printDocument } from '@/lib/client/print';
import { fmtCell, isNumericFmt } from '@/lib/format';
import { fmtDate } from '@/lib/dates';
import { D } from '@/lib/money';
import { REPORT_META, REPORT_TYPES, type ReportData, type ReportType } from '@/lib/reports-meta';
import { cx } from '@/lib/cx';
import { Button, Card, EmptyState, PageHeader, Select, Skeleton } from '@/components/ui';
import { SummaryCell, SummaryStrip } from '@/components/Summary';
import { ArrowLeftRight, BarChart3, Boxes, HandCoins, PackagePlus, ShoppingCart, Trophy, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { addDaysIso, localTodayIso } from '@/lib/dates';
import type { DictKey } from '@/lib/i18n';

const REPORT_GROUPS: { label: DictKey; items: ReportType[] }[] = [
  { label: 'rep.gMoney', items: ['pl', 'sales', 'purchases', 'vault'] },
  { label: 'rep.gPeople', items: ['custAging', 'benAging', 'bestCustomers', 'bestBeneficiaries'] },
  { label: 'rep.gStock', items: ['inventory'] },
];
const REPORT_ICON: Record<ReportType, LucideIcon> = {
  pl: BarChart3,
  sales: ShoppingCart,
  purchases: PackagePlus,
  vault: Wallet,
  custAging: HandCoins,
  benAging: Truck,
  bestCustomers: Trophy,
  bestBeneficiaries: ArrowLeftRight,
  inventory: Boxes,
};
const PRESETS: { key: DictKey; range: () => { from: string; to: string } }[] = [
  { key: 'rep.pMonth', range: () => { const d = localTodayIso(); return { from: `${d.slice(0, 7)}-01`, to: d }; } },
  { key: 'rep.p3', range: () => { const d = localTodayIso(); return { from: addDaysIso(d, -90), to: d }; } },
  { key: 'rep.pYear', range: () => { const d = localTodayIso(); return { from: `${d.slice(0, 4)}-01-01`, to: d }; } },
  { key: 'rep.pAll', range: () => ({ from: '', to: '' }) },
];
import { Combobox, type Option } from '@/components/Combobox';
import { DateRange } from '@/components/DateInput';
import { ChartCard, HBarList, LineChart, SignedBarChart, compactMoney, useMonthLabel } from '@/components/charts';
import { useToast } from '@/components/Toast';

type Party = { id: string; name: string; phone: string; balance: string };
type Product = { id: string; name: string; sku: string };

export function ReportsView({ initial }: { initial: ReportType }) {
  const { t, lang } = useApp();
  const router = useRouter();
  const toast = useToast();
  const monthLabel = useMonthLabel();
  const [type, setType] = useState<ReportType>(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customer, setCustomer] = useState<Option<Party> | null>(null);
  const [ben, setBen] = useState<Option<Party> | null>(null);
  const [product, setProduct] = useState<Option<Product> | null>(null);
  const [typeId, setTypeId] = useState('');
  const [currency, setCurrency] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const types = useRemote<{ id: string; name: string }[]>('/api/lookup/types');
  const meta = REPORT_META[type];
  const f = meta.filters;

  const params = useMemo(
    () => ({
      from,
      to,
      customerId: f.includes('customer') ? customer?.id : undefined,
      beneficiaryId: f.includes('beneficiary') ? ben?.id : undefined,
      productId: f.includes('product') ? product?.id : undefined,
      typeId: f.includes('type') ? typeId : undefined,
      currency: f.includes('currency') ? currency : undefined,
    }),
    [from, to, customer, ben, product, typeId, currency, f],
  );
  const { data, loading, error } = useRemote<ReportData>(`/api/reports/${type}${qs(params)}`, { keepPrevious: true });
  const shown = data && data.type === type ? data : null;

  const pick = (x: ReportType) => {
    setType(x);
    router.replace(`/reports?type=${x}`, { scroll: false });
  };
  const url = (format: string) => `/api/reports/${type}${qs({ ...params, format })}`;
  async function exp(format: 'pdf' | 'csv' | 'print') {
    setBusy(format);
    const r = format === 'print' ? await printDocument(url('html')) : await downloadFile(url(format), `${type}.${format}`);
    setBusy(null);
    if (!r.ok) toast.error(r.error || t(format === 'pdf' ? 'err.pdf' : 'err.generic'));
    else if (format !== 'print') toast.success(t('toast.exported'));
  }

  return (
    <div>
      <PageHeader title={t('rep.title')} subtitle={t('rep.subtitle')} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Report picker: a select on phones, a list on wide screens */}
        <div className="xl:hidden">
          <Select aria-label={t('rep.title')} value={type} onChange={(e) => pick(e.target.value as ReportType)}>
            {REPORT_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(REPORT_META[x].title)}
              </option>
            ))}
          </Select>
        </div>
        {/* Nine reports in three small groups (Gestalt / chunking) instead of one long list. */}
        <Card as="div" className="hidden overflow-hidden py-2 xl:block">
          <nav aria-label={t('rep.title')}>
            {REPORT_GROUPS.map((g) => (
              <div key={g.label} className="px-2 py-1.5">
                <p className="px-3 pb-1 pt-1 text-caption font-semibold uppercase tracking-[0.06em] text-muted">{t(g.label)}</p>
                <ul>
                  {g.items.map((x) => {
                    const Icon = REPORT_ICON[x];
                    return (
                      <li key={x}>
                        <button
                          type="button"
                          onClick={() => pick(x)}
                          aria-current={x === type ? 'page' : undefined}
                          className={cx('flex h-14 w-full items-center gap-3 rounded-ctl px-4 text-start text-body transition-colors', x === type ? 'bg-brand font-bold text-on-brand' : 'text-ink hover:bg-surface-2')}
                        >
                          <Icon className={cx('h-4 w-4 shrink-0', x === type ? 'text-brand-ink' : 'text-muted')} aria-hidden="true" />
                          <span className="truncate">{t(REPORT_META[x].title)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-ink">{t(meta.title)}</h2>
                <p className="text-caption text-muted">
                  {shown ? t('rep.period', { from: fmtDate(shown.from), to: fmtDate(shown.to) }) : t(meta.desc)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" busy={busy === 'print'} onClick={() => exp('print')} icon={<Printer className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.print')}
                </Button>
                <Button variant="secondary" size="sm" busy={busy === 'csv'} onClick={() => exp('csv')} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.exportCsv')}
                </Button>
                <Button size="sm" busy={busy === 'pdf'} onClick={() => exp('pdf')} icon={<FileDown className="h-4 w-4" aria-hidden="true" />}>
                  {t('common.exportPdf')}
                </Button>
              </div>
            </div>
            {/* One-tap periods (least effort); exact dates still possible beside them. */}
            <div className="flex flex-wrap gap-1.5 border-t border-line-soft pt-3">
              {PRESETS.map((pr) => {
                const r = pr.range();
                const on = from === r.from && to === r.to;
                return (
                  <button
                    key={pr.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setFrom(r.from);
                      setTo(r.to);
                    }}
                    className={cx('h-14 rounded-ctl px-5 text-meta font-bold transition-all duration-200 hover:scale-105 active:scale-100 disabled:hover:scale-100', on ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted hover:text-ink')}
                  >
                    {t(pr.key)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
              <DateRange idPrefix="rep" from={from} to={to} onFrom={setFrom} onTo={setTo} />
              {f.includes('customer') ? (
                <div className="lg:w-60">
                  <Combobox<Party> id="rep-customer" value={customer} onChange={setCustomer} source={(q) => `/api/lookup/customers${qs({ q })}`} toOption={(p) => ({ id: p.id, label: p.name, data: p })} placeholder={`${t('pos.customer')}: ${t('common.all')}`} />
                </div>
              ) : null}
              {f.includes('beneficiary') ? (
                <div className="lg:w-60">
                  <Combobox<Party> id="rep-ben" value={ben} onChange={setBen} source={(q) => `/api/lookup/beneficiaries${qs({ q })}`} toOption={(p) => ({ id: p.id, label: p.name, data: p })} placeholder={`${t('pur.beneficiary')}: ${t('common.all')}`} />
                </div>
              ) : null}
              {f.includes('product') ? (
                <div className="lg:w-60">
                  <Combobox<Product> id="rep-product" value={product} onChange={setProduct} source={(q) => `/api/lookup/products${qs({ q })}`} toOption={(p) => ({ id: p.id, label: `${p.name} (${p.sku})`, data: p })} placeholder={`${t('common.product')}: ${t('common.all')}`} />
                </div>
              ) : null}
              {f.includes('type') ? (
                <Select aria-label={t('common.aluminumType')} value={typeId} onChange={(e) => setTypeId(e.target.value)} className="lg:w-48">
                  <option value="">{t('common.aluminumType')}: {t('common.all')}</option>
                  {(types.data ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              {f.includes('currency') ? (
                <Select aria-label={t('common.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)} className="lg:w-40">
                  <option value="">{t('common.currency')}: {t('common.all')}</option>
                  <option value="USD">USD</option>
                  <option value="IQD">IQD</option>
                </Select>
              ) : null}
            </div>
          </Card>

          {error && !shown ? <EmptyState body={error} /> : null}
          {!shown && !error ? <Skeleton className="h-64 w-full" /> : null}

          {shown ? (
            <div className={cx('flex flex-col gap-5 transition-opacity', loading && 'opacity-60')}>
              {shown.summary.length ? (
                <SummaryStrip cols={shown.summary.length % 3 === 0 ? 3 : shown.summary.length >= 4 ? 4 : 2}>
                  {shown.summary.map((s) => {
                    const d = D(s.value);
                    return (
                      <SummaryCell
                        key={s.label}
                        label={t(s.label)}
                        value={fmtCell(s.value, s.fmt, lang)}
                        tone={s.tone === 'auto' ? (d.isNegative() ? 'danger' : d.gt(0) ? 'success' : undefined) : undefined}
                      />
                    );
                  })}
                </SummaryStrip>
              ) : null}

              {shown.chart ? <ReportChartView chart={shown.chart} monthLabel={monthLabel} /> : null}

              {shown.tables.map((tb, ti) => (
                <Card key={ti} className="overflow-hidden">
                  {tb.title ? <h3 className="px-5 pb-2 pt-4 text-body font-semibold text-ink">{t(tb.title)}</h3> : null}
                  {tb.rows.length ? (
                    <div className="scroll-thin overflow-x-auto">
                      <table className="w-full min-w-[720px] text-meta">
                        <thead>
                          <tr className="border-y border-line-soft bg-surface-2 text-caption text-muted">
                            {tb.columns.map((c, i) => (
                              <th key={c.key} scope="col" className={cx('py-2.5 font-semibold whitespace-nowrap', i === 0 ? 'ps-5 pe-3' : 'px-3', isNumericFmt(c.fmt) ? 'text-end' : 'text-start')}>
                                {t(c.label)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tb.rows.map((r, ri) => (
                            <tr key={ri} className="border-b border-line-soft last:border-0">
                              {tb.columns.map((c, i) => {
                                const txt = fmtCell(r[c.key], c.fmt, lang, r, c.curKey);
                                const neg = isNumericFmt(c.fmt) && typeof r[c.key] === 'string' && (r[c.key] as string).startsWith('-');
                                return (
                                  <td key={c.key} className={cx('py-2.5', i === 0 ? 'ps-5 pe-3' : 'px-3', isNumericFmt(c.fmt) ? 'num text-end' : 'bidi', neg ? 'text-danger-ink' : 'text-ink')}>
                                    {txt}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                        {tb.totals ? (
                          <tfoot>
                            <tr className="border-t-2 border-brand/40 bg-surface-2 font-bold">
                              {tb.columns.map((c, i) => (
                                <td key={c.key} className={cx('py-2.5', i === 0 ? 'ps-5 pe-3' : 'px-3', isNumericFmt(c.fmt) ? 'num text-end' : '', 'text-ink')}>
                                  {i === 0 && !tb.totals![c.key] ? t('common.total') : fmtCell(tb.totals![c.key], c.fmt, lang, tb.totals, c.curKey)}
                                </td>
                              ))}
                            </tr>
                          </tfoot>
                        ) : null}
                      </table>
                    </div>
                  ) : (
                    <p className="px-5 py-10 text-center text-body text-muted">{t('rep.empty')}</p>
                  )}
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReportChartView({ chart, monthLabel }: { chart: NonNullable<ReportData['chart']>; monthLabel: (k: string, first?: boolean) => string }) {
  const { t, lang } = useApp();
  const fmt = (v: number, row?: Record<string, unknown>) => fmtCell(String(v), chart.fmt, lang, row);
  const isMonth = (l: string) => /^\d{4}-\d{2}$/.test(l);
  const lbl = (l: string, i: number) => (isMonth(l) ? monthLabel(l, i === 0) : /^\d{4}-\d{2}-\d{2}$/.test(l) ? fmtDate(l).slice(0, 5) : l);
  const empty = chart.series.every((s) => s.points.every((p) => D(p.value).isZero()));
  if (chart.kind === 'signedBars') {
    const pts = chart.series[0].points.map((p, i) => ({ key: p.label, label: lbl(p.label, i), sub: isMonth(p.label) ? monthLabel(p.label, true) : p.label, value: Number(p.value) }));
    return (
      <ChartCard title={t(chart.title)} empty={empty}>
        <SignedBarChart data={pts} fmtValue={(v) => fmt(v)} ariaLabel={t(chart.title)} posLabel={t('dash.profitMonths')} negLabel={t('dash.lossMonths')} />
      </ChartCard>
    );
  }
  if (chart.kind === 'bars') {
    return (
      <ChartCard title={t(chart.title)} empty={empty}>
        <HBarList ariaLabel={t(chart.title)} items={chart.series[0].points.map((p, i) => ({ key: `${i}`, label: p.label, value: Number(p.value) }))} fmtValue={(v) => fmt(v)} />
      </ChartCard>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {chart.series.map((s) => {
        const cur = s.name === 'IQD' ? 'IQD' : 'USD';
        return (
          <ChartCard key={s.name} title={`${t(chart.title)} · ${t(`vault.${cur}`)}`} empty={s.points.length < 2}>
            <LineChart
              data={s.points.map((p, i) => ({ key: `${p.label}-${i}`, label: lbl(p.label, i), sub: p.label.length === 10 ? fmtDate(p.label) : p.label, value: Number(p.value) }))}
              fmtValue={(v) => fmtCell(String(v), 'moneyCur', lang, { currency: cur })}
              fmtAxis={(v) => compactMoney(v, cur)}
              ariaLabel={t(chart.title)}
              seriesLabel={t(`vault.${cur}`)}
              allowNegative
            />
          </ChartCard>
        );
      })}
    </div>
  );
}
