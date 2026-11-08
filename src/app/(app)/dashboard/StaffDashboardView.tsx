'use client';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, PackagePlus, ShoppingCart, Wallet } from 'lucide-react';
import type { StaffDashboard } from '@/lib/server/q/dashboard';
import { useApp } from '@/lib/client/app-context';
import { D, fmtMoney, type Cur } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { Button, Card } from '@/components/ui';
import { LineChart, compactMoney, useMonthLabel } from '@/components/charts';
import { SectionLabel } from '@/components/Summary';
import { useTxnPanel } from '@/components/TxnPanel';

/**
 * A staff member's dashboard: their own vault and their own sales. No factory totals, no cost of goods and no
 * profit — those are the owner's. Every figure here comes from documents this user recorded.
 */
export function StaffDashboardView({ data }: { data: StaffDashboard }) {
  const { t, user, can } = useApp();
  const panel = useTxnPanel();
  const monthLabel = useMonthLabel();
  const v = data.vault;
  const owes = v.duesCount > 0;
  const sales = data.salesByMonth.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), value: Number(m.revenue) }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="bidi text-large font-bold tracking-[-0.02em] text-ink md:text-[34px] md:leading-[40px]">{t('dash.greeting', { name: user.name.split(' ')[0] })}</h1>
          <p className="mt-1 text-body text-muted">{t('staffDash.subtitle')}</p>
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

      <section aria-labelledby="sd-vault">
        <SectionLabel id="sd-vault">{t('staffDash.myVault')}</SectionLabel>
        {owes ? (
          <div role="alert" className="mb-3 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-tint px-5 py-4 text-danger-ink">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-body font-semibold">
              {t('staffDash.dues', {
                x: [D(v.duesUsd).gt(0) ? fmtMoney(v.duesUsd, 'USD') : '', D(v.duesIqd).gt(0) ? fmtMoney(v.duesIqd, 'IQD') : ''].filter(Boolean).join(' + '),
              })}
            </p>
            {can('vault') ? (
              <Link href="/vault/dues" className="shrink-0 self-center text-meta font-semibold underline-offset-4 hover:underline">
                {t('money.open')}
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(['USD', 'IQD'] as const).map((cur) => {
            const bal = D(v[cur]);
            const s = v.series.find((x) => x.vault === cur)?.series ?? [];
            const pts = s.map((p) => ({ key: p.date, label: fmtDate(p.date).slice(0, 5), sub: fmtDate(p.date), value: Number(p.value) }));
            return (
              <Card key={cur} className={cx('min-w-0 p-5', bal.isNegative() && 'border-danger/30')}>
                <h2 className="flex items-center gap-2 text-body font-semibold text-muted">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  {t(`vault.${cur}`)}
                </h2>
                <p className={cx('fig mt-1.5 text-[34px] font-bold leading-none', bal.isNegative() ? 'text-danger-ink' : 'text-ink')}>{fmtMoney(bal, cur as Cur)}</p>
                <p className="mb-2 mt-3 text-caption text-muted">{t('vault.last30')}</p>
                <LineChart
                  data={pts}
                  fmtValue={(x) => fmtMoney(x, cur)}
                  fmtAxis={(x) => compactMoney(x, cur)}
                  ariaLabel={`${t(`vault.${cur}`)} — ${t('vault.last30')}`}
                  seriesLabel={t('common.balance')}
                  allowNegative
                  height={140}
                />
              </Card>
            );
          })}
        </div>
        {can('vault') ? (
          <Link href="/vault" className="mt-2 inline-flex min-h-11 items-center gap-1 text-meta font-semibold text-brand-ink hover:underline">
            {t('staffDash.openVault')}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="sd-sales">
        <SectionLabel id="sd-sales">{t('staffDash.mySales')}</SectionLabel>
        <Card className="grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(220px,1fr)_2fr] lg:gap-10">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <dt className="text-caption text-muted">{t('staffDash.salesMonth')}</dt>
              <dd className="num mt-0.5 text-title font-bold text-ink">{fmtMoney(data.month.sales)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">{t('staffDash.invoicesMonth')}</dt>
              <dd className="num mt-0.5 text-title font-bold text-ink">{data.month.count}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">{t('staffDash.cashMonth')}</dt>
              <dd className="num mt-0.5 text-title font-bold text-success-ink">{fmtMoney(data.month.cash)}</dd>
            </div>
          </dl>
          <div className="min-w-0">
            <h3 className="text-body font-semibold text-ink">{t('staffDash.salesByMonth')}</h3>
            <p className="mb-3 text-caption text-muted">{t('staffDash.last6')}</p>
            <LineChart data={sales} fmtValue={(x) => fmtMoney(x)} fmtAxis={(x) => compactMoney(x)} ariaLabel={t('staffDash.salesByMonth')} seriesLabel={t('rep.revenue')} height={220} />
          </div>
        </Card>
      </section>

      <section aria-labelledby="sd-recent">
        <SectionLabel id="sd-recent">{t('staffDash.myRecent')}</SectionLabel>
        <Card className="overflow-hidden">
          {data.recent.length ? (
            <ul className="divide-y divide-line-soft">
              {data.recent.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => panel.open(r.id)} className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-start hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="num block text-meta font-semibold text-brand-ink">{r.number}</span>
                      <span className="bidi block truncate text-caption text-muted">
                        {t(`kind.${r.kind}` as 'kind.SALE')}
                        {r.party ? ` · ${r.party}` : ''} · <span className="num">{fmtDate(r.date)}</span>
                      </span>
                    </span>
                    {D(r.total).gt(0) ? <span className="num shrink-0 font-semibold text-ink">{fmtMoney(r.total, r.currency as Cur)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-body text-muted">{t('staffDash.noRecent')}</p>
          )}
        </Card>
      </section>
    </div>
  );
}
