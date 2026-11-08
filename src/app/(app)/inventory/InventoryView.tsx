'use client';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Box,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Eraser,
  Factory,
  MapPin,
  PackagePlus,
  Pencil,
  Plus,
  Store,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import type { listInventory, productHistory } from '@/lib/server/q/inventory';
import type { listInventories } from '@/lib/server/inventories';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDate, localTodayIso } from '@/lib/dates';
import { D, Dec, fmtCost, fmtKg, fmtMoney, fmtPct, parseDec, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import { CalendarArt, HeroBoxes, KpiWave, ProductArt, WarehouseArt } from '@/components/illustrations';
import { Pager, SearchBox, useListState } from '@/components/DataTable';
import { DateInput } from '@/components/DateInput';
import { Dialog, EditingBanner } from '@/components/Dialog';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useErase } from '@/components/EraseMode';
import { RevertProcessingDialog } from '@/components/RevertProcessing';
import { useMoneyGuard } from '@/components/MoneyGuard';

type Inv = Awaited<ReturnType<typeof listInventory>>;
type Row = Inv['rows'][number];
type Hist = Awaited<ReturnType<typeof productHistory>>;
type InventoryRow = Awaited<ReturnType<typeof listInventories>>[number];

const STATUS_TONE = { in: 'success', low: 'warning', out: 'danger' } as const;

