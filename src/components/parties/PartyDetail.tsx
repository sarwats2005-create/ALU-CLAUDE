'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, Eraser, FileDown, MapPin, PackagePlus, Pencil, Phone, Printer, RotateCcw, ShoppingCart, Trash2 } from 'lucide-react';
import type { StatementRow } from '@/lib/server/q/parties';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { downloadFile, printDocument } from '@/lib/client/print';
import { balanceLabel } from '@/lib/format';
import { fmtDate } from '@/lib/dates';
import { D, fmtKg, fmtMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, EmptyState, Skeleton } from '../ui';
import { Dialog } from '../Dialog';
import { DataTable, Pager, SearchBox, useListState, type Column } from '../DataTable';
import { DateRange } from '../DateInput';
import { ChartCard, LineChart, compactMoney } from '../charts';
import { useTxnPanel } from '../TxnPanel';
import { useToast } from '../Toast';
import { useErase } from '../EraseMode';
import { Avatar, PartyFormDialog, type PartyKind } from '../PartyForm';
import { PaymentDialog, type PaymentKind } from '../PaymentDialog';

type Detail = {
  party: { id: string; name: string; phone: string; address: string; isDemo: boolean; hasAvatar: boolean; avatarV: number };
  cards: { total: string; cashReceived: string; refunds: string; balance: string; profit: string; mainCount: number; txCount: number; kg: string };
  series: { date: string; value: string }[];
};

