'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eraser, FileSpreadsheet } from 'lucide-react';
import type { TxnRow } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile } from '@/lib/client/print';
import { fmtDate } from '@/lib/dates';
import { fmtKg, fmtMoney } from '@/lib/money';
import { KINDS } from '@/lib/kinds';
import { Badge, Button, Card, PageHeader, Select } from '@/components/ui';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateRange } from '@/components/DateInput';
import { statusTone } from '@/components/TxnRows';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useErase } from '@/components/EraseMode';

export function HistoryView() {
  const { t } = useApp();
  const panel = useTxnPanel();
  const toast = useToast();
  const erase = useErase();
  const L = useListState('date', 'desc', { kind: '', vault: '', currency: '', from: '', to: '' });
  const { data, loading } = useRemote<{ total: number; rows: TxnRow[] }>(`/api/history${L.query}`, { keepPrevious: true });
  const [busy, setBusy] = useState(false);

  const cols: Column<TxnRow>[] = [
    { key: 'number', label: t('common.number'), sortable: true, render: (r) => <span className="num font-semibold text-brand-ink">{r.number}</span> },
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num text-muted">{fmtDate(r.date)}</span> },
    { key: 'kind', label: t('common.type'), sortable: true, render: (r) => <span className="text-ink">{t(`kind.${r.kind}` as 'kind.SALE')}</span> },
    {
      key: 'party',
      label: t('common.party'),
      sortable: true,
      render: (r) => (
        <span className="block min-w-0">
          <span className="bidi block max-w-[220px] truncate text-ink">{r.partyName || r.label || (r.kind === 'PROCESSING' ? r.products : '—')}</span>
          {r.products && r.kind !== 'PROCESSING' ? <span className="bidi block max-w-[220px] truncate text-caption text-muted">{r.products}</span> : null}
        </span>
      ),
    },
    { key: 'kg', label: t('common.kg'), sortable: true, align: 'end', render: (r) => <span className="num text-muted">{r.kg ? fmtKg(r.kg) : '—'}</span> },
    { key: 'total', label: t('common.amount'), sortable: true, align: 'end', render: (r) => <span className="num font-semibold text-ink">{r.kind === 'PROCESSING' ? '—' : fmtMoney(r.total, r.currency)}</span> },
    { key: 'vault', label: t('common.vault'), sortable: true, render: (r) => <span className="text-muted">{r.vault ? t(`vault.${r.vault}`) : '—'}</span> },
    {
      key: 'status',
      label: t('common.status'),
      render: (r) => (
        <span className="flex gap-1">
          {/* Only money still owed gets a badge; "Recorded" / "Paid" are the normal state (Von Restorff). */}
          {r.status === 'unpaid' || r.status === 'partial' ? <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge> : <span className="text-caption text-muted">{r.status === 'paid' ? t('status.paid') : '—'}</span>}
          {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
        </span>
      ),
    },
    ...(erase.active
      ? [
          {
            key: 'erase',
            label: <span className="sr-only">{t('erase.txn')}</span>,
            align: 'end' as const,
            render: (r: TxnRow) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void erase.eraseTxn(r.id, r.number);
                }}
                aria-label={t('erase.txnN', { number: r.number })}
                title={t('erase.txn')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-ctl text-danger-ink transition-colors hover:bg-danger-tint"
              >
                <Eraser className="h-4 w-4" aria-hidden="true" />
              </button>
            ),
          },
        ]
      : []),
  ];

  async function exportCsv() {
    setBusy(true);
    const r = await downloadFile(`/api/history${qs({ q: L.q, sort: L.sort, dir: L.dir, ...L.filters, format: 'csv' })}`, 'transactions.csv');
    setBusy(false);
    if (r.ok) toast.success(t('toast.exported'));
    else toast.error(r.error || t('err.generic'));
  }

  return (
    <div>
      <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1.5 rounded text-meta font-semibold text-brand-ink hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t('nav.dashboard')}
      </Link>
      <PageHeader
        title={t('hist.title')}
        subtitle={t('hist.subtitle')}
        actions={
          <Button variant="secondary" busy={busy} onClick={exportCsv} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
            {t('common.exportCsv')}
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 px-5 pb-4 pt-5 xl:flex-row xl:flex-wrap xl:items-center">
          <SearchBox value={L.q} onChange={L.setQ} placeholder={t('hist.searchPh')} className="xl:w-80" />
          <Select aria-label={t('common.type')} value={L.filters.kind} onChange={(e) => L.setFilter('kind', e.target.value)} className="xl:w-52">
            <option value="">{t('common.type')}: {t('common.all')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('common.vault')} value={L.filters.vault} onChange={(e) => L.setFilter('vault', e.target.value)} className="xl:w-40">
            <option value="">{t('common.vault')}: {t('common.all')}</option>
            <option value="USD">{t('vault.USD')}</option>
            <option value="IQD">{t('vault.IQD')}</option>
          </Select>
          <Select aria-label={t('common.currency')} value={L.filters.currency} onChange={(e) => L.setFilter('currency', e.target.value)} className="xl:w-36">
            <option value="">{t('common.currency')}: {t('common.all')}</option>
            <option value="USD">USD</option>
            <option value="IQD">IQD</option>
          </Select>
          <DateRange idPrefix="hist" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
          {L.hasFilters ? (
            <Button variant="quiet" size="sm" onClick={L.clearFilters}>
              {t('common.clearFilters')}
            </Button>
          ) : null}
        </div>
        <DataTable
          rows={data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={loading}
          onRowClick={(r) => panel.open(r.id)}
          minWidth={960}
          caption={t('hist.title')}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : t('hist.empty')}</p>}
          mobile={(r) => (
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                  <span className="text-caption text-muted">{t(`kind.${r.kind}` as 'kind.SALE')}</span>
                </span>
                <span className="bidi mt-0.5 block truncate text-body text-ink">{r.partyName || r.label || r.products || '—'}</span>
                <span className="num block text-caption text-muted">{fmtDate(r.date)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-body font-semibold text-ink">{r.kind === 'PROCESSING' ? fmtKg(r.kg) : fmtMoney(r.total, r.currency)}</span>
                {r.status === 'unpaid' || r.status === 'partial' ? <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge> : null}
              </span>
            </span>
          )}
        />
        {data ? <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>
    </div>
  );
}