export function InventoryView({ editProcessing }: { editProcessing: TxnDetail | null }) {
  const { t, can, bump } = useApp();
  const router = useRouter();
  const guard = useMoneyGuard();
  const L = useListState('name', 'asc', { typeId: '', status: '', inventoryId: '' });
  const locs = useRemote<InventoryRow[]>('/api/inventories', { keepPrevious: true });
  const { data, loading } = useRemote<Inv>(`/api/inventory${L.query}`, { keepPrevious: true });
  const types = useRemote<{ id: string; name: string }[]>('/api/lookup/types');
  const toast = useToast();

  const [process, setProcess] = useState<{ row: Pick<Row, 'id' | 'name' | 'sku' | 'rawKg' | 'rawAvg'>; edit?: TxnDetail } | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [createLoc, setCreateLoc] = useState(false);
  const [editLoc, setEditLoc] = useState<InventoryRow | null>(null);
  const [rentLoc, setRentLoc] = useState<InventoryRow | null>(null);
  const [transfer, setTransfer] = useState<Row | null>(null);
  const [payRentBusy, setPayRentBusy] = useState(false);

  const selectedLoc = useMemo(
    () => locs.data?.find((x) => x.id === L.filters.inventoryId) ?? locs.data?.find((x) => x.isDefault) ?? locs.data?.[0],
    [locs.data, L.filters.inventoryId],
  );
  const otherLocs = useMemo(() => (locs.data ?? []).filter((x) => x.id !== L.filters.inventoryId), [locs.data, L.filters.inventoryId]);
  const inventoryId = L.filters.inventoryId || selectedLoc?.id || '';

  useEffect(() => {
    if (!locs.data?.length || L.filters.inventoryId) return;
    const def = locs.data.find((x) => x.isDefault) ?? locs.data[0];
    L.setFilter('inventoryId', def.id);
  }, [locs.data, L.filters.inventoryId]);

  useEffect(() => {
    if (!editProcessing?.product) return;
    const editInv = editProcessing.inventoryId || inventoryId;
    if (editInv && editInv !== L.filters.inventoryId) L.setFilter('inventoryId', editInv);
    api<Row[]>(`/api/lookup/products${qs({ ids: editProcessing.product.id, inventoryId: editInv || undefined })}`).then((r) => {
      const p = r.ok ? r.data[0] : undefined;
      setProcess({
        row: {
          id: editProcessing.product!.id,
          name: editProcessing.product!.name,
          sku: editProcessing.product!.sku,
          rawKg: p?.rawKg ?? '0',
          rawAvg: p?.rawAvg ?? '0',
        },
        edit: editProcessing,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editProcessing]);

  async function payRent(inv: InventoryRow) {
    setPayRentBusy(true);
    const res = await guard.send<{ id: string; number: string }>(`/api/inventories/${inv.id}/rent`, {
      method: 'POST',
      body: { date: localTodayIso() },
    });
    setPayRentBusy(false);
    if (!res.ok) {
      if (res.code !== 'vault.shortCancelled') toast.error(res.error);
      return;
    }
    toast.success(t('inv.rentPaid', { number: res.data.number }));
    bump();
  }

  function onLocSaved(id: string) {
    bump();
    L.setFilter('inventoryId', id);
  }

  return (
    <div>
      <PageHeader
        title={t('inv.title')}
        subtitle={t('inv.subtitle')}
        icon={<Box aria-hidden="true" strokeWidth={1.75} />}
        art={<HeroBoxes />}
        actions={
          can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase" className="elegant-hero-cta inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-meta font-semibold text-white">
              <PackagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
              {t('dash.recordPurchase')}
            </Link>
          ) : null
        }
      />

      {/* ── Inventory tabs ── */}
      <div className="mb-5 flex items-center gap-3">
        <div role="tablist" aria-label={t('inv.locations')} className="scroll-thin -m-1 flex min-w-0 gap-3 overflow-x-auto p-1">
          {(locs.data ?? []).map((loc) => {
            const on = loc.id === L.filters.inventoryId;
            return (
              <button
                key={loc.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => L.setFilter('inventoryId', loc.id)}
                className={cx(
                  'inline-flex h-14 shrink-0 items-center gap-3 rounded-full px-6 text-meta font-bold motion-safe:transition-all motion-safe:duration-200 md:px-8',
                  on ? 'elegant-tab-on text-white' : 'bg-surface-solid text-muted shadow-[0_2px_10px_-4px_rgba(17,24,39,0.12)] ring-1 ring-line hover:text-ink',
                )}
              >
                <Store className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="bidi max-w-[12rem] truncate">{loc.name}</span>
                {loc.rentDue ? <span className="h-2 w-2 shrink-0 rounded-full bg-danger" title={t('inv.rentDueNow')} aria-label={t('inv.rentDueNow')} /> : null}
              </button>
            );
          })}
          {locs.loading && !locs.data ? <Skeleton className="h-14 w-40 rounded-full" /> : null}
        </div>
        {can('inventory') ? (
          <button
            type="button"
            onClick={() => setCreateLoc(true)}
            aria-label={t('inv.addLoc')}
            className="inline-flex h-14 shrink-0 items-center gap-2 rounded-full border-2 border-dashed border-brand/30 px-4 text-meta font-semibold text-brand-ink hover:border-brand/60 hover:bg-tint sm:px-6"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('inv.addLoc')}</span>
          </button>
        ) : null}
      </div>

      {/* ── Selected inventory + monthly rent ── */}
      {selectedLoc ? (
        <section className="alu-card alu-glass mb-5 rounded-[20px] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-5">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-tint to-tint-2 md:h-[104px] md:w-[120px]">
                <WarehouseArt className="h-16 w-16 md:h-[84px] md:w-[96px]" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="bidi text-title font-extrabold text-ink md:text-[26px] md:leading-8">{selectedLoc.name}</h2>
                  {selectedLoc.isDefault ? (
                    <span className="rounded-full bg-tint-2 px-4 py-1 text-meta font-semibold text-brand-ink ring-1 ring-brand/15">{t('inv.mainBadge')}</span>
                  ) : null}
                  {can('inventory') ? (
                    <button
                      type="button"
                      onClick={() => setEditLoc(selectedLoc)}
                      className="inline-flex h-11 items-center gap-2 rounded-ctl px-2 text-body font-medium text-muted hover:bg-tint hover:text-brand-ink"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      {t('inv.editLoc')}
                    </button>
                  ) : null}
                </div>
                {selectedLoc.address || selectedLoc.size ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-muted">
                    {selectedLoc.address ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="bidi">{selectedLoc.address}</span>
                      </span>
                    ) : null}
                    {selectedLoc.size ? <span className="bidi">{selectedLoc.size}</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="hidden w-px shrink-0 self-stretch bg-line lg:block" aria-hidden="true" />
            <div className="elegant-panel relative w-full overflow-hidden rounded-2xl px-5 py-4 lg:max-w-[48%]">
              <CalendarArt className="pointer-events-none absolute -end-1 top-1/2 hidden h-[118px] w-[128px] -translate-y-1/2 sm:block" />
              <div className="relative sm:pe-32">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-2 text-lead font-bold text-brand-ink">
                    <CalendarDays className="h-6 w-6" aria-hidden="true" />
                    {t('inv.rentTitle')}
                  </p>
                  {selectedLoc.rentAmount && selectedLoc.rentVault ? (
                    selectedLoc.rentDue ? <Badge tone="danger">{t('inv.rentDueNow')}</Badge> : <Badge tone="success">{t('inv.rentPaidUp')}</Badge>
                  ) : null}
                </div>
                {selectedLoc.rentAmount && selectedLoc.rentVault ? (
                  <>
                    <p className="num mt-1 text-title font-bold text-ink">{fmtMoney(selectedLoc.rentAmount, selectedLoc.rentVault)}</p>
                    {selectedLoc.rentNextDue ? (
                      <p className="num mt-0.5 text-caption text-muted">
                        {t('inv.rentNext')}: {fmtDate(selectedLoc.rentNextDue)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-body text-muted">{t('inv.rentNotSet')}</p>
                )}
                {can('inventory') ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedLoc.rentDue && selectedLoc.rentAmount ? (
                      <button
                        type="button"
                        disabled={payRentBusy}
                        onClick={() => void payRent(selectedLoc)}
                        className="alu-btn-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-meta font-semibold text-on-brand disabled:opacity-60"
                      >
                        <Banknote className="h-4 w-4" aria-hidden="true" />
                        {t('inv.rentPay')}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setRentLoc(selectedLoc)} className={PILL}>
                      {selectedLoc.rentAmount ? t('inv.rentEdit') : t('inv.rentSet')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : locs.loading ? (
        <Skeleton className="mb-5 h-36 w-full rounded-[20px]" />
      ) : null}

      {/* ── KPI cards ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <InvKpi color="var(--brand)" icon={<Boxes className="h-5 w-5" aria-hidden="true" />} label={t('inv.totalRaw')} value={data ? fmtKg(data.totals.rawKg) : '—'} />
        <InvKpi color="var(--success)" icon={<Factory className="h-5 w-5" aria-hidden="true" />} label={t('inv.totalFinished')} value={data ? fmtKg(data.totals.finishedKg) : '—'} />
        <InvKpi color="var(--warning)" icon={<Wallet className="h-5 w-5" aria-hidden="true" />} label={t('inv.totalValue')} value={data ? fmtMoney(D(data.totals.value).toDecimalPlaces(2)) : '—'} />
        {data && data.totals.low + data.totals.out > 0 ? (
          <InvKpi
            color="var(--danger)"
            alert
            icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            label={t('inv.needsRestock')}
            value={<span className="text-danger-ink">{String(data.totals.low + data.totals.out)}</span>}
            sub={t('inv.lowOut', { low: data.totals.low, out: data.totals.out })}
            active={L.filters.status === 'attention'}
            onClick={() => L.setFilter('status', L.filters.status === 'attention' ? '' : 'attention')}
          />
        ) : (
          <InvKpi
            color="var(--dark)"
            waveColor="var(--success)"
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            label={t('inv.needsRestock')}
            value={<span className="text-success-ink">{t('inv.allStocked')}</span>}
          />
        )}
      </div>

      {/* ── Products ── */}
      <section className="alu-card alu-glass overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="flex items-center gap-3 text-title font-bold text-ink md:text-[22px]">
            <Box className="h-7 w-7 text-brand-ink" strokeWidth={1.75} aria-hidden="true" />
            {t('inv.products')}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <SearchBox value={L.q} onChange={L.setQ} placeholder={t('inv.searchPh')} className="sm:w-72 [&_input]:rounded-full [&_input]:bg-surface-solid" />
            <Select aria-label={t('common.aluminumType')} value={L.filters.typeId} onChange={(e) => L.setFilter('typeId', e.target.value)} className="rounded-full! bg-surface-solid! ps-5 sm:w-52">
              <option value="">
                {t('common.aluminumType')}: {t('common.all')}
              </option>
              {(types.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <Select aria-label={t('common.sortBy', { col: t('common.product') })} value={L.sort} onChange={(e) => L.onSort(e.target.value)} className="rounded-full! bg-surface-solid! ps-5 sm:w-44">
              <option value="name">{t('common.product')}</option>
              <option value="sku">SKU</option>
              <option value="raw">{t('inv.rawKg')}</option>
              <option value="finished">{t('inv.finishedKg')}</option>
              <option value="value">{t('inv.stockValue')}</option>
            </Select>
          </div>
          {L.filters.status ? (
            <button type="button" onClick={() => L.setFilter('status', '')} className="inline-flex h-14 items-center gap-1.5 self-start rounded-full bg-danger-tint px-3 text-meta font-semibold text-danger-ink hover:bg-danger-tint/70">
              {t('inv.needsRestock')}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {loading && !data?.rows?.length ? (
          <div className="grid gap-4 px-4 pb-5 md:px-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,30rem),1fr))]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-2xl" />
            ))}
          </div>
        ) : !data?.rows?.length ? (
          <div className="px-5 pb-8 pt-2">
            {L.hasFilters ? (
              <p className="text-body text-muted">{t('common.noResults')}</p>
            ) : (
              <EmptyState
                icon={<Boxes className="h-6 w-6" aria-hidden="true" />}
                body={t('inv.empty')}
                action={
                  can('beneficiaries') ? (
                    <Button onClick={() => router.push('/beneficiaries/purchase')} icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>
                      {t('dash.recordPurchase')}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        ) : (
          <div className="grid gap-4 px-4 pb-5 md:px-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,30rem),1fr))]">
            {data.rows.map((r) => (
              <ProductCard
                key={r.id}
                row={r}
                canTransfer={can('inventory') && otherLocs.length > 0}
                onOpen={() => setHistory(r)}
                onProcess={() => setProcess({ row: r })}
                onTransfer={() => setTransfer(r)}
              />
            ))}
          </div>
        )}
        {data ? <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </section>

      {process ? (
        <ProcessDialog
          row={process.row}
          edit={process.edit}
          inventoryId={inventoryId}
          onClose={() => {
            setProcess(null);
            if (editProcessing) router.replace('/inventory');
          }}
        />
      ) : null}
      {history ? (
        <HistoryDialog
          row={history}
          inventoryId={inventoryId}
          onClose={() => setHistory(null)}
          onProcess={() => (setHistory(null), setProcess({ row: history }))}
        />
      ) : null}
      {createLoc ? <InventoryLocDialog onClose={() => setCreateLoc(false)} onSaved={onLocSaved} /> : null}
      {editLoc ? <InventoryLocDialog loc={editLoc} onClose={() => setEditLoc(null)} onSaved={onLocSaved} /> : null}
      {rentLoc ? <RentDialog loc={rentLoc} onClose={() => setRentLoc(null)} /> : null}
      {transfer && inventoryId ? (
        <TransferDialog
          row={transfer}
          fromInventoryId={inventoryId}
          fromName={selectedLoc?.name ?? data?.inventoryName ?? ''}
          destinations={otherLocs}
          onClose={() => setTransfer(null)}
        />
      ) : null}
    </div>
  );
}

/** White pill action used across the redesigned inventory page. */
const PILL =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-surface-solid px-5 text-meta font-semibold text-ink shadow-[0_2px_8px_-4px_rgba(17,24,39,0.18)] ring-1 ring-line motion-safe:transition-[box-shadow,color] motion-safe:duration-150 hover:text-brand-ink hover:ring-brand/40';

function InvKpi({
  icon,
  color,
  waveColor,
  label,
  value,
  sub,
  alert,
  active,
  onClick,
}: {
  icon: ReactNode;
  color: string;
  waveColor?: string;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  alert?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <KpiWave color={waveColor ?? color} className="absolute end-0 top-3 h-[72px] w-[48%] opacity-90 rtl:-scale-x-100" />
      <span className="relative flex items-center gap-3">
        <span
          className="stat-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-200 group-hover:scale-110 md:h-14 md:w-14"
          style={{ ['--stat-fill' as string]: color }}
        >
          {icon}
        </span>
        <span className="min-w-0 text-meta font-medium leading-tight text-muted">{label}</span>
      </span>
      <span className="fig relative mt-4 block break-words text-[22px] font-extrabold leading-tight text-ink md:text-[30px]">{value}</span>
      {sub ? <span className="relative mt-1 block text-caption font-semibold text-danger-ink">{sub}</span> : null}
    </>
  );
  const cls = cx(
    'alu-kpi group relative block min-w-0 overflow-hidden rounded-[18px] p-4 text-start md:p-5',
    alert && 'is-alert',
    active && 'ring-2 ring-danger/50',
    onClick && 'cursor-pointer motion-safe:transition-transform motion-safe:duration-200 hover:scale-[1.01]',
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ProductCard({
  row: r,
  canTransfer,
  onOpen,
  onProcess,
  onTransfer,
}: {
  row: Row;
  canTransfer: boolean;
  onOpen: () => void;
  onProcess: () => void;
  onTransfer: () => void;
}) {
  const { t, can } = useApp();
  const hasRaw = D(r.rawKg).gt(0);
  const hasFin = D(r.finishedKg).gt(0);
  const canXfer = canTransfer && (hasRaw || hasFin);
  const needsRestock = r.status !== 'in' && can('beneficiaries');

  return (
    <article className="alu-card alu-glass alu-card--interactive group flex gap-4 rounded-2xl p-3.5 focus-within:ring-2 focus-within:ring-brand/40 md:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onOpen}
        className="hidden w-[124px] shrink-0 items-center justify-center self-stretch rounded-xl bg-gradient-to-br from-surface-2 to-tint ring-1 ring-line-soft sm:flex"
      >
        <ProductArt seed={r.sku} className="h-[108px] w-[108px] motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-105" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <button type="button" onClick={onOpen} className="min-w-0 text-start">
          <span className="flex items-start gap-3">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-surface-2 to-tint ring-1 ring-line-soft sm:hidden">
              <ProductArt seed={r.sku} className="h-14 w-14" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="bidi block truncate text-lead font-bold text-ink">{r.name}</span>
                {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
                <span className="num rounded-full bg-tint-2 px-2.5 py-0.5 font-semibold text-brand-ink">{r.sku}</span>
                <span className="bidi">{r.typeName}</span>
              </span>
            </span>
            {r.status === 'in' ? null : <Badge tone={STATUS_TONE[r.status]}>{t(r.status === 'low' ? 'inv.low' : 'inv.out')}</Badge>}
          </span>
          <span className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-tint px-3 py-3">
            <span className="min-w-0">
              <span className="block text-caption text-muted">{t('inv.cardRaw')}</span>
              <span className="num block truncate text-body font-bold text-ink">{fmtKg(r.rawKg)}</span>
              <span className="num block text-caption text-muted">{hasRaw ? `${fmtCost(r.rawAvg)}/kg` : '—'}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-caption text-muted">{t('inv.cardFinished')}</span>
              <span className="num block truncate text-body font-bold text-ink">{fmtKg(r.finishedKg)}</span>
              <span className="num block text-caption text-muted">{hasFin ? `${fmtCost(r.finishedAvg)}/kg` : '—'}</span>
            </span>
            <span className="min-w-0 text-end">
              <span className="block text-caption text-muted">{t('inv.cardValue')}</span>
              <span className="num block truncate text-body font-bold text-ink">{fmtMoney(r.value)}</span>
            </span>
          </span>
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {needsRestock ? (
            <Link href={`/beneficiaries/purchase?product=${r.id}`} className="alu-btn-primary inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-meta font-semibold text-on-brand">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {t('inv.restock')}
            </Link>
          ) : hasRaw ? (
            <button type="button" onClick={onProcess} className={PILL}>
              <Factory className="h-4 w-4" aria-hidden="true" />
              {t('inv.process')}
            </button>
          ) : null}
          {canXfer ? (
            <button type="button" onClick={onTransfer} className={PILL}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              {t('inv.transfer')}
            </button>
          ) : null}
          {r.status === 'in' && can('beneficiaries') && !hasRaw ? (
            <Link href={`/beneficiaries/purchase?product=${r.id}`} className={PILL}>
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {t('inv.restock')}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function InventoryLocDialog({ loc, onClose, onSaved }: { loc?: InventoryRow; onClose: () => void; onSaved: (id: string) => void }) {
  const { t, bump } = useApp();
  const toast = useToast();
  const editing = !!loc;
  const [name, setName] = useState(loc?.name ?? '');
  const [address, setAddress] = useState(loc?.address ?? '');
  const [size, setSize] = useState(loc?.size ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!name.trim()) er.name = t('v.required');
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await api<InventoryRow>(editing ? `/api/inventories/${loc!.id}` : '/api/inventories', {
      method: editing ? 'PUT' : 'POST',
      body: { name: name.trim(), address: address.trim(), size: size.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(editing ? t('inv.locUpdated') : t('inv.locCreated'));
    bump();
    onSaved(res.data.id);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t('inv.editLoc') : t('inv.addLoc')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="loc-form" busy={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="loc-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('inv.locName')} htmlFor="loc-name" error={errors.name} required>
          <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} data-autofocus />
        </Field>
        <Field label={t('inv.locAddress')} htmlFor="loc-address" error={errors.address} optionalLabel={t('common.optional')}>
          <Input id="loc-address" value={address} onChange={(e) => setAddress(e.target.value)} invalid={!!errors.address} />
        </Field>
        <Field label={t('inv.locSize')} htmlFor="loc-size" error={errors.size} optionalLabel={t('common.optional')}>
          <Input id="loc-size" value={size} onChange={(e) => setSize(e.target.value)} invalid={!!errors.size} placeholder={t('inv.locSizePh')} />
        </Field>
      </form>
    </Dialog>
  );
}

function RentDialog({ loc, onClose }: { loc: InventoryRow; onClose: () => void }) {
  const { t, bump } = useApp();
  const toast = useToast();
  const [amount, setAmount] = useState(loc.rentAmount ?? '');
  const [vault, setVault] = useState<Cur>((loc.rentVault as Cur) ?? 'USD');
  const [nextDue, setNextDue] = useState(loc.rentNextDue ?? localTodayIso());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!amount.trim()) er.amount = t('v.required');
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await api<InventoryRow>(`/api/inventories/${loc.id}/rent`, {
      method: 'PUT',
      body: { amount: amount.trim(), vault, nextDue },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('inv.rentSaved'));
    bump();
    onClose();
  }

  async function clearRent() {
    setClearing(true);
    const res = await api<InventoryRow>(`/api/inventories/${loc.id}/rent`, { method: 'PUT', body: { amount: null } });
    setClearing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t('inv.rentSaved'));
    bump();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={loc.rentAmount ? t('inv.rentEdit') : t('inv.rentSet')}
      description={loc.name}
      footer={
        <>
          {loc.rentAmount ? (
            <Button variant="danger" className="md:me-auto" busy={clearing} onClick={() => void clearRent()}>
              {t('inv.rentClear')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="rent-form" busy={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="rent-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('inv.rentAmount')} htmlFor="rent-amt" error={errors.amount} required>
          <Input id="rent-amt" numeric value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} data-autofocus />
        </Field>
        <Field label={t('inv.rentVault')} htmlFor="rent-vault">
          <Segmented<Cur>
            label={t('inv.rentVault')}
            value={vault}
            onChange={setVault}
            options={[
              { value: 'USD', label: t('vault.USD') },
              { value: 'IQD', label: t('vault.IQD') },
            ]}
            className="w-full"
          />
        </Field>
        <Field label={t('inv.rentNext')} htmlFor="rent-due" error={errors.nextDue} required>
          <DateInput id="rent-due" value={nextDue} onChange={setNextDue} />
        </Field>
      </form>
    </Dialog>
  );
}

function TransferDialog({
  row,
  fromInventoryId,
  fromName,
  destinations,
  onClose,
}: {
  row: Row;
  fromInventoryId: string;
  fromName: string;
  destinations: InventoryRow[];
  onClose: () => void;
}) {
  const { t, bump } = useApp();
  const toast = useToast();
  const [state, setState] = useState<'RAW' | 'FINISHED'>(D(row.rawKg).gt(0) ? 'RAW' : 'FINISHED');
  const [toId, setToId] = useState(destinations[0]?.id ?? '');
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(localTodayIso());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const maxKg = state === 'RAW' ? D(row.rawKg) : D(row.finishedKg);
  const stateOptions = useMemo(
    () =>
      [
        D(row.rawKg).gt(0) ? ({ value: 'RAW' as const, label: t('state.RAW') }) : null,
        D(row.finishedKg).gt(0) ? ({ value: 'FINISHED' as const, label: t('state.FINISHED') }) : null,
      ].filter(Boolean) as { value: 'RAW' | 'FINISHED'; label: string }[],
    [row.rawKg, row.finishedKg, t],
  );

  useEffect(() => {
    if (!stateOptions.some((o) => o.value === state)) setState(stateOptions[0]?.value ?? 'RAW');
  }, [state, stateOptions]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const k = parseDec(kg);
    if (!toId) er.toInventoryId = t('v.required');
    if (!kg) er.kg = t('v.required');
    else if (!k || !k.gt(0)) er.kg = t('v.positive');
    else if (k.gt(maxKg)) er.kg = t('v.processTooMuch', { kg: fmtKg(maxKg) });
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await api<{ id: string; number: string }>('/api/inventory/transfer', {
      method: 'POST',
      body: { productId: row.id, state, kg, fromInventoryId, toInventoryId: toId, date, notes },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(t('inv.transferOk', { number: res.data.number }));
    bump();
    onClose();
  }

  if (!destinations.length) {
    return (
      <Dialog open onClose={onClose} title={t('inv.transfer')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
        <p className="text-body text-muted">{t('inv.noOtherLoc')}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('inv.transfer')}
      description={`${row.name} · ${row.sku}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="xfer-form" busy={busy} icon={<ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}>
            {t('inv.transfer')}
          </Button>
        </>
      }
    >
      <form id="xfer-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('pur.stateReceived')} htmlFor="xfer-state">
          <Segmented<'RAW' | 'FINISHED'>
            label={t('pur.stateReceived')}
            value={state}
            onChange={setState}
            options={stateOptions}
            className="w-full"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('inv.transferFrom')} htmlFor="xfer-from">
            <Input id="xfer-from" value={fromName} readOnly className="bidi opacity-70" aria-readonly />
          </Field>
          <Field label={t('inv.transferTo')} htmlFor="xfer-to" error={errors.toInventoryId} required>
            <Select id="xfer-to" value={toId} onChange={(e) => setToId(e.target.value)} invalid={!!errors.toInventoryId}>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-ctl bg-tint px-4 py-3">
          <span className="text-meta text-muted">{t('common.max')}</span>
          <span className="num text-title font-bold text-ink">{fmtKg(maxKg)}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('common.kg')} htmlFor="xfer-kg" error={errors.kg} required>
            <div className="flex gap-2">
              <Input id="xfer-kg" numeric value={kg} onChange={(e) => setKg(e.target.value)} invalid={!!errors.kg} placeholder="0.000" data-autofocus />
              <button
                type="button"
                disabled={!maxKg.gt(0)}
                onClick={() => setKg(maxKg.toDecimalPlaces(3).toString())}
                className="h-14 shrink-0 rounded-ctl border-4 border-brand px-4 text-meta font-extrabold tracking-[0.04em] text-brand-ink transition-all duration-200 hover:scale-105 active:scale-100 disabled:border-line disabled:text-muted disabled:hover:scale-100 hover:bg-brand hover:text-on-brand"
              >
                {t('common.max')}
              </button>
            </div>
          </Field>
          <Field label={t('common.date')} htmlFor="xfer-date" required>
            <DateInput id="xfer-date" value={date} onChange={setDate} />
          </Field>
        </div>
        <Field label={t('common.notes')} htmlFor="xfer-notes" optionalLabel={t('common.optional')}>
          <Textarea id="xfer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Mirror of the server's loss maths, for the live preview only. */
function previewLoss(input: Dec, method: 'PERCENT' | 'KG', pct: Dec | null, kg: Dec | null) {
  if (method === 'PERCENT') {
    const p = pct ?? new Dec(0);
    const loss = input.times(p).div(100).toDecimalPlaces(3);
    return { loss, pct: p, out: input.minus(loss) };
  }
  const loss = (kg ?? new Dec(0)).toDecimalPlaces(3);
  return { loss, pct: input.gt(0) ? loss.div(input).times(100) : new Dec(0), out: input.minus(loss) };
}

function ProcessDialog({
  row,
  edit,
  inventoryId,
  onClose,
}: {
  row: Pick<Row, 'id' | 'name' | 'sku' | 'rawKg' | 'rawAvg'>;
  edit?: TxnDetail;
  inventoryId: string;
  onClose: () => void;
}) {
  const { t, bump } = useApp();
  const toast = useToast();
  const available = D(row.rawKg).plus(edit ? D(edit.inputKg) : 0);
  const [date, setDate] = useState(edit?.date ?? localTodayIso());
  const [inputKg, setInputKg] = useState(edit ? D(edit.inputKg).toString() : '');
  const [method, setMethod] = useState<'PERCENT' | 'KG'>((edit?.lossMethod as 'PERCENT' | 'KG') ?? 'PERCENT');
  const [pct, setPct] = useState(edit && edit.lossMethod === 'PERCENT' ? D(edit.lossPercent).toString() : '');
  const [lossKg, setLossKg] = useState(edit && edit.lossMethod === 'KG' ? D(edit.lossKg).toString() : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const input = parseDec(inputKg);
  const valid = input && input.gt(0);
  const prev = valid ? previewLoss(input, method, parseDec(pct), parseDec(lossKg)) : null;
  const okPreview = prev && prev.out.gt(0) && !prev.loss.isNegative() && (method === 'KG' ? !!lossKg : !!pct);
  const finishedCost = okPreview ? D(row.rawAvg).times(input!).div(prev!.out) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!inputKg) er.inputKg = t('v.required');
    else if (!valid) er.inputKg = t('v.positive');
    else if (input!.gt(available)) er.inputKg = t('v.processTooMuch', { kg: fmtKg(available) });
    if (method === 'PERCENT') {
      const p = parseDec(pct);
      if (!pct) er.lossPercent = t('v.required');
      else if (!p || p.isNegative() || p.gte(100)) er.lossPercent = t('v.lossRangePct');
    } else {
      const k = parseDec(lossKg);
      if (!lossKg) er.lossKg = t('v.required');
      else if (!k || k.isNegative() || (input && k.gte(input))) er.lossKg = t('v.lossRangeKg');
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await api<{ id: string; number: string }>(edit ? `/api/processing/${edit.id}` : '/api/processing', {
      method: edit ? 'PUT' : 'POST',
      body: { productId: row.id, date, inputKg, method, lossPercent: pct, lossKg, notes, inventoryId },
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(edit ? t('toast.updated') : t('toast.processingRecorded', { number: res.data.number }));
    bump();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('prc.title', { product: row.name })}
      description={row.sku}
      banner={edit ? <EditingBanner text={t('prc.editing', { number: edit.number })} /> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="prc-form" busy={busy} disabled={!available.gt(0)} icon={<Factory className="h-4 w-4" aria-hidden="true" />}>
            {edit ? t('common.saveChanges') : t('prc.confirm')}
          </Button>
        </>
      }
    >
      {!available.gt(0) ? (
        <p className="rounded-ctl bg-warning-tint px-4 py-3 text-body text-warning-ink">{t('prc.noRaw')}</p>
      ) : (
        <form id="prc-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-ctl bg-tint px-4 py-3">
            <span className="text-meta text-muted">{t('prc.rawAvailable')}</span>
            <span className="num text-title font-bold text-ink">{fmtKg(available)}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('prc.kgToProcess')} htmlFor="prc-kg" error={errors.inputKg} required>
              <div className="flex gap-2">
                <Input id="prc-kg" numeric value={inputKg} onChange={(e) => setInputKg(e.target.value)} invalid={!!errors.inputKg} placeholder="0.000" data-autofocus />
                <button
                  type="button"
                  onClick={() => setInputKg(available.toDecimalPlaces(3).toString())}
                  className="h-14 shrink-0 rounded-ctl border-4 border-brand px-4 text-meta font-extrabold tracking-[0.04em] text-brand-ink transition-all duration-200 hover:scale-105 active:scale-100 disabled:hover:scale-100 hover:bg-brand hover:text-on-brand"
                >
                  {t('common.max')}
                </button>
              </div>
            </Field>
            <Field label={t('common.date')} htmlFor="prc-date" required>
              <DateInput id="prc-date" value={date} onChange={setDate} />
            </Field>
          </div>
          <Field label={t('prc.lossMethod')} htmlFor="prc-method">
            <Segmented<'PERCENT' | 'KG'>
              label={t('prc.lossMethod')}
              value={method}
              onChange={setMethod}
              options={[
                { value: 'PERCENT', label: t('prc.byPercent') },
                { value: 'KG', label: t('prc.byKg') },
              ]}
              className="w-full"
            />
          </Field>
          {method === 'PERCENT' ? (
            <Field label={t('prc.lossPercent')} htmlFor="prc-pct" error={errors.lossPercent} required>
              <div className="relative">
                <Input id="prc-pct" numeric value={pct} onChange={(e) => setPct(e.target.value)} invalid={!!errors.lossPercent} placeholder="0" className="pe-10" />
                <span className="input-suffix pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-muted">%</span>
              </div>
            </Field>
          ) : (
            <Field label={t('prc.lossKg')} htmlFor="prc-losskg" error={errors.lossKg} required>
              <div className="relative">
                <Input id="prc-losskg" numeric value={lossKg} onChange={(e) => setLossKg(e.target.value)} invalid={!!errors.lossKg} placeholder="0.000" className="pe-10" />
                <span className="input-suffix pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-muted">kg</span>
              </div>
            </Field>
          )}

          {okPreview ? (
            <div className="rounded-ctl bg-surface-2">
              <div className="grid grid-cols-3 divide-x divide-line-soft text-center rtl:divide-x-reverse">
                <div className="px-3 py-3">
                  <p className="text-caption text-muted">{t('state.RAW')}</p>
                  <p className="num text-body font-bold text-ink">{fmtKg(input!)}</p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-caption text-muted">{t('detail.lossKg')}</p>
                  <p className="num text-body font-bold text-danger-ink">−{fmtKg(prev!.loss)}</p>
                </div>
                <div className="bg-success-tint px-3 py-3">
                  <p className="text-caption text-success-ink">{t('state.FINISHED')}</p>
                  <p className="num text-body font-bold text-success-ink">{fmtKg(prev!.out)}</p>
                </div>
              </div>
              <p className="num border-t border-line-soft px-3 py-2 text-meta text-ink">
                {method === 'PERCENT'
                  ? t('prc.previewPct', { out: fmtKg(prev!.out), pct: fmtPct(prev!.pct), in: fmtKg(input!), lost: fmtKg(prev!.loss) })
                  : t('prc.previewKg', { in: fmtKg(input!), loss: fmtKg(prev!.loss), out: fmtKg(prev!.out), pct: fmtPct(prev!.pct) })}
              </p>
              {finishedCost ? <p className="num border-t border-line-soft px-3 py-2 text-caption text-muted">{t('prc.finishedCost', { x: fmtCost(finishedCost) })}</p> : null}
            </div>
          ) : null}

          <Field label={t('common.notes')} htmlFor="prc-notes" optionalLabel={t('common.optional')}>
            <Textarea id="prc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </Field>
        </form>
      )}
    </Dialog>
  );
}

const MV_LABEL = {
  purchase: 'inv.mvPurchase',
  sale: 'inv.mvSale',
  processOut: 'inv.mvProcessOut',
  processIn: 'inv.mvProcessIn',
  transferOut: 'inv.mvTransferOut',
  transferIn: 'inv.mvTransferIn',
  reversal: 'inv.mvReversal',
  adjust: 'inv.mvAdjust',
} as const;

function HistoryDialog({
  row,
  inventoryId,
  onClose,
  onProcess,
}: {
  row: Row;
  inventoryId: string;
  onClose: () => void;
  onProcess: () => void;
}) {
  const { t, can } = useApp();
  const panel = useTxnPanel();
  const erase = useErase();
  const [revert, setRevert] = useState<string | null>(null);
  const { data } = useRemote<Hist>(`/api/inventory/${row.id}${qs({ inventoryId })}`);
  const txnCount = new Set((data?.rows ?? []).map((h) => h.txnId)).size;
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t('inv.historyTitle', { product: row.name })}
      description={`${row.sku} · ${row.typeName}`}
      footer={
        <>
          {erase.active && txnCount ? (
            <Button variant="danger" className="md:me-auto" onClick={() => void erase.eraseProduct(row.id, row.name, txnCount)} icon={<Eraser className="h-4 w-4" aria-hidden="true" />}>
              {t('erase.prodAll')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button disabled={!D(row.rawKg).gt(0)} onClick={onProcess} icon={<Factory className="h-4 w-4" aria-hidden="true" />}>
            {t('inv.process')}
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {(['RAW', 'FINISHED'] as const).map((s) => (
              <div key={s} className="rounded-ctl bg-tint px-4 py-3">
                <p className="text-caption text-muted">{t(`state.${s}`)}</p>
                <p className="num text-title font-bold text-ink">{fmtKg(data.stock[s].kg)}</p>
                <p className="num text-caption text-muted">{D(data.stock[s].kg).gt(0) ? `${fmtCost(data.stock[s].avg)}/kg` : '—'}</p>
              </div>
            ))}
          </div>
          {!data.rows.length ? (
            <p className="py-8 text-center text-body text-muted">{t('inv.historyEmpty')}</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px] text-meta [&_td]:px-2 [&_th]:px-2">
                <thead>
                  <tr className="border-b border-line text-caption text-muted">
                    <th scope="col" className="py-2 text-start font-semibold">
                      {t('common.date')}
                    </th>
                    <th scope="col" className="py-2 text-start font-semibold">
                      {t('common.number')}
                    </th>
                    <th scope="col" className="py-2 text-start font-semibold">
                      {t('inv.movement')}
                    </th>
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t('common.kg')}
                    </th>
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t('inv.cost')}
                    </th>
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t('inv.rawRunning')}
                    </th>
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t('inv.finishedRunning')}
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((h) => {
                    const kg = D(h.kg);
                    return (
                      <tr key={h.id} className={cx('border-b border-line-soft last:border-0', h.deleted && 'text-muted line-through decoration-muted/50')}>
                        <td className="num py-2.5 text-muted">{fmtDate(h.date)}</td>
                        <td className="py-2.5">
                          <button type="button" onClick={() => panel.open(h.txnId)} className="num rounded font-semibold text-brand-ink hover:underline">
                            {h.number}
                          </button>
                        </td>
                        <td className="py-2.5 text-ink">
                          {t(MV_LABEL[h.movement])} <span className="text-caption text-muted">({t(`state.${h.state}`)})</span>
                          {h.lossKg ? <span className="num ms-1 text-caption text-danger-ink">· {t('inv.lossKgCol')} {fmtKg(h.lossKg)}</span> : null}
                        </td>
                        <td className={cx('num py-2.5 text-end font-semibold', kg.gt(0) ? 'text-success-ink' : kg.isNegative() ? 'text-danger-ink' : 'text-muted')}>
                          {kg.isZero() ? '—' : `${kg.gt(0) ? '+' : '−'}${fmtKg(kg.abs())}`}
                        </td>
                        <td className="num py-2.5 text-end text-muted">{fmtMoney(D(h.valueUsd).abs().toDecimalPlaces(2))}</td>
                        <td className="num py-2.5 text-end text-ink">{fmtKg(h.rawAfter)}</td>
                        <td className="num py-2.5 text-end text-ink">{fmtKg(h.finishedAfter)}</td>
                        <td className="py-1.5 ps-2 text-end">
                          {erase.active ? (
                            <button
                              type="button"
                              onClick={() => void erase.eraseTxn(h.txnId, h.number)}
                              aria-label={t('erase.txnN', { number: h.number })}
                              title={t('erase.txn')}
                              className="inline-flex h-14 w-14 items-center justify-center rounded-ctl text-danger-ink transition-colors hover:bg-danger-tint"
                            >
                              <Eraser className="h-4 w-4" aria-hidden="true" />
                            </button>
                          ) : h.movement === 'processIn' && !h.deleted && can('inventory') ? (
                            <Button size="sm" variant="quiet" onClick={() => setRevert(h.txnId)} icon={<Undo2 className="h-4 w-4" aria-hidden="true" />} className="whitespace-nowrap">
                              {t('prc.revertShort')}
                            </Button>
                          ) : h.reverted && h.movement === 'processIn' ? (
                            <Badge tone="warning">{t('status.reverted')}</Badge>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <RevertProcessingDialog txnId={revert} onClose={() => setRevert(null)} />
    </Dialog>
  );
}
