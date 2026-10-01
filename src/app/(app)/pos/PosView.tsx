'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileDown, Plus, Printer, ReceiptText, ShoppingCart, Trash2 } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import type { lookupProducts } from '@/lib/server/q/inventory';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { downloadFile, printDocument } from '@/lib/client/print';
import { conversionText } from '@/lib/conversion';
import { balanceLabel } from '@/lib/format';
import { localTodayIso } from '@/lib/dates';
import { D, Dec, fmtKg, fmtMoney, fmtPct, parseDec, roundMoney, toUsd, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Textarea } from '@/components/ui';
import { Combobox, type Option } from '@/components/Combobox';
import { DateInput } from '@/components/DateInput';
import { EditingBanner, Dialog } from '@/components/Dialog';
import { PartyFormDialog } from '@/components/PartyForm';
import { useToast } from '@/components/Toast';
import { useMoneyGuard } from '@/components/MoneyGuard';
import { useInvoiceAutoSave } from '@/components/useInvoiceAutoSave';

type Product = Awaited<ReturnType<typeof lookupProducts>>[number];
type Customer = { id: string; name: string; phone: string; balance: string; isDemo?: boolean };
type State = 'RAW' | 'FINISHED';
type Line = { key: number; product: Option<Product> | null; state: State; kg: string; price: string };

const productOption = (p: Product): Option<Product> => ({ id: p.id, label: p.name, data: p });
const customerOption = (c: Customer): Option<Customer> => ({ id: c.id, label: c.name, data: c });
const stockOf = (p: Product | undefined, s: State) => D(s === 'RAW' ? p?.rawKg : p?.finishedKg);

