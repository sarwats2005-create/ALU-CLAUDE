'use client';
import { useRouter } from 'next/navigation';
import { UserPlus, Users, Truck } from 'lucide-react';
import type { listParties } from '@/lib/server/q/parties';
import { useApp } from '@/lib/client/app-context';
import { useRemote } from '@/lib/client/use-remote';
import { balanceLabel } from '@/lib/format';
import { D, fmtMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, EmptyState } from '../ui';
import { DataTable, FilterPills, Pager, SearchBox, useListState, type Column } from '../DataTable';
import { Avatar, PartyFormDialog, type PartyKind } from '../PartyForm';

type Data = Awaited<ReturnType<typeof listParties>>;
type Row = Data['rows'][number];

export function BalanceText({ side, balance, className }: { side: PartyKind; balance: string; className?: string }) {
  const { lang } = useApp();
  const b = balanceLabel(side, balance, lang);
  return (
    <span className={cx('inline-flex flex-col items-end', className)}>
      <span className={cx('num font-semibold', b.tone === 'danger' ? 'text-danger-ink' : b.tone === 'success' ? 'text-success-ink' : 'text-muted')}>
        {b.tone === 'neutral' ? fmtMoney(0) : fmtMoney(D(balance).abs())}
      </span>
      <span className="text-caption text-muted">{b.short}</span>
    </span>
  );
}

/** Customers / beneficiaries list: search, balance filter, sortable columns, mobile cards. */
export function PartyList({ kind, adding, setAdding }: { kind: PartyKind; adding: boolean; setAdding: (v: boolean) => void }) {
  const { t } = useApp();
  const router = useRouter();
  const isC = kind === 'customer';
  const base = isC ? '/customers' : '/beneficiaries';
  const L = useListState('name', 'asc', { state: '' });
  const { data, loading } = useRemote<Data>(`/api${base}${L.query}`, { keepPrevious: true });

  const cols: Column<Row>[] = [
    {
      key: 'name',
      label: t('common.name'),
      sortable: true,
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} src={r.hasAvatar ? `/api/customers/${r.id}/avatar?v=${r.avatarV}` : null} size={34} />
          <span className="min-w-0">
            <span className="bidi block truncate font-semibold text-ink">{r.name}</span>
            {r.address ? <span className="bidi block max-w-[280px] truncate text-caption text-muted">{r.address}</span> : null}
          </span>
          {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
        </span>
      ),
    },
    { key: 'phone', label: t('common.phone'), render: (r) => <span className="num text-muted" dir="ltr">{r.phone || '—'}</span> },
    { key: 'count', label: isC ? t('rep.invoiceCount') : t('rep.transactions'), sortable: true, align: 'end', render: (r) => <span className="num text-ink">{isC ? r.mainCount : r.txCount}</span> },
    { key: 'total', label: isC ? t('cust.totalSales') : t('ben.totalPurchases'), sortable: true, align: 'end', render: (r) => <span className="num font-semibold text-ink">{fmtMoney(r.total)}</span> },
    { key: 'balance', label: t('common.balance'), sortable: true, align: 'end', render: (r) => <BalanceText side={kind} balance={r.balance} /> },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pb-4 pt-5 md:flex-row md:items-center md:justify-between">
          <SearchBox value={L.q} onChange={L.setQ} placeholder={t('cust.searchPh')} className="md:w-80" />
          <FilterPills
            label={t('common.filters')}
            value={L.filters.state}
            onChange={(v) => L.setFilter('state', v)}
            options={[
              { value: '', label: t('common.all') },
              { value: 'owes', label: isC ? t('due.filterOwes') : t('due.filterFactoryOwes') },
              { value: 'settled', label: t('due.filterSettled') },
              { value: 'credit', label: isC ? t('due.filterCredit') : t('due.filterAdvance') },
            ]}
          />
        </div>
        <DataTable
          rows={data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={loading}
          onRowClick={(r) => router.push(`${base}/${r.id}`)}
          caption={isC ? t('cust.title') : t('ben.title')}
          empty={
            L.hasFilters ? (
              <p className="text-body text-muted">{t('common.noResults')}</p>
            ) : (
              <EmptyState
                icon={isC ? <Users className="h-6 w-6" aria-hidden="true" /> : <Truck className="h-6 w-6" aria-hidden="true" />}
                body={isC ? t('cust.empty') : t('ben.empty')}
                action={
                  <Button onClick={() => setAdding(true)} icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
                    {isC ? t('cust.add') : t('ben.add')}
                  </Button>
                }
              />
            )
          }
          mobile={(r) => (
            <span className="flex items-center gap-3">
              <Avatar name={r.name} src={r.hasAvatar ? `/api/customers/${r.id}/avatar?v=${r.avatarV}` : null} size={40} />
              <span className="min-w-0 flex-1">
                <span className="bidi block truncate text-body font-semibold text-ink">{r.name}</span>
                <span className="num block text-caption text-muted" dir="ltr">
                  {r.phone || '—'}
                </span>
                <span className="block text-caption text-muted">{isC ? t('cust.salesCount', { n: r.mainCount }) : t('ben.txCount', { n: r.txCount })}</span>
              </span>
              <BalanceText side={kind} balance={r.balance} className="text-meta" />
            </span>
          )}
        />
        {data ? <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>

      <PartyFormDialog kind={kind} open={adding} onClose={() => setAdding(false)} onSaved={(p) => router.push(`${base}/${p.id}`)} />
    </>
  );
}
