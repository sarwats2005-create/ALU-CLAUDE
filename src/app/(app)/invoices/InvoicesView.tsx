'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Eraser, Eye, FileDown, FileSpreadsheet, FolderCheck, HandCoins, Loader2, FolderOpen, FolderX, Lock, PackagePlus, Pencil, ReceiptText, ShoppingCart, Trash2 } from 'lucide-react';
import type { TxnRow } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { useRemote } from '@/lib/client/use-remote';
import { qs } from '@/lib/client/api';
import { downloadFile } from '@/lib/client/print';
import { docUrl, usePaper, type Paper } from '@/lib/client/paper';
import { useRouter } from 'next/navigation';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { fmtKg, fmtMoney } from '@/lib/money';
import { KIND_PAGE, editHref, type Kind } from '@/lib/kinds';
import { EDIT_WINDOW_MS, remaining } from '@/lib/lock';
import { FOLDER_EVENT, allowAccess, chooseFolder, folderState, removeInvoiceFile, stopAutoSave, type FolderState } from '@/lib/client/invoice-folder';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, PageHeader, Segmented } from '@/components/ui';
import { SummaryCell, SummaryStrip } from '@/components/Summary';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateRange } from '@/components/DateInput';
import { statusTone } from '@/components/TxnRows';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useErase } from '@/components/EraseMode';

/** Re-renders every 30 seconds so countdowns move and buttons disappear the moment an invoice locks. */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

type Book = 'sale' | 'purchase';
type Counts = { all: number; open: number; other: number; owed: number; owedUsd: string };

