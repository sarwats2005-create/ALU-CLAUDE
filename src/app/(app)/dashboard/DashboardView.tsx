'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, Factory, HandCoins, PackagePlus, ShoppingCart, Truck, Wallet } from 'lucide-react';
import type { dashboard } from '@/lib/server/q/dashboard';
import { useApp } from '@/lib/client/app-context';
import { D, fmtKg, fmtMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Segmented } from '@/components/ui';
import { HBarList, LineChart, SignedBarChart, compactMoney, useMonthLabel } from '@/components/charts';
import { statusTone } from '@/components/TxnRows';
import { SectionLabel, SummaryCell, SummaryStrip } from '@/components/Summary';
import { useTxnPanel } from '@/components/TxnPanel';
import type { TxnRow } from '@/lib/server/q/history';
import { fmtDate } from '@/lib/dates';

type Data = Awaited<ReturnType<typeof dashboard>>;

// Layout follows a few UX-psychology rules:
//  • Serial position — the first band is "where the money is right now", the last is "what just happened".
//  • Hick's law — one primary action (New sale) and one secondary; one chart with a Profit/Sales switch
//    instead of three charts; one partners list with a Customers/Beneficiaries switch.
//  • Fitts's law — the primary action is the largest, highest-contrast button at the top.
//  • Gestalt (proximity/similarity) — the four money figures share one card and one shape.
//  • Von Restorff + colour & emotion — colour is reserved for meaning: green = good, red = needs action,
//    brand blue = act. Everything else is neutral ink, so problems stand out.
//  • Cognitive load / progressive disclosure — headline figure first, detail one tap away.

