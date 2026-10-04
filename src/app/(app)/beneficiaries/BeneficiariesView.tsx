'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PackagePlus, UserPlus } from 'lucide-react';
import type { purchasesOverview } from '@/lib/server/q/purchases';
import type { TxnRow } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDate } from '@/lib/dates';
import { D, fmtCost, fmtKg, fmtMoney, fmtPrice } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, PageHeader, Select } from '@/components/ui';
import { PartyList } from '@/components/parties/PartyList';
import { PartyFormDialog } from '@/components/PartyForm';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateRange } from '@/components/DateInput';
import { ChartCard, HBarList, LineChart, compactMoney, useMonthLabel } from '@/components/charts';
import { statusTone } from '@/components/TxnRows';
import { useTxnPanel } from '@/components/TxnPanel';

type Tab = 'list' | 'purchases';

export function BeneficiariesView({ initialTab }: { initialTab: Tab }) {
  const { t } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [adding, setAdding] = useState(false);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'list', label: t('ben.tabList') },
    { id: 'purchases', label: t('ben.tabPurchases') },
  ];
  return (
    <div>
      <PageHeader
        title={t('ben.title')}
        subtitle={t('ben.subtitle')}
        actions={
          <>
            <Button variant="secondary" size="lg" onClick={() => setAdding(true)} icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
              {t('ben.add')}
            </Button>
            <Link href="/beneficiaries/purchase">
              <Button size="lg" className="shadow-pop" icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>{t('ben.newPurchase')}</Button>
            </Link>
          </>
        }
      />
      <div role="tablist" aria-label={t('ben.title')} className="mb-5 flex gap-6 border-b border-line">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            id={`tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`panel-${x.id}`}
            onClick={() => {
              setTab(x.id);
              router.replace(x.id === 'list' ? '/beneficiaries' : '/beneficiaries?tab=purchases', { scroll: false });
            }}
            className={cx(
              '-mb-px h-11 border-b-2 text-body font-semibold transition-colors',
              tab === x.id ? 'border-brand text-brand-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'list' ? (
          <PartyList kind="beneficiary" adding={adding} setAdding={setAdding} />
        ) : (
          <>
            <PurchasesOverview />
            <PartyFormDialog kind="beneficiary" open={adding} onClose={() => setAdding(false)} onSaved={(p) => router.push(`/beneficiaries/${p.id}`)} />
          </>
        )}
      </div>
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof purchasesOverview>>;

function PurchasesOverview() {
  const { t } = useApp();
  const panel = useTxnPanel();
  const monthLabel = useMonthLabel();
  const L = useListState('date', 'desc', { typeId: '', from: '', to: '' });
  const types = useRemote<{ id: string; name: string }[]>('/api/lookup/types');
  const ov = useRemote<Overview>(`/api/purchases/overview${qs({ q: L.q, typeId: L.filters.typeId, from: L.filters.from, to: L.filters.to })}`, { keepPrevious: true });
  const list = useRemote<{ total: number; rows: TxnRow[] }>(`/api/purchases${L.query}`, { keepPrevious: true });
  const o = ov.data;

  const cols: Column<TxnRow>[] = [
    { key: 'number', label: t('common.number'), sortable: true, render: (r) => <span className="num font-semibold text-brand-ink">{r.number}</span> },
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num text-muted">{fmtDate(r.date)}</span> },
    { key: 'party', label: t('nav.beneficiaries'), sortable: true, render: (r) => <span className="bidi block max-w-[200px] truncate text-ink">{r.partyName}</span> },
    {
      key: 'product',
      label: t('common.product'),
      render: (r) => (
        <span className="block min-w-0">
          <span className="bidi block max-w-[220px] truncate text-ink">{r.products}</span>
          <span className="num text-caption text-muted">{r.skus} · {r.types}</span>
        </span>
      ),
    },
    { key: 'kg', label: t('common.kg'), sortable: true, align: 'end', render: (r) => <span className="num text-ink">{fmtKg(r.kg)}</span> },
    { key: 'price', label: t('common.unitPriceShort'), align: 'end', render: (r) => <span className="num text-muted">{r.unitPrice ? fmtPrice(r.unitPrice, r.currency) : '—'}</span> },
    { key: 'total', label: t('common.total'), sortable: true, align: 'end', render: (r) => <span className="num font-semibold text-ink">{fmtMoney(r.total, r.currency)}</span> },
    { key: 'status', label: t('common.status'), render: (r) => <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <SearchBox value={L.q} onChange={L.setQ} placeholder={t('hist.searchPh')} className="lg:w-72" />
        <Select aria-label={t('common.aluminumType')} value={L.filters.typeId} onChange={(e) => L.setFilter('typeId', e.target.value)} className="lg:w-48">
          <option value="">{t('common.aluminumType')}: {t('common.all')}</option>
          {(types.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <DateRange idPrefix="pur" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
        {L.hasFilters ? (
          <Button variant="quiet" size="sm" onClick={L.clearFilters}>
            {t('common.clearFilters')}
          </Button>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Figure label={t('pur.totalKg')} value={o ? fmtKg(o.cards.totalKg) : '—'} />
        <Figure label={t('pur.totalValue')} value={o ? fmtMoney(o.cards.totalValue) : '—'} />
        <Figure label={t('pur.avgPrice')} value={o ? fmtCost(o.cards.avgPrice) : '—'} />
        <Figure label={t('pur.count')} value={o ? String(o.cards.count) : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title={t('pur.monthlyValue')}
          subtitle={t('dash.last12')}
          empty={!o || o.monthlyValue.every((m) => D(m.value).isZero())}
          table={o ? { head: [t('common.month'), t('common.value'), t('common.kg')], rows: o.monthlyValue.map((m, i) => [monthLabel(m.label, true), fmtMoney(m.value), fmtKg(o.monthlyKg[i].value)]), numericCols: [1, 2] } : undefined}
        >
          {o ? (
            <LineChart
              data={o.monthlyValue.map((m, i) => ({ key: m.label, label: monthLabel(m.label, i === 0), sub: monthLabel(m.label, true), value: Number(m.value) }))}
              fmtValue={(v) => fmtMoney(v)}
              fmtAxis={(v) => compactMoney(v)}
              ariaLabel={t('pur.monthlyValue')}
              seriesLabel={t('common.value')}
            />
          ) : null}
        </ChartCard>
        <ChartCard title={t('pur.kgByType')} empty={!o?.kgByType.length} table={o ? { head: [t('common.type'), t('common.kg')], rows: o.kgByType.map((x) => [x.label, fmtKg(x.value)]), numericCols: [1] } : undefined}>
          {o ? <HBarList ariaLabel={t('pur.kgByType')} items={o.kgByType.map((x) => ({ key: x.label, label: x.label, value: Number(x.value) }))} fmtValue={(v) => fmtKg(v)} /> : null}
        </ChartCard>
        <ChartCard title={t('pur.valueByBen')} empty={!o?.valueByBeneficiary.length} table={o ? { head: [t('common.name'), t('common.value')], rows: o.valueByBeneficiary.map((x) => [x.label, fmtMoney(x.value)]), numericCols: [1] } : undefined}>
          {o ? <HBarList ariaLabel={t('pur.valueByBen')} items={o.valueByBeneficiary.map((x) => ({ key: x.label, label: x.label, value: Number(x.value) }))} fmtValue={(v) => fmtMoney(v)} /> : null}
        </ChartCard>
      </div>

      <Card className="overflow-hidden">
        <h2 className="px-5 pb-3 pt-5 text-title font-semibold text-ink">{t('pur.all')}</h2>
        <DataTable
          rows={list.data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={list.loading}
          onRowClick={(r) => panel.open(r.id)}
          minWidth={900}
          caption={t('pur.all')}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : t('pur.empty')}</p>}
          mobile={(r) => (
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="num block text-meta font-semibold text-brand-ink">{r.number}</span>
                <span className="bidi block truncate text-body text-ink">{r.partyName}</span>
                <span className="bidi block truncate text-caption text-muted">
                  {r.products} · <span className="num">{fmtKg(r.kg)}</span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-body font-semibold text-ink">{fmtMoney(r.total, r.currency)}</span>
                <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge>
              </span>
            </span>
          )}
        />
        {list.data ? <Pager total={list.data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-meta font-medium text-muted">{label}</p>
      <p className="fig mt-1.5 text-heading font-bold text-ink md:text-large">{value}</p>
    </Card>
  );
}