export function PartyDetail({ kind, id, editPayment }: { kind: PartyKind; id: string; editPayment: TxnDetail | null }) {
  const { t, lang, can } = useApp();
  const router = useRouter();
  const toast = useToast();
  const panel = useTxnPanel();
  const erase = useErase();
  const isC = kind === 'customer';
  const base = isC ? '/customers' : '/beneficiaries';
  const { data, error } = useRemote<Detail>(`/api${base}/${id}`, { keepPrevious: true });
  const L = useListState('date', 'desc', { from: '', to: '' });
  const st = useRemote<{ total: number; rows: StatementRow[] }>(`/api${base}/${id}/statement${L.query}`, { keepPrevious: true });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pay, setPay] = useState<{ kind: PaymentKind; edit?: TxnDetail | null } | null>(null);

  // /customers/:id?edit=<paymentId> opens the payment in edit mode (from the detail panel's Edit).
  useEffect(() => {
    if (editPayment && editPayment.kind.startsWith(isC ? 'CUSTOMER' : 'BENEFICIARY')) setPay({ kind: editPayment.kind as PaymentKind, edit: editPayment });
  }, [editPayment, isC]);

  const series = useMemo(() => (data?.series ?? []).map((p) => ({ key: p.date, label: fmtDate(p.date).slice(0, 5), sub: fmtDate(p.date), value: Number(p.value) })), [data]);

  if (error && !data) return <EmptyState body={error} action={<Link href={base} className="text-meta font-semibold text-brand-ink hover:underline">{t('common.back')}</Link>} />;
  if (!data) return <DetailSkeleton />;

  const p = data.party;
  const c = data.cards;
  const bal = balanceLabel(kind, c.balance, lang);
  const credit = D(c.balance).isNegative();
  const docUrl = (format: string) => `/api/docs/statement/${kind}/${id}${qs({ format, from: L.filters.from, to: L.filters.to })}`;

  const cols: Column<StatementRow>[] = [
    { key: 'date', label: t('common.date'), sortable: true, render: (r) => <span className="num text-muted">{fmtDate(r.date)}</span> },
    { key: 'number', label: t('common.number'), sortable: true, render: (r) => <span className="num font-semibold text-brand-ink">{r.number}</span> },
    { key: 'kind', label: t('common.type'), render: (r) => <span className="text-ink">{t(`kindShort.${r.kind}` as 'kindShort.SALE')}</span> },
    { key: 'details', label: t('common.details'), render: (r) => <span className="bidi block max-w-[320px] truncate text-muted">{r.details || '—'}</span> },
    { key: 'amount', label: t('common.amount'), sortable: true, align: 'end', render: (r) => <span className="num text-ink">{fmtMoney(r.amount, r.currency)}</span> },
    {
      key: 'effect',
      label: t('common.debitCredit'),
      sortable: true,
      align: 'end',
      render: (r) => {
        const e = D(r.effectUsd);
        return <span className={cx('num font-semibold', e.gt(0) ? 'text-danger-ink' : e.isNegative() ? 'text-success-ink' : 'text-muted')}>{e.isZero() ? '—' : `${e.gt(0) ? '+' : '−'}${fmtMoney(e.abs())}`}</span>;
      },
    },
    {
      key: 'running',
      label: t('common.runningBalance'),
      align: 'end',
      render: (r) => {
        const b = balanceLabel(kind, r.running, lang);
        return <span className={cx('num font-semibold', b.tone === 'danger' ? 'text-danger-ink' : b.tone === 'success' ? 'text-success-ink' : 'text-muted')}>{fmtMoney(D(r.running).abs())}</span>;
      },
    },
  ];

  async function remove() {
    setBusy('delete');
    const res = await api<{ name: string }>(`/api${base}/${id}`, { method: 'DELETE' });
    setBusy(null);
    setDeleting(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(t('toast.partyDeleted', { name: res.data.name }));
    router.push(base);
  }

  return (
    <div>
      <Link href={base} className="mb-3 inline-flex items-center gap-1.5 rounded text-meta font-semibold text-brand-ink hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {isC ? t('cust.allCustomers') : t('ben.title')}
      </Link>

      {/* Identity + actions */}
      <header className="mb-5 flex flex-col gap-4 md:mb-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={p.name} src={p.hasAvatar ? `/api/customers/${p.id}/avatar?v=${p.avatarV}` : null} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="bidi text-heading font-bold tracking-[-0.02em] text-ink md:text-large">{p.name}</h1>
              {p.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted">
              {p.phone ? (
                <a href={`tel:${p.phone.replace(/\s+/g, '')}`} className="num inline-flex items-center gap-1.5 hover:text-ink" dir="ltr">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {p.phone}
                </a>
              ) : null}
              {p.address ? (
                <span className="bidi inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {p.address}
                </span>
              ) : null}
            </div>
            <div className="-ms-3 mt-1.5 flex gap-1">
              <Button variant="quiet" size="sm" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
                {t('common.edit')}
              </Button>
              {isC && erase.active ? (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={async () => {
                    if (await erase.eraseCustomer(p.id, p.name)) router.push(base);
                  }}
                  icon={<Eraser className="h-4 w-4" aria-hidden="true" />}
                  className="text-danger-ink hover:bg-danger-tint hover:text-danger-ink"
                >
                  {t('erase.cust')}
                </Button>
              ) : (
                <Button variant="quiet" size="sm" onClick={() => setDeleting(true)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} className="hover:text-danger-ink">
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isC ? (
            <>
              {credit ? (
                <Button variant="secondary" onClick={() => setPay({ kind: 'CUSTOMER_REFUND' })} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                  {t('cust.refundCredit')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setPay({ kind: 'CUSTOMER_PAYMENT' })} icon={<Banknote className="h-4 w-4" aria-hidden="true" />}>
                {t('cust.receivePayment')}
              </Button>
              {can('pos') ? (
                <Link href={`/pos?customer=${p.id}`}>
                  <Button icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}>{t('cust.newSale')}</Button>
                </Link>
              ) : null}
            </>
          ) : (
            <>
              {credit ? (
                <Button variant="secondary" onClick={() => setPay({ kind: 'BENEFICIARY_REFUND' })} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                  {t('ben.receiveRefund')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setPay({ kind: 'BENEFICIARY_PAYMENT' })} icon={<Banknote className="h-4 w-4" aria-hidden="true" />}>
                {t('ben.pay')}
              </Button>
              <Link href={`/beneficiaries/purchase?beneficiary=${p.id}`}>
                <Button icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>{t('ben.newPurchase')}</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Balance is the headline; the other figures support it. */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <Card className={cx('col-span-2 p-5 md:col-span-1', bal.tone === 'danger' && 'border-danger/25', bal.tone === 'success' && 'border-success/25')}>
          <p className="text-meta font-medium text-muted">{isC ? t('cust.currentBalance') : t('ben.currentBalance')}</p>
          <p className={cx('fig mt-1.5 text-figure font-bold', bal.tone === 'danger' ? 'text-danger-ink' : bal.tone === 'success' ? 'text-success-ink' : 'text-ink')}>{fmtMoney(D(c.balance).abs())}</p>
          <p className={cx('mt-1 text-meta font-semibold', bal.tone === 'danger' ? 'text-danger-ink' : bal.tone === 'success' ? 'text-success-ink' : 'text-muted')}>{bal.short}</p>
        </Card>
        <Stat label={isC ? t('cust.totalSales') : t('ben.totalPurchases')} value={fmtMoney(c.total)} sub={isC ? t('cust.salesCount', { n: c.mainCount }) : t('ben.txCount', { n: c.txCount })} />
        <Stat label={isC ? t('cust.cashReceived') : t('ben.paid')} value={fmtMoney(c.cashReceived)} sub={D(c.refunds).gt(0) ? `${t('kindShort.CUSTOMER_REFUND')}: ${fmtMoney(c.refunds)}` : undefined} />
        {isC ? (
          <Stat label={t('cust.profit')} value={fmtMoney(c.profit)} tone={D(c.profit).isNegative() ? 'danger' : 'success'} />
        ) : (
          <Stat label={t('ben.kgBought')} value={fmtKg(c.kg)} />
        )}
      </div>

      <ChartCard
        className="mb-5"
        title={t('cust.balanceChart')}
        empty={series.length < 2}
        table={{ head: [t('common.date'), t('common.runningBalance')], rows: (data.series ?? []).map((s) => [fmtDate(s.date), fmtMoney(s.value)]), numericCols: [1] }}
      >
        <LineChart data={series} fmtValue={(v) => fmtMoney(v)} fmtAxis={(v) => compactMoney(v)} ariaLabel={t('cust.balanceChart')} seriesLabel={t('common.balance')} allowNegative height={200} />
      </ChartCard>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pb-4 pt-5 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-title font-semibold text-ink">{t('cust.statement')}</h2>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <SearchBox value={L.q} onChange={L.setQ} placeholder={t('common.searchPlaceholder')} className="md:w-56" />
            <DateRange idPrefix="st" from={L.filters.from} to={L.filters.to} onFrom={(v) => L.setFilter('from', v)} onTo={(v) => L.setFilter('to', v)} />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                busy={busy === 'print'}
                onClick={async () => {
                  setBusy('print');
                  const r = await printDocument(docUrl('html'));
                  setBusy(null);
                  if (!r.ok) toast.error(r.error || t('err.generic'));
                }}
                icon={<Printer className="h-4 w-4" aria-hidden="true" />}
              >
                {t('common.print')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                busy={busy === 'pdf'}
                onClick={async () => {
                  setBusy('pdf');
                  const r = await downloadFile(docUrl('pdf'), `statement.pdf`);
                  setBusy(null);
                  if (!r.ok) toast.error(r.error || t('err.pdf'));
                }}
                icon={<FileDown className="h-4 w-4" aria-hidden="true" />}
              >
                {t('common.exportPdf')}
              </Button>
            </div>
          </div>
        </div>
        <DataTable
          rows={st.data?.rows.map((r) => ({ ...r }))}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={st.loading}
          onRowClick={(r) => panel.open(r.id)}
          minWidth={860}
          caption={t('cust.statement')}
          empty={<p className="text-body text-muted">{L.hasFilters ? t('common.noResults') : isC ? t('cust.statementEmpty') : t('ben.statementEmpty')}</p>}
          mobile={(r) => {
            const e = D(r.effectUsd);
            return (
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                    <span className="text-caption text-muted">{t(`kindShort.${r.kind}` as 'kindShort.SALE')}</span>
                  </span>
                  <span className="bidi mt-0.5 block truncate text-meta text-ink">{r.details || fmtMoney(r.amount, r.currency)}</span>
                  <span className="num block text-caption text-muted">{fmtDate(r.date)}</span>
                </span>
                <span className="shrink-0 text-end">
                  <span className={cx('num block text-body font-semibold', e.gt(0) ? 'text-danger-ink' : e.isNegative() ? 'text-success-ink' : 'text-muted')}>
                    {e.isZero() ? '—' : `${e.gt(0) ? '+' : '−'}${fmtMoney(e.abs())}`}
                  </span>
                  <span className="num block text-caption text-muted">= {fmtMoney(D(r.running).abs())}</span>
                </span>
              </span>
            );
          }}
        />
        {st.data ? <Pager total={st.data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>

      <PartyFormDialog
        kind={kind}
        open={editing}
        onClose={() => setEditing(false)}
        initial={{ id: p.id, name: p.name, phone: p.phone, address: p.address, avatarUrl: p.hasAvatar ? `/api/customers/${p.id}/avatar?v=${p.avatarV}` : null }}
        onSaved={() => undefined}
      />

      {pay ? (
        <PaymentDialog
          open
          onClose={() => {
            setPay(null);
            if (editPayment) router.replace(`${base}/${id}`);
          }}
          kind={pay.kind}
          party={{ id: p.id, name: p.name }}
          balance={c.balance}
          edit={pay.edit}
        />
      ) : null}

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        size="sm"
        title={isC ? t('cust.deleteTitle') : t('ben.deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={busy === 'delete'} onClick={remove} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              {t('detail.deleteConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">{t('cust.deleteBody', { name: p.name })}</p>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' | 'success' }) {
  return (
    <Card className="min-w-0 p-4 md:p-5">
      <p className="text-meta font-medium text-muted">{label}</p>
      <p className={cx('fig mt-1.5 truncate text-title font-bold md:text-large', tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink')}>{value}</p>
      {sub ? <p className="mt-1 text-caption text-muted">{sub}</p> : null}
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
