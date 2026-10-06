'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Boxes, CheckCircle2, Eraser, Factory, PackagePlus, Undo2, Wallet, X } from 'lucide-react';
import type { listInventory, productHistory } from '@/lib/server/q/inventory';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDate, localTodayIso } from '@/lib/dates';
import { D, Dec, fmtCost, fmtKg, fmtMoney, fmtPct, parseDec } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Segmented, Select, Skeleton, Textarea } from '@/components/ui';
import { SummaryCell, SummaryStrip } from '@/components/Summary';
import { DataTable, Pager, SearchBox, useListState, type Column } from '@/components/DataTable';
import { DateInput } from '@/components/DateInput';
import { Dialog, EditingBanner } from '@/components/Dialog';
import { useTxnPanel } from '@/components/TxnPanel';
import { useToast } from '@/components/Toast';
import { useErase } from '@/components/EraseMode';
import { RevertProcessingDialog } from '@/components/RevertProcessing';

type Inv = Awaited<ReturnType<typeof listInventory>>;
type Row = Inv['rows'][number];
type Hist = Awaited<ReturnType<typeof productHistory>>;

const STATUS_TONE = { in: 'success', low: 'warning', out: 'danger' } as const;

export function InventoryView({ editProcessing }: { editProcessing: TxnDetail | null }) {
  const { t, can } = useApp();
  const router = useRouter();
  const L = useListState('name', 'asc', { typeId: '', status: '' });
  const { data, loading } = useRemote<Inv>(`/api/inventory${L.query}`, { keepPrevious: true });
  const types = useRemote<{ id: string; name: string }[]>('/api/lookup/types');
  const [process, setProcess] = useState<{ row: Pick<Row, 'id' | 'name' | 'sku' | 'rawKg' | 'rawAvg'>; edit?: TxnDetail } | null>(null);
  const [history, setHistory] = useState<Row | null>(null);

  // /inventory?edit=<processingId> — open the processing dialog in edit mode.
  useEffect(() => {
    if (!editProcessing?.product) return;
    api<Row[]>(`/api/lookup/products${qs({ ids: editProcessing.product.id })}`).then((r) => {
      const p = r.ok ? r.data[0] : undefined;
      setProcess({
        row: { id: editProcessing.product!.id, name: editProcessing.product!.name, sku: editProcessing.product!.sku, rawKg: p?.rawKg ?? '0', rawAvg: p?.rawAvg ?? '0' },
        edit: editProcessing,
      });
    });
  }, [editProcessing]);

  const cols: Column<Row>[] = [
    {
      key: 'name',
      label: t('common.product'),
      sortable: true,
      render: (r) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2">
            <span className="bidi truncate font-semibold text-ink">{r.name}</span>
            {r.isDemo ? <Badge tone="brand">{t('app.demo')}</Badge> : null}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
            <span className="num rounded bg-tint px-1.5 font-semibold text-brand-ink">{r.sku}</span>
            <span className="bidi">{r.typeName}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'raw',
      label: t('inv.rawKg'),
      sortable: true,
      align: 'end',
      render: (r) => (
        <span className="block">
          <span className="num block font-semibold text-ink">{fmtKg(r.rawKg)}</span>
          <span className="num block text-caption text-muted">{D(r.rawKg).gt(0) ? `${fmtCost(r.rawAvg)}/kg` : '—'}</span>
        </span>
      ),
    },
    {
      key: 'finished',
      label: t('inv.finishedKg'),
      sortable: true,
      align: 'end',
      render: (r) => (
        <span className="block">
          <span className="num block font-semibold text-ink">{fmtKg(r.finishedKg)}</span>
          <span className="num block text-caption text-muted">{D(r.finishedKg).gt(0) ? `${fmtCost(r.finishedAvg)}/kg` : '—'}</span>
        </span>
      ),
    },
    { key: 'value', label: t('inv.stockValue'), sortable: true, align: 'end', render: (r) => <span className="num font-semibold text-ink">{fmtMoney(r.value)}</span> },
    // Only problems get a badge (Von Restorff): "In stock" is the normal state and stays quiet.
    { key: 'status', label: t('common.status'), render: (r) => (r.status === 'in' ? <span className="text-meta text-muted">—</span> : <Badge tone={STATUS_TONE[r.status]}>{t(r.status === 'low' ? 'inv.low' : 'inv.out')}</Badge>) },
    {
      key: 'actions',
      label: <span className="sr-only">{t('common.actions')}</span>,
      align: 'end',
      render: (r) => (
        // One visible action per row — the one this product needs next (Hick's law). The row itself opens history.
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status !== 'in' && can('beneficiaries') ? (
            <Link href={`/beneficiaries/purchase?product=${r.id}`} className="inline-flex h-14 items-center gap-1.5 rounded-ctl bg-brand px-3 text-meta font-semibold text-on-brand hover:bg-brand-strong">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {t('inv.restock')}
            </Link>
          ) : D(r.rawKg).gt(0) ? (
            <Button size="sm" variant="secondary" onClick={() => setProcess({ row: r })} icon={<Factory className="h-4 w-4" aria-hidden="true" />}>
              {t('inv.process')}
            </Button>
          ) : null}
          {r.status === 'in' && can('beneficiaries') ? (
            <Link
              href={`/beneficiaries/purchase?product=${r.id}`}
              aria-label={`${t('inv.restock')} — ${r.name}`}
              title={t('inv.restock')}
              className="inline-flex h-14 w-14 items-center justify-center rounded-ctl text-muted opacity-60 transition-opacity hover:bg-tint hover:text-brand-ink hover:opacity-100 focus-visible:opacity-100"
            >
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('inv.title')}
        subtitle={t('inv.subtitle')}
        actions={
          can('beneficiaries') ? (
            <Link href="/beneficiaries/purchase">
              <Button size="lg" icon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}>{t('dash.recordPurchase')}</Button>
            </Link>
          ) : null
        }
      />

      <SummaryStrip className="mb-5">
        <SummaryCell icon={<Boxes className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('inv.totalRaw')} value={data ? fmtKg(data.totals.rawKg) : '—'} />
        <SummaryCell icon={<Factory className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('inv.totalFinished')} value={data ? fmtKg(data.totals.finishedKg) : '—'} />
        <SummaryCell icon={<Wallet className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('inv.totalValue')} value={data ? fmtMoney(D(data.totals.value).toDecimalPlaces(2)) : '—'} />
        {data && data.totals.low + data.totals.out > 0 ? (
          <SummaryCell
            icon={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />}
            label={t('inv.needsRestock')}
            value={String(data.totals.low + data.totals.out)}
            tone="danger"
            alert
            sub={t('inv.lowOut', { low: data.totals.low, out: data.totals.out })}
            active={L.filters.status === 'attention'}
            onClick={() => L.setFilter('status', L.filters.status === 'attention' ? '' : 'attention')}
          />
        ) : (
          <SummaryCell icon={<CheckCircle2 className="h-[18px] w-[18px]" aria-hidden="true" />} label={t('inv.needsRestock')} value={<span className="text-success-ink">{t('inv.allStocked')}</span>} />
        )}
      </SummaryStrip>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pb-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchBox value={L.q} onChange={L.setQ} placeholder={t('inv.searchPh')} className="sm:w-72" />
            <Select aria-label={t('common.aluminumType')} value={L.filters.typeId} onChange={(e) => L.setFilter('typeId', e.target.value)} className="sm:w-48">
              <option value="">{t('common.aluminumType')}: {t('common.all')}</option>
              {(types.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </div>
          {L.filters.status ? (
            <button type="button" onClick={() => L.setFilter('status', '')} className="inline-flex h-14 items-center gap-1.5 self-start rounded-full bg-danger-tint px-3 text-meta font-semibold text-danger-ink hover:bg-danger-tint/70">
              {t('inv.needsRestock')}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <DataTable
          rows={data?.rows}
          columns={cols}
          sort={L.sort}
          dir={L.dir}
          onSort={L.onSort}
          loading={loading}
          onRowClick={(r) => setHistory(r)}
          minWidth={960}
          caption={t('inv.title')}
          empty={
            L.hasFilters ? (
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
            )
          }
          mobile={(r) => (
            <span className="block">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="bidi block truncate text-body font-semibold text-ink">{r.name}</span>
                  <span className="num text-caption text-muted">
                    {r.sku} · {r.typeName}
                  </span>
                </span>
                {r.status === 'in' ? null : <Badge tone={STATUS_TONE[r.status]}>{t(r.status === 'low' ? 'inv.low' : 'inv.out')}</Badge>}
              </span>
              <span className="mt-2 grid grid-cols-3 gap-2 text-caption">
                <span>
                  <span className="block text-muted">{t('state.RAW')}</span>
                  <span className="num block font-semibold text-ink">{fmtKg(r.rawKg)}</span>
                </span>
                <span>
                  <span className="block text-muted">{t('state.FINISHED')}</span>
                  <span className="num block font-semibold text-ink">{fmtKg(r.finishedKg)}</span>
                </span>
                <span className="text-end">
                  <span className="block text-muted">{t('common.value')}</span>
                  <span className="num block font-semibold text-ink">{fmtMoney(r.value)}</span>
                </span>
              </span>
            </span>
          )}
        />
        {data ? <Pager total={data.total} page={L.page} size={L.size} onPage={L.setPage} onSize={L.setSize} /> : null}
      </Card>

      {process ? (
        <ProcessDialog
          row={process.row}
          edit={process.edit}
          onClose={() => {
            setProcess(null);
            if (editProcessing) router.replace('/inventory');
          }}
        />
      ) : null}
      {history ? <HistoryDialog row={history} onClose={() => setHistory(null)} onProcess={() => (setHistory(null), setProcess({ row: history }))} /> : null}
    </div>
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

function ProcessDialog({ row, edit, onClose }: { row: Pick<Row, 'id' | 'name' | 'sku' | 'rawKg' | 'rawAvg'>; edit?: TxnDetail; onClose: () => void }) {
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
  // Cost of raw consumed moves into finished stock; the loss raises the finished cost per kg.
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
      body: { productId: row.id, date, inputKg, method, lossPercent: pct, lossKg, notes },
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

          {/* Live result: raw in → loss → finished out */}
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
  reversal: 'inv.mvReversal',
  adjust: 'inv.mvAdjust',
} as const;

function HistoryDialog({ row, onClose, onProcess }: { row: Row; onClose: () => void; onProcess: () => void }) {
  const { t, can } = useApp();
  const panel = useTxnPanel();
  const erase = useErase();
  const [revert, setRevert] = useState<string | null>(null);
  const { data } = useRemote<Hist>(`/api/inventory/${row.id}`);
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
          {/* Erase mode only: wipe this product's whole stock history (the product itself stays). */}
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
                    <th scope="col" className="py-2 text-start font-semibold">{t('common.date')}</th>
                    <th scope="col" className="py-2 text-start font-semibold">{t('common.number')}</th>
                    <th scope="col" className="py-2 text-start font-semibold">{t('inv.movement')}</th>
                    <th scope="col" className="py-2 text-end font-semibold">{t('common.kg')}</th>
                    <th scope="col" className="py-2 text-end font-semibold">{t('inv.cost')}</th>
                    <th scope="col" className="py-2 text-end font-semibold">{t('inv.rawRunning')}</th>
                    <th scope="col" className="py-2 text-end font-semibold">{t('inv.finishedRunning')}</th>
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