export function PosView({ edit, customerId }: { edit: TxnDetail | null; customerId: string | null }) {
  const { t, lang, rate: liveRate, bump } = useApp();
  const toast = useToast();
  const saveToFolder = useInvoiceAutoSave();
  const router = useRouter();
  const seq = useRef(1);
  const newLine = (): Line => ({ key: seq.current++, product: null, state: 'FINISHED', kg: '', price: '' });

  const [date, setDate] = useState(edit?.date ?? localTodayIso());
  const [currency, setCurrency] = useState<Cur>((edit?.currency as Cur) ?? 'USD');
  const [vault, setVault] = useState<Cur>((edit?.vault as Cur) ?? 'USD');
  const [customer, setCustomer] = useState<Option<Customer> | null>(null);
  const [lines, setLines] = useState<Line[]>(() => (edit ? [] : [newLine()]));
  const [cash, setCash] = useState(edit ? D(edit.cashPaid).toString() : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const guard = useMoneyGuard();
  const [addOpen, setAddOpen] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; number: string; updated: boolean } | null>(null);

  const rate = edit ? edit.rate : liveRate;

  // Kg this invoice already holds, per product/state — returned to availability while editing.
  const held = useMemo(() => {
    const m = new Map<string, Dec>();
    for (const l of edit?.lines ?? []) m.set(`${l.productId}:${l.state}`, (m.get(`${l.productId}:${l.state}`) ?? new Dec(0)).plus(D(l.kg)));
    return m;
  }, [edit]);
  const available = (l: Line) => (l.product ? stockOf(l.product.data, l.state).plus(held.get(`${l.product.id}:${l.state}`) ?? 0) : new Dec(0));

  // Initial customer + edit lines (with current stock figures).
  useEffect(() => {
    const cid = edit?.customer?.id ?? customerId;
    if (cid) {
      api<Customer[]>(`/api/lookup/customers${qs({ ids: cid })}`).then((r) => {
        if (r.ok && r.data[0]) setCustomer(customerOption(r.data[0]));
      });
    }
    if (edit) {
      const ids = [...new Set(edit.lines.map((l) => l.productId))].join(',');
      api<Product[]>(`/api/lookup/products${qs({ ids })}`).then((r) => {
        const byId = new Map((r.ok ? r.data : []).map((p) => [p.id, p]));
        setLines(
          edit.lines.map((l) => {
            const p = byId.get(l.productId) ?? ({ id: l.productId, name: l.productName, sku: l.sku, typeName: l.typeName, rawKg: '0', finishedKg: '0' } as Product);
            return { key: seq.current++, product: productOption(p), state: l.state as State, kg: D(l.kg).toString(), price: D(l.unitPrice).toString() };
          }),
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ─── Live preview (display only — the server recomputes everything) ─────────────────────────────
  const r = D(rate);
  const lineTotals = lines.map((l) => {
    const kg = parseDec(l.kg);
    const p = parseDec(l.price);
    return kg && p && kg.gt(0) && p.gt(0) ? roundMoney(kg.times(p), currency) : null;
  });
  const total = lineTotals.reduce<Dec>((s, x) => s.plus(x ?? 0), new Dec(0));
  const cashD = roundMoney(parseDec(cash) ?? new Dec(0), currency);
  const totalUsd = toUsd(total, currency, r).toDecimalPlaces(2);
  const cashUsd = toUsd(cashD, currency, r).toDecimalPlaces(2);
  const oldEffect = edit && customer && edit.customer?.id === customer.id ? D(edit.totalUsd).minus(D(edit.cashPaidUsd)) : new Dec(0);
  const prevBal = customer ? D(customer.data.balance).minus(oldEffect) : null;
  const newBal = prevBal ? prevBal.plus(totalUsd).minus(cashUsd) : null;
  const paidPct = total.gt(0) ? Dec.min(100, cashD.div(total).times(100)) : new Dec(0);
  const conv = conversionText(cashD.toString(), currency, vault, rate, 'in', lang);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!customer) e.customerId = t('v.customerRequired');
    if (!date) e.date = t('v.date');
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!l.product) e[`lines.${i}.productId`] = t('v.productRequired');
      else {
        const k = `${l.product.id}:${l.state}`;
        if (seen.has(k)) e[`lines.${i}.productId`] = t('v.duplicateLine');
        seen.add(k);
      }
      const kg = parseDec(l.kg);
      if (!l.kg) e[`lines.${i}.kg`] = t('v.required');
      else if (!kg) e[`lines.${i}.kg`] = t('v.number');
      else if (!kg.gt(0)) e[`lines.${i}.kg`] = t('v.positive');
      else if (l.product && kg.gt(available(l))) e[`lines.${i}.kg`] = t('v.insufficientStock', { kg: fmtKg(available(l)), product: l.product.label });
      const p = parseDec(l.price);
      if (!l.price) e[`lines.${i}.unitPrice`] = t('v.required');
      else if (!p) e[`lines.${i}.unitPrice`] = t('v.number');
      else if (!p.gt(0)) e[`lines.${i}.unitPrice`] = t('v.positive');
    });
    if (!lines.length) e.lines = t('v.lineRequired');
    if (cash && !parseDec(cash)) e.cashPaid = t('v.number');
    else if (cash && parseDec(cash)!.isNegative()) e.cashPaid = t('v.nonNegative');
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('err.fixFields'));
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    setBusy(true);
    const payload = {
      date,
      customerId: customer!.id,
      currency,
      vault,
      cashPaid: cash || '0',
      notes,
      clientTotal: total.toString(),
      lines: lines.map((l) => ({ productId: l.product!.id, state: l.state, kg: l.kg, unitPrice: l.price })),
    };
    const res = await api<{ id: string; number: string }>(edit ? `/api/sales/${edit.id}` : '/api/sales', { method: edit ? 'PUT' : 'POST', body: payload });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error || t(edit ? 'err.update' : 'err.save'));
      return;
    }
    bump();
    toast.success(edit ? t('toast.updated') : t('toast.saleRecorded', { number: res.data.number }));
    saveToFolder(res.data.id, res.data.number);
    setDone({ ...res.data, updated: !!edit });
    if (parseDec(cash)?.gt(0)) guard.afterIncome(vault);
  }

  function resetForNext() {
    setDone(null);
    if (edit) {
      router.push('/pos');
      return;
    }
    setLines([newLine()]);
    setCash('');
    setNotes('');
    setErrors({});
    // Refresh stock figures on the picker by re-fetching the chosen customer's balance.
    if (customer)
      api<Customer[]>(`/api/lookup/customers${qs({ ids: customer.id })}`).then((r) => {
        if (r.ok && r.data[0]) setCustomer(customerOption(r.data[0]));
      });
  }

  const bal = (v: Dec | null) => (v ? balanceLabel('customer', v.toString(), lang) : null);
  const prevL = bal(prevBal);
  const newL = bal(newBal);

  return (
    <div>
      <PageHeader
        title={edit ? t('pos.editing', { number: edit.number }) : t('pos.title')}
        actions={
          edit ? (
            <Link href="/pos">
              <Button variant="secondary">{t('common.cancel')}</Button>
            </Link>
          ) : null
        }
      />
      {edit ? (
        <div className="-mt-2 mb-5 overflow-hidden rounded-card">
          <EditingBanner text={t('pos.editing', { number: edit.number })} />
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Customer, date, currency */}
          <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <Field label={t('pos.customer')} htmlFor="pos-customer" error={errors.customerId} required className="sm:col-span-2 xl:col-span-1">
              <Combobox<Customer>
                id="pos-customer"
                value={customer}
                onChange={(o) => {
                  setCustomer(o);
                  setErrors((e) => ({ ...e, customerId: '' }));
                }}
                source={(q) => `/api/lookup/customers${qs({ q })}`}
                toOption={customerOption}
                placeholder={t('cust.searchPh')}
                invalid={!!errors.customerId}
                onCreate={(name) => setAddOpen(name)}
                renderOption={(o) => {
                  const b = balanceLabel('customer', o.data.balance, lang);
                  return (
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="bidi block truncate">{o.label}</span>
                        {o.data.phone ? (
                          <span className="num block text-caption text-muted" dir="ltr">
                            {o.data.phone}
                          </span>
                        ) : null}
                      </span>
                      <span className={cx('num shrink-0 text-caption font-semibold', b.tone === 'danger' ? 'text-danger-ink' : b.tone === 'success' ? 'text-success-ink' : 'text-muted')}>
                        {b.tone === 'neutral' ? b.short : fmtMoney(D(o.data.balance).abs())}
                      </span>
                    </span>
                  );
                }}
              />
            </Field>
            <Field label={t('common.date')} htmlFor="pos-date" error={errors.date} required>
              <DateInput id="pos-date" value={date} onChange={setDate} invalid={!!errors.date} />
            </Field>
            <Field label={t('common.currency')} htmlFor="pos-cur">
              <Segmented<Cur>
                label={t('common.currency')}
                value={currency}
                onChange={(c) => {
                  setCurrency(c);
                  setVault(c);
                }}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'IQD', label: 'IQD' },
                ]}
                className="w-full xl:w-[140px]"
              />
            </Field>
          </Card>

          {/* Items */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
              <h2 className="text-title font-semibold text-ink">{t('pos.lines')}</h2>
              <span className="text-caption text-muted">{t('rep.lines')}: <span className="num">{lines.length}</span></span>
            </div>
            {errors.lines ? <p role="alert" className="px-5 text-meta font-medium text-danger-ink">{errors.lines}</p> : null}
            <ol className="flex flex-col">
              {lines.map((l, i) => (
                <LineEditor
                  key={l.key}
                  n={i + 1}
                  line={l}
                  currency={currency}
                  available={available(l)}
                  total={lineTotals[i]}
                  errors={{
                    product: errors[`lines.${i}.productId`] || errors[`lines.${i}.state`],
                    kg: errors[`lines.${i}.kg`],
                    price: errors[`lines.${i}.unitPrice`],
                  }}
                  canRemove={lines.length > 1}
                  onChange={(patch) => {
                    upd(l.key, patch);
                    setErrors((e) => ({ ...e, [`lines.${i}.kg`]: '', [`lines.${i}.productId`]: '', [`lines.${i}.unitPrice`]: '' }));
                  }}
                  onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                />
              ))}
            </ol>
            <div className="border-t border-line-soft px-5 py-3">
              <Button variant="ghost" onClick={() => setLines((ls) => [...ls, newLine()])} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                {t('pos.addLine')}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <Field label={t('common.notes')} htmlFor="pos-notes" optionalLabel={t('common.optional')}>
              <Textarea id="pos-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
            </Field>
          </Card>
        </div>

        {/* Payment rail */}
        <aside aria-label={t('pos.payment')} className="lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <div className="bg-brand px-5 pb-5 pt-4 text-on-brand">
              <p className="text-meta font-medium opacity-85">{t('pos.invoiceTotal')}</p>
              <p className="fig mt-1 text-[40px] font-bold leading-none">{fmtMoney(total, currency)}</p>
              {currency === 'IQD' && total.gt(0) ? <p className="num mt-2 text-meta opacity-85">≈ {fmtMoney(totalUsd)}</p> : null}
            </div>
            <div className="flex flex-col gap-4 p-5">
              <Field label={t('common.vault')} htmlFor="pos-vault">
                <Segmented<Cur>
                  label={t('common.vault')}
                  value={vault}
                  onChange={setVault}
                  options={[
                    { value: 'USD', label: t('vault.USD') },
                    { value: 'IQD', label: t('vault.IQD') },
                  ]}
                  className="w-full"
                />
              </Field>
              <Field
                label={t('pos.cashNow')}
                htmlFor="pos-cash"
                error={errors.cashPaid}
                trailing={
                  <button type="button" onClick={() => setCash(total.toString())} disabled={!total.gt(0)} className="rounded px-1 text-caption font-bold text-brand-ink hover:underline disabled:opacity-40">
                    {t('pos.payFull')}
                  </button>
                }
              >
                <div className="relative">
                  <Input id="pos-cash" numeric value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" invalid={!!errors.cashPaid} className="pe-14" />
                  <span className="input-suffix pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{currency}</span>
                </div>
              </Field>
              {conv ? <p className="num rounded-ctl bg-tint px-3 py-2 text-caption text-ink">{conv}</p> : null}

              {/* Paid / due split */}
              <div className={cx(!total.gt(0) && 'hidden')}>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-danger-tint" aria-hidden="true">
                  <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${paidPct.toNumber()}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-caption font-semibold">
                  <span className="text-success-ink">{t('pos.paidShare', { pct: fmtPct(paidPct) })}</span>
                  <span className="text-danger-ink">{t('pos.dueShare', { pct: fmtPct(new Dec(100).minus(paidPct)) })}</span>
                </div>
              </div>

              {/* Balance walk-through */}
              {customer && prevL && newL ? (
                <dl className="rounded-ctl border border-line-soft text-meta">
                  <BalRow label={t('pos.prevBalance')} value={prevL.tone === 'neutral' ? prevL.short : fmtMoney(prevBal!.abs())} hint={prevL.tone === 'neutral' ? undefined : prevL.short} tone={prevL.tone} />
                  <BalRow label={t('pos.thisInvoice')} value={`+ ${fmtMoney(totalUsd)}`} />
                  <BalRow label={t('pos.cashNow')} value={`− ${fmtMoney(cashUsd)}`} />
                  <BalRow label={t('pos.newBalance')} value={newL.tone === 'neutral' ? newL.short : fmtMoney(newBal!.abs())} hint={newL.tone === 'neutral' ? undefined : newL.short} tone={newL.tone} strong />
                </dl>
              ) : (
                <p className="rounded-ctl bg-surface-2 px-3 py-3 text-meta text-muted">{t('pos.selectCustomerFirst')}</p>
              )}
              {prevBal?.isNegative() ? <p className="text-caption text-muted">{t('pos.creditApplied')}</p> : null}

              <Button type="submit" size="lg" block busy={busy} icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />}>
                {busy ? t('pos.processing') : edit ? t('pos.updateInvoice') : t('pos.confirm')}
              </Button>
            </div>
          </Card>
        </aside>
      </form>

      <PartyFormDialog
        kind="customer"
        open={addOpen !== null}
        onClose={() => setAddOpen(null)}
        initial={addOpen !== null ? { name: addOpen, phone: '', address: '' } : null}
        onSaved={(p) => setCustomer(customerOption({ id: p.id, name: p.name, phone: p.phone ?? '', balance: '0' }))}
      />

      <InvoiceReady done={done} onNext={resetForNext} />
    </div>
  );
}