export function DashboardView({ data }: { data: Data }) {
  const { t, user, can, lang, dataVersion } = useApp();
  const router = useRouter();
  const monthLabel = useMonthLabel();
  const first = useRef(true);
  const [trend, setTrend] = useState<'profit' | 'sales'>('profit');
  const [partners, setPartners] = useState<'customers' | 'beneficiaries'>('customers');

  // Any create/edit/delete elsewhere bumps dataVersion → re-fetch the server data.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [dataVersion, router]);

  const c = data.cards;
  const cur = data.monthly[data.monthly.length - 1];
  const prev = data.monthly[data.monthly.length - 2];
  const monthProfit = D(cur?.profit ?? 0);
  const prevProfit = D(prev?.profit ?? 0);
  const delta = prevProfit.isZero() ? null : monthProfit.minus(prevProfit).div(prevProfit.abs()).times(100);
  const series = data.monthly.map((m, i) => ({
    key: m.month,
    label: monthLabel(m.month, i === 0),
    sub: monthLabel(m.month, true),
    value: Number(trend === 'profit' ? m.profit : m.revenue),
  }));
  // Formatted in the browser (its own time zone and locale data), so server and client never disagree.
  const [today, setToday] = useState('');
  useEffect(() => {
    const now = new Date();
    setToday(
      lang === 'ku'
        ? `${t(`day.${now.getDay()}` as 'day.0')}، ${now.getDate()}ی ${t(`month.${now.getMonth() + 1}` as 'month.1')} ${now.getFullYear()}`
        : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
    );
  }, [lang, t]);
  const cash = D(c.vaultTotalUsd);
  const dues = D(c.duesTotalUsd);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header: who / when, and the two things people come here to do ── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="min-h-[18px] text-meta font-medium text-muted">{today}</p>
          <h1 className="bidi mt-1 text-large font-bold tracking-[-0.02em] text-ink md:text-[34px] md:leading-[40px]">{t('dash.greeting', { name: user.name.split(' ')[0] })}</h1>
        </div>
        <div data-on-canvas className="flex flex-col-reverse gap-2 sm:flex-row">
          {can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase" className="sm:w-auto">
              <Button variant="secondary" size="lg" block icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}>
                {t('dash.recordPurchase')}
              </Button>
            </Link>
          ) : null}
          {can('pos') ? (
            <Link href="/pos" className="sm:w-auto">
              <Button size="lg" block className="px-7" icon={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}>
                {t('pos.newSale')}
              </Button>
            </Link>
          ) : null}
        </div>
      </header>

      {!data.hasAnyData ? (
        <Card className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tint text-brand-ink">
            <Factory className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="text-title font-semibold text-ink">{t('dash.welcomeTitle')}</h2>
            <p className="mt-1 max-w-2xl text-body text-muted">{t('dash.welcomeBody')}</p>
          </div>
          {can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase">
              <Button size="lg">{t('dash.firstPurchase')}</Button>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {/* ── 1. Money position: one card, four equal cells ── */}
      <section aria-labelledby="dash-position">
        <SectionLabel id="dash-position">{t('dash.position')}</SectionLabel>
        <SummaryStrip>
          <SummaryCell
            icon={<Wallet className="h-[18px] w-[18px]" aria-hidden="true" />}
            label={t('dash.cash')}
            value={fmtMoney(cash)}
            tone={cash.isNegative() ? 'danger' : undefined}
            sub={
              <span className="num">
                {fmtMoney(c.vaultUsd)} · {fmtMoney(c.vaultIqd, 'IQD')}
              </span>
            }
            href={can('vault') ? '/vault' : undefined}
          />
          <SummaryCell
            icon={<HandCoins className="h-[18px] w-[18px]" aria-hidden="true" />}
            label={t('dash.receivable')}
            value={fmtMoney(c.receivable)}
            sub={t('dash.customersN', { n: c.receivableCount })}
            href={can('customers') ? '/customers' : undefined}
          />
          <SummaryCell
            icon={<Truck className="h-[18px] w-[18px]" aria-hidden="true" />}
            label={t('dash.payable')}
            value={fmtMoney(c.payable)}
            sub={t('dash.suppliersN', { n: c.payableCount })}
            href={can('beneficiaries') ? '/beneficiaries' : undefined}
          />
          {dues.gt(0) ? (
            <SummaryCell
              icon={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />}
              label={t('dash.dues')}
              value={fmtMoney(dues)}
              tone="danger"
              alert
              sub={t('dash.duesN', { n: c.duesCount })}
              href={can('vault') ? '/vault/dues' : undefined}
            />
          ) : (
            <SummaryCell
              icon={<CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />}
              label={t('dash.dues')}
              value={<span className="text-success-ink">{t('dash.duesNone')}</span>}
              sub={t('dash.duesNoneSub')}
            />
          )}
        </SummaryStrip>
      </section>

      {/* ── 2. Performance: one headline figure, one switchable chart ── */}
      <section aria-labelledby="dash-perf">
        <SectionLabel id="dash-perf">{t('dash.performance')}</SectionLabel>
        <Card className="grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(260px,1fr)_2fr] lg:gap-10">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-body font-semibold text-muted">{t('dash.monthProfit')}</p>
              <p className={cx('fig mt-2 text-[44px] font-bold leading-none md:text-hero', monthProfit.isNegative() ? 'text-danger-ink' : 'text-ink')}>{fmtMoney(monthProfit)}</p>
              {delta ? (
                <p
                  className={cx(
                    'mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold',
                    delta.isNegative() ? 'bg-danger-tint text-danger-ink' : 'bg-success-tint text-success-ink',
                  )}
                >
                  {delta.isNegative() ? <ArrowDownRight className="h-4 w-4" aria-hidden="true" /> : <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
                  <span className="num">{t('dash.vsLast', { x: `${delta.isNegative() ? '−' : '+'}${delta.abs().toFixed(0)}%` })}</span>
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-line-soft pt-4 sm:grid-cols-3 lg:grid-cols-1">
              <Mini label={t('dash.salesMonth')} value={fmtMoney(c.salesMonth)} sub={t('dash.invoicesCount', { n: c.salesMonthCount })} />
              <Mini label={t('dash.expensesMonth')} value={fmtMoney(c.expensesMonth)} sub={t('dash.expensesN', { n: c.expensesMonthCount })} href={can('expenses') ? '/expenses' : undefined} />
              <Mini label={t('dash.allTime')} value={fmtMoney(c.profit)} sub={t('dash.profitHint')} tone={D(c.profit).isNegative() ? 'danger' : 'success'} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-body font-semibold text-ink">{trend === 'profit' ? t('dash.monthlyPl') : t('dash.salesByMonth')}</h3>
                <p className="text-caption text-muted">{t('dash.last12')}</p>
              </div>
              <Segmented<'profit' | 'sales'>
                label={t('dash.trendSwitch')}
                size="sm"
                value={trend}
                onChange={setTrend}
                options={[
                  { value: 'profit', label: t('dash.tProfit') },
                  { value: 'sales', label: t('dash.tSales') },
                ]}
              />
            </div>
            {trend === 'profit' ? (
              <SignedBarChart data={series} fmtValue={(v) => fmtMoney(v)} ariaLabel={t('dash.monthlyPl')} posLabel={t('dash.profitMonths')} negLabel={t('dash.lossMonths')} height={260} />
            ) : (
              <LineChart data={series} fmtValue={(v) => fmtMoney(v)} fmtAxis={(v) => compactMoney(v)} ariaLabel={t('dash.salesByMonth')} seriesLabel={t('rep.revenue')} height={260} />
            )}
          </div>
        </Card>
      </section>

      {/* ── 3. Activity: what just happened, and who matters most ── */}
      <section aria-labelledby="dash-activity" className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
            <h2 id="dash-activity" className="text-body font-semibold text-ink">
              {t('dash.recentShort')}
            </h2>
            <Link href="/dashboard/history" className="inline-flex items-center gap-0.5 rounded text-meta font-semibold text-brand-ink hover:underline">
              {t('common.viewAll')}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
          <RecentList rows={data.recent} emptyText={t('hist.empty')} />
        </Card>
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
            <h2 className="text-body font-semibold text-ink">{t('dash.partners')}</h2>
            <Segmented<'customers' | 'beneficiaries'>
              label={t('dash.partners')}
              size="sm"
              value={partners}
              onChange={setPartners}
              options={[
                { value: 'customers', label: t('nav.customers') },
                { value: 'beneficiaries', label: t('nav.beneficiaries') },
              ]}
            />
          </div>
          <div className="px-5 pb-5">
            {(partners === 'customers' ? data.topCustomers : data.topBeneficiaries).length === 0 ? (
              <p className="py-8 text-center text-meta text-muted">{partners === 'customers' ? t('dash.noneYet') : t('dash.noneYetBen')}</p>
            ) : partners === 'customers' ? (
              <HBarList
                ariaLabel={t('dash.topCustomers')}
                items={data.topCustomers.map((x) => ({ key: x.id, label: x.name, value: Number(x.value), sub: t('dash.invoicesCount', { n: x.count }) }))}
                fmtValue={(v) => fmtMoney(v)}
                href={can('customers') ? (id) => `/customers/${id}` : undefined}
              />
            ) : (
              <HBarList
                ariaLabel={t('dash.topBeneficiaries')}
                items={data.topBeneficiaries.map((x) => ({ key: x.id, label: x.name, value: x.count, sub: t('dash.totalValue', { x: fmtMoney(x.value) }) }))}
                fmtValue={(v) => t('dash.txCount', { n: v })}
                href={can('beneficiaries') ? (id) => `/beneficiaries/${id}` : undefined}
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Mini({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: 'danger' | 'success'; href?: string }) {
  const inner = (
    <>
      <p className="text-caption text-muted">{label}</p>
      <p className={cx('mt-0.5 text-lead font-bold', tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink')}>
        <span className="num">{value}</span>
      </p>
      {sub ? <p className="text-caption text-muted">{sub}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="-m-2 block rounded-ctl p-2 hover:bg-surface-2">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

/** Latest documents as a two-line list: what + who on one side, how much + when on the other.
 *  Only unpaid / partly paid get a badge, so the eye goes straight to them. */
function RecentList({ rows, emptyText }: { rows: TxnRow[]; emptyText: string }) {
  const { t } = useApp();
  const panel = useTxnPanel();
  if (!rows.length) return <p className="px-5 pb-8 pt-4 text-center text-meta text-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-line-soft border-t border-line-soft">
      {rows.map((r) => {
        const who = r.partyName || r.label || (r.kind === 'PROCESSING' ? r.products : '');
        const flag = r.status === 'unpaid' || r.status === 'partial';
        return (
          <li key={r.id}>
            <button type="button" onClick={() => panel.open(r.id)} className="flex w-full items-center gap-4 px-5 py-3 text-start transition-colors hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                  <span className="truncate text-meta text-ink">{t(`kind.${r.kind}` as 'kind.SALE')}</span>
                  {flag ? <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge> : null}
                </span>
                <span className="mt-0.5 block truncate text-caption text-muted">
                  <bdi>{who || '—'}</bdi>
                </span>
              </span>
              <span className="shrink-0 text-end">
                <span className="num block text-body font-semibold text-ink">{r.kind === 'PROCESSING' ? fmtKg(r.kg) : fmtMoney(r.total, r.currency)}</span>
                <span className="num block text-caption text-muted">{fmtDate(r.date)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