/** Sales and purchase invoices are two separate books: one tab each, own summary, own columns, own button. */
export function InvoicesView({ initialType }: { initialType: Book }) {
  const { t, can } = useApp();
  const router = useRouter();
  const toast = useToast();
  const panel = useTxnPanel();
  const erase = useErase();
  const now = useNow();
  const [paper, setPaper] = usePaper();
  const [busy, setBusy] = useState<string | null>(null);
  const L = useListState('created', 'desc', { type: initialType, lock: '', pay: '', from: '', to: '' });
  const book: Book = L.filters.type === 'purchase' ? 'purchase' : 'sale';
  const isSale = book === 'sale';
  const { data, loading } = useRemote<{ total: number; rows: TxnRow[]; counts: Counts }>(`/api/invoices${L.query}`, { keepPrevious: true });
  const k = data?.counts;
  const [otherCount, setOtherCount] = useState<number | null>(null);
  useEffect(() => {
    if (k) setOtherCount(k.other);
  }, [k]);
  const switchBook = (b: Book) => {
    if (b === book) return;
    L.setFilter('lock', '');
    L.setFilter('pay', '');
    L.setFilter('type', b);
    router.replace(`/invoices?type=${b}`, { scroll: false });
  };
  const toggle = (key: 'lock' | 'pay', v: string) => {
    L.setFilter(key === 'lock' ? 'pay' : 'lock', '');
    L.setFilter(key, L.filters[key] === v ? '' : v);
  };
  async function pdf(r: TxnRow) {
    setBusy(r.id);
    const res = await downloadFile(docUrl(r.id, 'pdf', paper), `${r.number}.pdf`);
    setBusy(null);
    if (!res.ok) toast.error(res.error || t('err.pdf'));
  }
  async function csv() {
    setBusy('csv');
    const res = await downloadFile(`/api/invoices${qs({ q: L.q, sort: L.sort, dir: L.dir, ...L.filters, format: 'csv' })}`, `${book}-invoices.csv`);
    setBusy(null);
    if (res.ok) toast.success(t('toast.exported'));
    else toast.error(res.error || t('err.generic'));
  }

  const mayChange = (r: TxnRow) => can(KIND_PAGE[r.kind as Kind]) && !!remaining(r.kind, r.createdAt, now);

  function windowCell(r: TxnRow) {
    const left = remaining(r.kind, r.createdAt, now);
    if (!left)
      return (
        <Badge tone="neutral" className="gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {t('invc.lockedBadge')}
        </Badge>
      );
    const time = left.h ? t('invc.hm', { h: left.h, m: left.m }) : t('invc.m', { m: left.m });
    const pct = Math.max(2, Math.round((left.ms / EDIT_WINDOW_MS) * 100));
    return (
      <span className="block min-w-[104px] whitespace-nowrap">
        <span dir="auto" className={cx('block text-meta font-semibold tabular-nums', left.h < 2 ? 'text-warning-ink' : 'text-ink')}>{t('invc.left', { time })}</span>
        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-tint" aria-hidden="true">
          <span className={cx('block h-full rounded-full', left.h < 2 ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }

  function actionsCell(r: TxnRow) {
    const open = mayChange(r);
    const btn = 'inline-flex h-14 w-14 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-tint hover:text-ink';
    return (
      <span className="flex items-center justify-end gap-0.5">
        <button type="button" className={btn} onClick={() => panel.open(r.id)} aria-label={t('invc.viewN', { number: r.number })} title={t('common.view')}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} onClick={() => void pdf(r)} disabled={busy === r.id} aria-label={t('invc.pdfN', { number: r.number, size: paper })} title={t('invc.pdfN', { number: r.number, size: paper })}>
          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {open ? (
          <>
            <Link href={editHref(r.kind as Kind, r.id, r.partyId)} className={btn} aria-label={t('invc.editN', { number: r.number })} title={t('common.edit')}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className={cx(btn, 'hover:bg-danger-tint hover:text-danger-ink')}
              onClick={() => panel.open(r.id, { confirmDelete: true })}
              aria-label={t('invc.deleteN', { number: r.number })}
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {erase.active ? (
          <button
            type="button"
            className={cx(btn, 'text-danger-ink hover:bg-danger-tint hover:text-danger-ink')}
            onClick={async () => {
              if (await erase.eraseTxn(r.id, r.number)) void removeInvoiceFile(r.id, r.number);
            }}
            aria-label={t('erase.txnN', { number: r.number })}
            title={t('erase.txn')}
          >
            <Eraser className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  }

  const cols: Column<TxnRow>[] = [
    {
      key: 'number',
      label: t('common.number'),
      sortable: true,
      render: (r) => (
        <span className="num block whitespace-nowrap font-semibold text-brand-ink">{r.number}</span>
      ),
    },
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num whitespace-nowrap text-muted">{fmtDate(r.date)}</span> },
    {
      key: 'party',
      label: isSale ? t('pos.customer') : t('pur.beneficiary'),
      sortable: true,
      render: (r) => (
        <span className="block min-w-0">
          <span className="bidi block max-w-[180px] truncate text-ink">{r.partyName || '—'}</span>
          {r.products ? <span className="bidi block max-w-[180px] truncate text-caption text-muted">{r.products}</span> : null}
        </span>
      ),
    },
    { key: 'kg', label: t('common.kg'), sortable: true, align: 'end', colClassName: 'hidden min-[1400px]:table-cell', render: (r) => <span className="num whitespace-nowrap text-muted">{r.kg ? fmtKg(r.kg) : '—'}</span> },
    {
      key: 'total',
      label: t('common.total'),
      sortable: true,
      align: 'end',
      render: (r) => (
        <span className="flex flex-col items-end gap-1">
          <span className="num whitespace-nowrap font-semibold text-ink">{fmtMoney(r.total, r.currency)}</span>
          {r.status === 'paid' ? <span className="text-caption text-muted">{t('status.paid')}</span> : <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge>}
        </span>
      ),
    },
    {
      key: 'created',
      label: t('invc.created'),
      sortable: true,
      render: (r) => (
        <span className="block">
          <span className="num block whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</span>
          {r.createdByName ? <span className="bidi block max-w-[130px] truncate text-caption text-muted">{r.createdByName}</span> : null}
        </span>
      ),
    },
    { key: 'window', label: t('invc.window'), render: (r) => windowCell(r) },
    // Pinned to the edge so the buttons stay reachable when a narrow screen scrolls the table sideways.
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, align: 'end', className: 'sticky end-0 bg-surface', render: (r) => actionsCell(r) },
  ];

  return (
    <div>
      <PageHeader
        title={t('invc.title')}
        subtitle={t('invc.subtitle')}
        actions={
          // One primary action, matching the open book (Hick / Fitts).
          isSale ? (
            can('pos') ? (
              <Link href="/pos">
                <Button size="lg" icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}>
                  {t('pos.newSale')}
                </Button>
              </Link>
            ) : null
          ) : can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase">
              <Button size="lg" icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>
                {t('dash.recordPurchase')}
              </Button>
            </Link>
          ) : null
        }
      />
      {/* Two separate books. */}
      <div role="tablist" aria-label={t('invc.title')} data-on-canvas className="mb-5 grid grid-cols-2 gap-1 rounded-card bg-surface p-1 sm:inline-grid sm:min-w-[480px]">
        {(['sale', 'purchase'] as const).map((b) => {
          const on = book === b;
          const n = on ? k?.all : otherCount;
          return (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => switchBook(b)}
              className={cx(
                'flex h-14 items-center justify-center gap-2 rounded-ctl px-4 text-body font-bold transition-colors',
                on ? (b === 'sale' ? 'bg-brand text-on-brand' : 'bg-success-ink text-white') : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {b === 'sale' ? <ShoppingCart className="h-4 w-4" aria-hidden="true" /> : <PackagePlus className="h-4 w-4" aria-hidden="true" />}
              {b === 'sale' ? t('invc.salesBook') : t('invc.purchaseBook')}
              {n !== null && n !== undefined ? <span className={cx('num rounded-full px-2 text-caption', on ? 'bg-white/20 text-current' : 'bg-surface-2 text-muted')}>{n}</span> : null}
            </button>
          );
        })}
      </div>
      {/* Only when the folder needs you does it come first; otherwise it waits at the bottom. */}
      <FolderBar when="attention" />
      {/* Summary = filter for this book. */}
      <SummaryStrip cols={3} className="mb-5">
        <SummaryCell
          icon={<ReceiptText className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={isSale ? t('invc.allSales') : t('invc.allPurchases')}
          value={k ? String(k.all) : '—'}
          sub={t('party.showAll')}
          active={!L.filters.lock && !L.filters.pay}
          onClick={() => {
            L.setFilter('lock', '');
            L.setFilter('pay', '');
          }}
        />
        <SummaryCell
          icon={<HandCoins className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={isSale ? t('invc.owedToUs') : t('invc.weOwe')}
          value={k ? fmtMoney(k.owedUsd) : '—'}
          tone={k && k.owed > 0 ? 'danger' : undefined}
          sub={t('invc.owedN', { n: k?.owed ?? 0 })}
          active={L.filters.pay === 'owed'}
          onClick={() => toggle('pay', 'owed')}
        />
        <SummaryCell
          icon={<Clock className="h-[18px] w-[18px]" aria-hidden="true" />}
          label={t('invc.lockOpen')}
          value={k ? String(k.open) : '—'}
          sub={t('invc.openSub')}
          active={L.filters.lock === 'open'}
          onClick={() => toggle('lock', 'open')}
        />
      </SummaryStrip>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 px-5 pb-4 pt-5 xl:flex-row xl:flex-wrap xl:items-center">
          <SearchBox value={L.q} onChange={L.setQ} placeholder={t('invc.searchPh')} className="xl:w-72" />
          <DateRange idPrefix="invc" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
          <div className="flex flex-wrap items-center gap-2 xl:ms-auto">
            <span className="text-meta text-muted">{t('invc.paper')}</span>
            <Segmented<Paper>
              label={t('invc.paper')}
              size="sm"
              value={paper}
              onChange={setPaper}
              options={[
                { value: 'A5', label: 'A5' },
                { value: 'A4', label: 'A4' },
              ]}
            />
            <Button variant="secondary" size="sm" busy={busy === 'csv'} onClick={() => void csv()} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
              {t('common.exportCsv')}
            </Button>
          </div>
        </div>
        <DataTable
          rows={data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={loading}
          minWidth={840}
          caption={t('invc.title')}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : t('invc.empty')}</p>}
          mobile={(r) => (
            <span className="flex flex-col gap-2">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                  <span className="bidi mt-0.5 block truncate text-body text-ink">{r.partyName || '—'}</span>
                  <span className="num block text-caption text-muted">{fmtDate(r.date)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-body font-semibold text-ink">{fmtMoney(r.total, r.currency)}</span>
                  {r.status === 'paid' ? <span className="text-caption text-muted">{t('status.paid')}</span> : <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge>}
                </span>
              </span>
              <span className="flex items-center justify-between gap-3">
                {windowCell(r)}
                {actionsCell(r)}
              </span>
            </span>
          )}
        />
        {data ? <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>
      <FolderBar when="calm" />
    </div>
  );
}

/** Choose / change / stop the folder this computer saves invoice PDFs into. */
function FolderBar({ when }: { when: 'attention' | 'calm' }) {
  const { t } = useApp();
  const toast = useToast();
  const [s, setS] = useState<FolderState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => void folderState().then(setS);
    load();
    window.addEventListener(FOLDER_EVENT, load);
    return () => window.removeEventListener(FOLDER_EVENT, load);
  }, []);

  if (!s) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const choose = () =>
    run(async () => {
      const name = await chooseFolder();
      if (name) toast.success(t('invc.folderSet', { name }));
    });
  const allow = () =>
    run(async () => {
      await allowAccess();
    });
  const stop = () =>
    run(async () => {
      await stopAutoSave();
      toast.success(t('invc.folderStopped'));
    });

  const needsAccess = !!s.name && s.permission !== 'granted';
  const attention = needsAccess || !!s.pending;
  if ((when === 'attention') !== attention) return null;
  const Icon = !s.supported ? FolderX : s.name && !needsAccess ? FolderCheck : FolderOpen;

  return (
    <Card className={cx('px-5 py-4', when === 'attention' ? 'mb-5 border-warning/40' : 'mt-5')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cx(
              'mt-0.5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-ctl',
              s.name && !needsAccess ? 'bg-success-tint text-success-ink' : needsAccess ? 'bg-warning-tint text-warning-ink' : 'bg-tint text-brand-ink',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-body font-semibold text-ink">{t('invc.folder')}</p>
            <p className="text-meta text-muted">
              {!s.supported
                ? t('invc.folderUnsupported')
                : !s.name
                  ? t('invc.folderNone')
                  : needsAccess
                    ? t('invc.folderNeedsAccess', { name: s.name })
                    : t('invc.folderOn', { name: s.name })}
            </p>
            {s.pending ? <p className="mt-1 text-meta font-semibold text-warning-ink">{t('invc.pending', { n: s.pending })}</p> : null}
          </div>
        </div>
        {s.supported ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {needsAccess ? (
              <Button size="sm" onClick={allow} busy={busy}>
                {t('invc.folderAllow')}
              </Button>
            ) : s.pending ? (
              <Button size="sm" onClick={allow} busy={busy}>
                {t('invc.savePending')}
              </Button>
            ) : null}
            <Button size="sm" variant={s.name ? 'secondary' : 'primary'} onClick={choose} busy={busy && !s.name}>
              {s.name ? t('invc.folderChange') : t('invc.folderChoose')}
            </Button>
            {s.name ? (
              <Button size="sm" variant="quiet" onClick={stop}>
                {t('invc.folderOff')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