function BalRow({ label, value, hint, tone, strong }: { label: string; value: string; hint?: string; tone?: 'danger' | 'success' | 'neutral'; strong?: boolean }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b border-line-soft px-3 py-2 last:border-0', strong && 'bg-surface-2')}>
      <dt className={cx('text-muted', strong && 'font-semibold text-ink')}>{label}</dt>
      <dd className="text-end">
        <span className={cx('num block', strong ? 'text-body font-bold' : 'font-semibold', tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink')}>{value}</span>
        {hint ? <span className="block text-caption text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}

function LineEditor({
  n,
  line,
  currency,
  available,
  total,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  n: number;
  line: Line;
  currency: Cur;
  available: Dec;
  total: Dec | null;
  errors: { product?: string; kg?: string; price?: string };
  canRemove: boolean;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const { t } = useApp();
  const id = `line-${line.key}`;
  const p = line.product?.data;
  const kg = parseDec(line.kg);
  const used = available.gt(0) && kg ? Dec.min(100, kg.div(available).times(100)).toNumber() : 0;
  const over = !!kg && !!line.product && kg.gt(available);
  const raw = stockOf(p, 'RAW');
  const fin = stockOf(p, 'FINISHED');

  return (
    <li className="border-t border-line-soft px-5 py-4 first:border-t-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-tint px-1.5 text-caption font-bold text-brand-ink" aria-hidden="true">
          {n}
        </span>
        {canRemove ? (
          <button type="button" onClick={onRemove} aria-label={t('pos.removeLine', { n })} className="inline-flex h-9 w-9 items-center justify-center rounded-ctl text-muted hover:bg-danger-tint hover:text-danger-ink">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Field label={t('common.product')} htmlFor={`${id}-product`} error={errors.product} required>
          <Combobox<Product>
            id={`${id}-product`}
            value={line.product}
            onChange={(o) => {
              const st: State = o ? (stockOf(o.data, 'FINISHED').gt(0) ? 'FINISHED' : 'RAW') : line.state;
              onChange({ product: o, state: st });
            }}
            source={(q) => `/api/lookup/products${qs({ q, inStock: 1 })}`}
            toOption={productOption}
            placeholder={t('pos.pickProduct')}
            invalid={!!errors.product}
            emptyText={t('pos.noStock')}
            renderOption={(o) => (
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="bidi block truncate font-medium">{o.label}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted">
                    <span className="num rounded bg-tint px-1.5 font-semibold text-brand-ink">{o.data.sku}</span>
                    <span className="bidi truncate">{o.data.typeName}</span>
                  </span>
                </span>
                <span className="num shrink-0 text-end text-caption text-muted">
                  <span className="block">{t('state.RAW')} {fmtKg(o.data.rawKg)}</span>
                  <span className="block">{t('state.FINISHED')} {fmtKg(o.data.finishedKg)}</span>
                </span>
              </span>
            )}
          />
        </Field>
        <Field label={t('common.stockState')} htmlFor={`${id}-state`}>
          <Segmented<State>
            label={t('common.stockState')}
            value={line.state}
            onChange={(s) => onChange({ state: s })}
            options={[
              { value: 'RAW', label: <span>{t('state.RAW')}{p ? <span className="num ms-1 font-normal text-muted">{Number(raw.toFixed(0)).toLocaleString('en-US')}</span> : null}</span> },
              { value: 'FINISHED', label: <span>{t('state.FINISHED')}{p ? <span className="num ms-1 font-normal text-muted">{Number(fin.toFixed(0)).toLocaleString('en-US')}</span> : null}</span> },
            ]}
            className="w-full"
          />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label={t('common.kilo')} htmlFor={`${id}-kg`} error={errors.kg} required className="col-span-2 md:col-span-1">
          <div className="flex gap-2">
            <Input id={`${id}-kg`} numeric value={line.kg} onChange={(e) => onChange({ kg: e.target.value })} placeholder="0.000" invalid={!!errors.kg || over} />
            <button
              type="button"
              onClick={() => onChange({ kg: available.toDecimalPlaces(3).toString() })}
              disabled={!line.product || !available.gt(0)}
              className="h-11 shrink-0 rounded-ctl border border-brand px-3 text-meta font-extrabold tracking-[0.04em] text-brand-ink transition-colors hover:bg-brand hover:text-on-brand disabled:border-line disabled:text-muted disabled:hover:bg-transparent md:h-10"
            >
              {t('common.max')}
            </button>
          </div>
          {line.product ? (
            <div className="mt-1" aria-hidden={!!errors.kg || undefined}>
              <div className="h-1.5 overflow-hidden rounded-full bg-tint">
                <div className={cx('h-full rounded-full transition-[width] duration-200', over ? 'w-full bg-danger' : 'bg-brand')} style={over ? undefined : { width: `${used}%` }} />
              </div>
              {!errors.kg ? <p className={cx('num mt-1 text-caption', over ? 'font-semibold text-danger-ink' : 'text-muted')}>{t('common.available', { kg: fmtKg(available) })}</p> : null}
            </div>
          ) : null}
        </Field>
        <Field label={`${t('common.unitPriceShort')} (${currency})`} htmlFor={`${id}-price`} error={errors.price} required>
          <Input id={`${id}-price`} numeric value={line.price} onChange={(e) => onChange({ price: e.target.value })} placeholder="0.00" invalid={!!errors.price} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-meta font-medium text-ink">{t('pos.lineTotal')}</span>
          <span className="num flex h-11 items-center justify-end rounded-ctl bg-surface-2 px-3 text-body font-bold text-ink md:h-10">{total ? fmtMoney(total, currency) : '—'}</span>
        </div>
      </div>
    </li>
  );
}

function InvoiceReady({ done, onNext }: { done: { id: string; number: string; updated: boolean } | null; onNext: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  if (!done) return null;
  return (
    <Dialog
      open
      onClose={onNext}
      size="sm"
      title={t('pos.invoiceReady', { number: done.number })}
      footer={
        <Button onClick={onNext} icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}>
          {t('pos.newSale')}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-tint text-success">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <p className="text-body text-muted">{done.updated ? t('toast.updated') : t('toast.saleRecorded', { number: done.number })}</p>
        <Badge tone="brand" className="num text-meta">{done.number}</Badge>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button
            variant="secondary"
            busy={busy === 'print'}
            onClick={async () => {
              setBusy('print');
              const r = await printDocument(`/api/docs/txn/${done.id}?format=html`);
              setBusy(null);
              if (!r.ok) toast.error(r.error || t('err.generic'));
            }}
            icon={<Printer className="h-4 w-4" aria-hidden="true" />}
          >
            {t('common.print')}
          </Button>
          <Button
            variant="secondary"
            busy={busy === 'pdf'}
            onClick={async () => {
              setBusy('pdf');
              const r = await downloadFile(`/api/docs/txn/${done.id}?format=pdf`, `${done.number}.pdf`);
              setBusy(null);
              if (!r.ok) toast.error(r.error || t('err.pdf'));
            }}
            icon={<FileDown className="h-4 w-4" aria-hidden="true" />}
          >
            {t('common.downloadPdf')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
