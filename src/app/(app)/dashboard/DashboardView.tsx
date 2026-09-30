'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PackagePlus, ShoppingCart, Factory } from 'lucide-react';
import type { dashboard } from '@/lib/server/q/dashboard';
import { useApp } from '@/lib/client/app-context';
import { D, fmtMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Button, Card, PageHeader } from '@/components/ui';
import { ChartCard, HBarList, LineChart, SignedBarChart, compactMoney, useMonthLabel } from '@/components/charts';
import { TxnRows } from '@/components/TxnRows';

type Data = Awaited<ReturnType<typeof dashboard>>;

export function DashboardView({ data }: { data: Data }) {
  const { t, user, can, dataVersion } = useApp();
  const router = useRouter();
  const monthLabel = useMonthLabel();
  const first = useRef(true);

  // Any create/edit/delete elsewhere bumps dataVersion → re-fetch the server data.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [dataVersion, router]);

  const c = data.cards;
  const profit = D(c.profit);
  const profitPos = !profit.isNegative();
  const monthly = data.monthly.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), sub: `${monthLabel(m.month, true)}`, value: Number(m.profit) }));
  const sales = data.monthly.map((m, i) => ({ key: m.month, label: monthLabel(m.month, i === 0), sub: monthLabel(m.month, true), value: Number(m.revenue) }));
  const noData = !data.hasAnyData;

  return (
    <div>
      <PageHeader
        title={t('dash.title')}
        subtitle={t('dash.greeting', { name: user.name.split(' ')[0] })}
        actions={
          <>
            {can('beneficiaries') ? (
              <Link href="/beneficiaries/purchase">
                <Button variant="secondary" icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>
                  {t('dash.recordPurchase')}
                </Button>
              </Link>
            ) : null}
            {can('pos') ? (
              <Link href="/pos">
                <Button icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}>{t('pos.newSale')}</Button>
              </Link>
            ) : null}
          </>
        }
      />

      {noData ? (
        <Card className="mb-6 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-brand-ink">
            <Factory className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="text-title font-semibold text-ink">{t('dash.welcomeTitle')}</h2>
            <p className="mt-1 max-w-2xl text-body text-muted">{t('dash.welcomeBody')}</p>
          </div>
          {can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase">
              <Button>{t('dash.firstPurchase')}</Button>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {/* The headline: overall profit / loss, with the monthly picture beside it. */}
      <Card className="mb-5 grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(250px,1fr)_2fr] lg:gap-10">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <h2 className="text-body font-semibold text-muted">{t('dash.profit')}</h2>
            <p className={cx('fig mt-2 text-[44px] font-bold leading-none md:text-hero', profitPos ? 'text-success-ink' : 'text-danger-ink')}>{fmtMoney(profit)}</p>
            <p className="mt-3 text-meta text-muted">{t('dash.profitHint')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-line-soft pt-4">
            <div>
              <dt className="text-caption text-muted">{t('dash.revenueLine')}</dt>
              <dd className="num mt-0.5 text-body font-semibold text-ink">{fmtMoney(c.revenue)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">{t('dash.cogsLine')}</dt>
              <dd className="num mt-0.5 text-body font-semibold text-ink">{fmtMoney(c.cogs)}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-body font-semibold text-ink">{t('dash.monthlyPl')}</h3>
            <p className="text-caption text-muted">{t('dash.last12')}</p>
          </div>
          <SignedBarChart
            data={monthly}
            fmtValue={(v) => fmtMoney(v)}
            ariaLabel={t('dash.monthlyPl')}
            posLabel={t('dash.profitMonths')}
            negLabel={t('dash.lossMonths')}
            height={250}
          />
        </div>
      </Card>

      {/* Supporting figures */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t('dash.salesMonth')} value={fmtMoney(c.salesMonth)} sub={t('dash.invoicesCount', { n: c.salesMonthCount })} />
        <Stat label={t('dash.totalSales')} value={fmtMoney(c.totalSales)} sub={t('dash.invoicesCount', { n: c.totalSalesCount })} />
        <Stat
          label={t('dash.vaultBalance')}
          value={fmtMoney(c.vaultTotalUsd)}
          tone={D(c.vaultTotalUsd).isNegative() ? 'danger' : undefined}
          sub={
            <span className="flex flex-col gap-0.5">
              <span className="flex justify-between gap-2">
                <span>{t('vault.USD')}</span>
                <span className={cx('num', D(c.vaultUsd).isNegative() && 'text-danger-ink')}>{fmtMoney(c.vaultUsd)}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span>{t('vault.IQD')}</span>
                <span className={cx('num', D(c.vaultIqd).isNegative() && 'text-danger-ink')}>{fmtMoney(c.vaultIqd, 'IQD')}</span>
              </span>
              <span className="num text-end">≈ {fmtMoney(c.vaultIqdInUsd)}</span>
            </span>
          }
        />
        <Stat
          label={t('dash.bestCustomer')}
          value={c.bestCustomer ? <span className="bidi block truncate">{c.bestCustomer.name}</span> : <span className="text-muted">{t('dash.noneYet')}</span>}
          href={c.bestCustomer && can('customers') ? `/customers/${c.bestCustomer.id}` : undefined}
          sub={c.bestCustomer ? <span className="num">{fmtMoney(c.bestCustomer.value)}</span> : undefined}
          small
        />
        <Stat
          label={t('dash.bestBeneficiary')}
          value={c.bestBeneficiary ? <span className="bidi block truncate">{c.bestBeneficiary.name}</span> : <span className="text-muted">{t('dash.noneYetBen')}</span>}
          href={c.bestBeneficiary && can('beneficiaries') ? `/beneficiaries/${c.bestBeneficiary.id}` : undefined}
          sub={
            c.bestBeneficiary ? (
              <span className="flex flex-col">
                <span>{t('dash.txCount', { n: c.bestBeneficiary.count })}</span>
                <span>{t('dash.totalValue', { x: fmtMoney(c.bestBeneficiary.value) })}</span>
              </span>
            ) : undefined
          }
          small
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title={t('dash.salesByMonth')}
          subtitle={t('dash.last12')}
          empty={sales.every((s) => s.value === 0)}
          table={{ head: [t('common.month'), t('rep.revenue')], rows: data.monthly.map((m) => [monthLabel(m.month, true), fmtMoney(m.revenue)]), numericCols: [1] }}
        >
          <LineChart data={sales} fmtValue={(v) => fmtMoney(v)} fmtAxis={(v) => compactMoney(v)} ariaLabel={t('dash.salesByMonth')} seriesLabel={t('rep.revenue')} />
        </ChartCard>
        <ChartCard
          title={t('dash.topCustomers')}
          empty={!data.topCustomers.length}
          table={{ head: [t('common.name'), t('common.value')], rows: data.topCustomers.map((x) => [x.name, fmtMoney(x.value)]), numericCols: [1] }}
        >
          <HBarList
            ariaLabel={t('dash.topCustomers')}
            items={data.topCustomers.map((x) => ({ key: x.id, label: x.name, value: Number(x.value), sub: t('dash.invoicesCount', { n: x.count }) }))}
            fmtValue={(v) => fmtMoney(v)}
            href={can('customers') ? (id) => `/customers/${id}` : undefined}
          />
        </ChartCard>
        <ChartCard
          title={t('dash.topBeneficiaries')}
          empty={!data.topBeneficiaries.length}
          table={{ head: [t('common.name'), t('rep.transactions'), t('common.value')], rows: data.topBeneficiaries.map((x) => [x.name, String(x.count), fmtMoney(x.value)]), numericCols: [1, 2] }}
        >
          <HBarList
            ariaLabel={t('dash.topBeneficiaries')}
            items={data.topBeneficiaries.map((x) => ({ key: x.id, label: x.name, value: x.count, sub: t('dash.totalValue', { x: fmtMoney(x.value) }) }))}
            fmtValue={(v) => t('dash.txCount', { n: v })}
            href={can('beneficiaries') ? (id) => `/beneficiaries/${id}` : undefined}
          />
        </ChartCard>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-body font-semibold text-ink">{t('dash.recent')}</h2>
            <p className="mt-0.5 text-caption text-muted">{t('dash.recentHint')}</p>
          </div>
          <Link href="/dashboard/history" className="text-meta font-semibold text-brand-ink hover:underline">
            {t('common.viewAll')}
          </Link>
        </div>
        <TxnRows rows={data.recent} emptyText={t('hist.empty')} />
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tone, href, small }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'danger'; href?: string; small?: boolean }) {
  const body = (
    <>
      <p className="text-meta font-medium text-muted">{label}</p>
      <div className={cx('mt-1.5 font-bold text-ink', small ? 'text-title' : 'fig text-heading md:text-large', tone === 'danger' && 'text-danger-ink')}>{value}</div>
      {sub ? <div className="mt-2 text-caption text-muted">{sub}</div> : null}
    </>
  );
  const cls = 'block min-w-0 rounded-card border border-line-soft bg-surface p-4 shadow-card';
  return href ? (
    <Link href={href} className={cx(cls, 'transition-colors hover:border-line')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
