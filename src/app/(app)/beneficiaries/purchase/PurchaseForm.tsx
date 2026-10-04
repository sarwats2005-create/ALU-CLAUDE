'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, PackagePlus, Plus } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import type { lookupProducts } from '@/lib/server/q/inventory';
import { useApp } from '@/lib/client/app-context';
import { api, qs } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { conversionText } from '@/lib/conversion';
import { balanceLabel } from '@/lib/format';
import { localTodayIso } from '@/lib/dates';
import { D, Dec, fmtKg, fmtMoney, parseDec, roundMoney, toUsd, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import { Combobox, type Option } from '@/components/Combobox';
import { DateInput } from '@/components/DateInput';
import { Dialog, EditingBanner } from '@/components/Dialog';
import { PartyFormDialog } from '@/components/PartyForm';
import { useToast } from '@/components/Toast';
import { useMoneyGuard } from '@/components/MoneyGuard';
import { StepLabel } from '@/components/Summary';
import { useInvoiceAutoSave } from '@/components/useInvoiceAutoSave';

type Product = Awaited<ReturnType<typeof lookupProducts>>[number];
type Ben = { id: string; name: string; phone: string; balance: string };
type Type = { id: string; name: string };
type State = 'RAW' | 'FINISHED';

const benOption = (b: Ben): Option<Ben> => ({ id: b.id, label: b.name, data: b });
const productOption = (p: Product): Option<Product> => ({ id: p.id, label: p.name, data: p });

export function PurchaseForm({ edit, beneficiaryId, productId }: { edit: TxnDetail | null; beneficiaryId: string | null; productId: string | null }) {
  const { t, lang, rate: liveRate, bump } = useApp();
  const toast = useToast();
  const saveToFolder = useInvoiceAutoSave();
  const router = useRouter();
  const line = edit?.lines[0];
  const [ben, setBen] = useState<Option<Ben> | null>(null);
  const [date, setDate] = useState(edit?.date ?? localTodayIso());
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  // Restocking is the usual case; only a brand-new factory (no products yet) starts on "create".
  useEffect(() => {
    if (edit || productId) return;
    void api<Product[]>('/api/lookup/products').then((r) => {
      if (r.ok && !r.data.length) setMode('new');
    });
  }, [edit, productId]);
  const [product, setProduct] = useState<Option<Product> | null>(null);
  const [npName, setNpName] = useState('');
  const [npSku, setNpSku] = useState('');
  const [npType, setNpType] = useState('');
  const [state, setState] = useState<State>((line?.state as State) ?? 'RAW');
  const [kg, setKg] = useState(line ? D(line.kg).toString() : '');
  const [price, setPrice] = useState(line ? D(line.unitPrice).toString() : '');
  const [currency, setCurrency] = useState<Cur>((edit?.currency as Cur) ?? 'USD');
  const [vault, setVault] = useState<Cur>((edit?.vault as Cur) ?? 'USD');
  const [cash, setCash] = useState(edit ? D(edit.cashPaid).toString() : '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const guard = useMoneyGuard();
  const [addBen, setAddBen] = useState<string | null>(null);
  const [addType, setAddType] = useState<string | null>(null);
  const types = useRemote<Type[]>('/api/lookup/types');

  useEffect(() => {
    const bid = edit?.beneficiary?.id ?? beneficiaryId;
    if (bid)
      api<Ben[]>(`/api/lookup/beneficiaries${qs({ ids: bid })}`).then((r) => {
        if (r.ok && r.data[0]) setBen(benOption(r.data[0]));
      });
    const pid = line?.productId ?? productId;
    if (pid)
      api<Product[]>(`/api/lookup/products${qs({ ids: pid })}`).then((r) => {
        if (r.ok && r.data[0]) setProduct(productOption(r.data[0]));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rate = D(edit ? edit.rate : liveRate);
  const kgD = parseDec(kg);
  const priceD = parseDec(price);
  const total = kgD && priceD && kgD.gt(0) && priceD.gt(0) ? roundMoney(kgD.times(priceD), currency) : new Dec(0);
  const cashD = roundMoney(parseDec(cash) ?? new Dec(0), currency);
  const totalUsd = toUsd(total, currency, rate).toDecimalPlaces(2);
  const cashUsd = toUsd(cashD, currency, rate).toDecimalPlaces(2);
  const oldEffect = edit && ben && edit.beneficiary?.id === ben.id ? D(edit.totalUsd).minus(D(edit.cashPaidUsd)) : new Dec(0);
  const before = ben ? D(ben.data.balance).minus(oldEffect) : null;
  const after = before ? before.plus(totalUsd).minus(cashUsd) : null;
  const conv = conversionText(cashD.toString(), currency, vault, rate.toString(), 'out', lang);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!ben) er.beneficiaryId = t('v.beneficiaryRequired');
    if (!date) er.date = t('v.date');
    if (mode === 'existing' && !product) er.productId = t('v.productRequired');
    if (mode === 'new') {
      if (!npName.trim()) er['newProduct.name'] = t('v.required');
      if (!npSku.trim()) er['newProduct.sku'] = t('v.required');
      if (!npType) er['newProduct.typeId'] = t('v.typeRequired');
    }
    if (!kg) er.kg = t('v.required');
    else if (!kgD) er.kg = t('v.number');
    else if (!kgD.gt(0)) er.kg = t('v.positive');
    if (!price) er.unitPrice = t('v.required');
    else if (!priceD) er.unitPrice = t('v.number');
    else if (!priceD.gt(0)) er.unitPrice = t('v.positive');
    if (cash && !parseDec(cash)) er.cashPaid = t('v.number');
    setErrors(er);
    if (Object.keys(er).length) {
      toast.error(t('err.fixFields'));
      return;
    }
    setBusy(true);
    const res = await guard.send<{ id: string; number: string }>(edit ? `/api/purchases/${edit.id}` : '/api/purchases', {
      method: edit ? 'PUT' : 'POST',
      body: {
        date,
        beneficiaryId: ben!.id,
        ...(mode === 'existing' ? { productId: product!.id } : { newProduct: { name: npName, sku: npSku, typeId: npType } }),
        state,
        kg,
        unitPrice: price,
        currency,
        vault,
        cashPaid: cash || '0',
        notes,
        clientTotal: total.toString(),
      },
    });
    setBusy(false);
    if (!res.ok) {
      if (res.code === 'vault.shortCancelled') return;
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error || t(edit ? 'err.update' : 'err.save'));
      return;
    }
    bump();
    toast.success(edit ? t('toast.updated') : `${t('toast.purchaseRecorded')} ${res.data.number}`);
    saveToFolder(res.data.id, res.data.number);
    router.push(`/beneficiaries/${ben!.id}`);
  }

  async function createType(name: string) {
    const res = await api<Type>('/api/types', { method: 'POST', body: { name } });
    setAddType(null);
    if (!res.ok) return toast.error(res.fieldErrors?.name ?? res.error);
    types.reload();
    setNpType(res.data.id);
  }

  const beforeL = before ? balanceLabel('beneficiary', before.toString(), lang) : null;
  const afterL = after ? balanceLabel('beneficiary', after.toString(), lang) : null;
  const toneCls = (x?: string) => (x === 'danger' ? 'text-danger-ink' : x === 'success' ? 'text-success-ink' : 'text-muted');

  return (
    <div>
      <Link href={ben ? `/beneficiaries/${ben.id}` : '/beneficiaries'} className="mb-3 inline-flex items-center gap-1.5 rounded text-meta font-semibold text-brand-ink hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {ben ? ben.label : t('ben.title')}
      </Link>
      <PageHeader title={edit ? t('pur.editing', { number: edit.number }) : t('pur.title')} />
      {edit ? (
        <div className="-mt-2 mb-5 overflow-hidden rounded-card">
          <EditingBanner text={t('pur.editing', { number: edit.number })} />
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section>
          <StepLabel n={1}>{t('pur.step1')}</StepLabel>
          <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label={t('pur.beneficiary')} htmlFor="pur-ben" error={errors.beneficiaryId} required>
              <Combobox<Ben>
                id="pur-ben"
                value={ben}
                onChange={setBen}
                source={(q) => `/api/lookup/beneficiaries${qs({ q })}`}
                toOption={benOption}
                placeholder={t('cust.searchPh')}
                invalid={!!errors.beneficiaryId}
                onCreate={(name) => setAddBen(name)}
              />
            </Field>
            <Field label={t('common.date')} htmlFor="pur-date" error={errors.date} required>
              <DateInput id="pur-date" value={date} onChange={setDate} invalid={!!errors.date} />
            </Field>
          </Card>
          </section>

          <section>
          <StepLabel n={2}>{t('pur.product')}</StepLabel>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!edit ? (
                <Segmented<'existing' | 'new'>
                  label={t('pur.product')}
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'existing', label: t('pur.existingProduct') },
                    { value: 'new', label: t('pur.newProduct') },
                  ]}
                />
              ) : null}
            </div>
            {mode === 'existing' ? (
              <Field label={t('common.product')} htmlFor="pur-product" error={errors.productId} required>
                <Combobox<Product>
                  id="pur-product"
                  value={product}
                  onChange={setProduct}
                  source={(q) => `/api/lookup/products${qs({ q })}`}
                  toOption={productOption}
                  placeholder={t('inv.searchPh')}
                  invalid={!!errors.productId}
                  renderOption={(o) => (
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="bidi block truncate font-medium">{o.label}</span>
                        <span className="num text-caption text-muted">
                          {o.data.sku} · {o.data.typeName}
                        </span>
                      </span>
                      <span className="num shrink-0 text-caption text-muted">{fmtKg(D(o.data.rawKg).plus(D(o.data.finishedKg)))}</span>
                    </span>
                  )}
                />
              </Field>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label={t('pur.productName')} htmlFor="pur-np-name" error={errors['newProduct.name']} required className="sm:col-span-2">
                  <Input id="pur-np-name" value={npName} onChange={(e) => setNpName(e.target.value)} invalid={!!errors['newProduct.name']} maxLength={120} />
                </Field>
                <Field label={t('common.sku')} htmlFor="pur-np-sku" error={errors['newProduct.sku']} required>
                  <Input id="pur-np-sku" dir="ltr" value={npSku} onChange={(e) => setNpSku(e.target.value.toUpperCase())} invalid={!!errors['newProduct.sku']} maxLength={60} className="num uppercase" />
                </Field>
                <Field
                  label={t('common.aluminumType')}
                  htmlFor="pur-np-type"
                  error={errors['newProduct.typeId']}
                  required
                  trailing={
                    <button type="button" onClick={() => setAddType('')} className="inline-flex items-center gap-1 rounded px-1 text-caption font-bold text-brand-ink hover:underline">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('pur.addType')}
                    </button>
                  }
                >
                  <Select id="pur-np-type" value={npType} onChange={(e) => setNpType(e.target.value)} invalid={!!errors['newProduct.typeId']}>
                    <option value="">{t('common.select')}</option>
                    {(types.data ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <Field label={t('pur.stateReceived')} htmlFor="pur-state">
              <Segmented<State>
                label={t('pur.stateReceived')}
                value={state}
                onChange={setState}
                options={[
                  { value: 'RAW', label: t('state.RAW') },
                  { value: 'FINISHED', label: t('state.FINISHED') },
                ]}
                className="w-full sm:w-72"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Field label={t('common.kilo')} htmlFor="pur-kg" error={errors.kg} required>
                <Input id="pur-kg" numeric value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0.000" invalid={!!errors.kg} />
              </Field>
              <Field label={`${t('common.unitPrice')} (${currency})`} htmlFor="pur-price" error={errors.unitPrice} required>
                <Input id="pur-price" numeric value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" invalid={!!errors.unitPrice} />
              </Field>
              <Field label={t('common.currency')} htmlFor="pur-cur">
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
                  className="w-full sm:w-[140px]"
                />
              </Field>
            </div>
          </Card>
          </section>

          {noteOpen || notes ? (
            <Card className="p-5">
              <Field label={t('common.notes')} htmlFor="pur-notes" optionalLabel={t('common.optional')}>
                <Textarea id="pur-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} autoFocus={noteOpen && !notes} />
              </Field>
            </Card>
          ) : (
            <Button variant="ghost" className="self-start" onClick={() => setNoteOpen(true)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              {t('common.addNote')}
            </Button>
          )}
        </div>

        <aside className="lg:sticky lg:top-6">
          <StepLabel n={3}>{t('pos.payment')}</StepLabel>
          <Card className="overflow-hidden">
            <div className="border-b border-line-soft bg-surface-2 px-5 pb-4 pt-4">
              <p className="text-meta font-medium text-muted">{t('common.total')}</p>
              <p className="fig mt-1 text-figure font-bold text-ink">{fmtMoney(total, currency)}</p>
              {kgD && kgD.gt(0) ? <p className="num mt-1 text-meta text-muted">{fmtKg(kgD)} × {price || '0'} {currency}</p> : null}
            </div>
            <div className="flex flex-col gap-4 p-5">
              <Field label={t('common.vault')} htmlFor="pur-vault">
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
                label={t('common.cashPaid')}
                htmlFor="pur-cash"
                error={errors.cashPaid}
                trailing={
                  <button type="button" onClick={() => setCash(total.toString())} disabled={!total.gt(0)} className="rounded px-1 text-caption font-bold text-brand-ink hover:underline disabled:opacity-40">
                    {t('pos.payFull')}
                  </button>
                }
              >
                <div className="relative">
                  <Input id="pur-cash" numeric value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" invalid={!!errors.cashPaid} className="pe-14" />
                  <span className="input-suffix pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{currency}</span>
                </div>
              </Field>
              {conv ? <p className="num rounded-ctl bg-tint px-3 py-2 text-caption text-ink">{conv}</p> : null}
              <div className="rounded-ctl border border-line-soft">
                <p className="border-b border-line-soft px-3 py-2 text-caption font-semibold text-muted">{t('pur.balanceEffect')}</p>
                {beforeL && afterL ? (
                  <dl className="text-meta">
                    <div className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="text-muted">{t('pos.prevBalance')}</dt>
                      <dd className={cx('text-end font-semibold', toneCls(beforeL.tone))}>{beforeL.text}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3 bg-surface-2 px-3 py-2">
                      <dt className="font-semibold text-ink">{t('pos.newBalance')}</dt>
                      <dd className={cx('text-end font-bold', toneCls(afterL.tone))}>{afterL.text}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="px-3 py-3 text-meta text-muted">{t('v.beneficiaryRequired')}</p>
                )}
              </div>
              <Button type="submit" size="lg" block busy={busy} icon={<PackagePlus className="h-5 w-5" aria-hidden="true" />}>
                {edit ? t('common.saveChanges') : t('pur.submit')}
              </Button>
            </div>
          </Card>
        </aside>
      </form>

      <PartyFormDialog
        kind="beneficiary"
        open={addBen !== null}
        onClose={() => setAddBen(null)}
        initial={addBen !== null ? { name: addBen, phone: '', address: '' } : null}
        onSaved={(p) => setBen(benOption({ id: p.id, name: p.name, phone: p.phone ?? '', balance: '0' }))}
      />
      <TypeDialog value={addType} onClose={() => setAddType(null)} onCreate={createType} />
    </div>
  );
}

function TypeDialog({ value, onClose, onCreate }: { value: string | null; onClose: () => void; onCreate: (name: string) => void }) {
  const { t } = useApp();
  const [name, setName] = useState('');
  useEffect(() => setName(value ?? ''), [value]);
  return (
    <Dialog
      open={value !== null}
      onClose={onClose}
      size="sm"
      title={t('pur.addType')}
      description={name.trim() ? t('pur.addTypeConfirm', { name: name.trim() }) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()}>
            {t('pur.addType')}
          </Button>
        </>
      }
    >
      <Field label={t('set.typeName')} htmlFor="new-type-name" required>
        <Input id="new-type-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), name.trim() && onCreate(name.trim()))} />
      </Field>
    </Dialog>
  );
}
