'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Repeat, Save, Wallet } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { localTodayIso } from '@/lib/dates';
import { D, Dec, fmtMoney, parseDec, roundMoney, type Cur } from '@/lib/money';
import type { DictKey } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Button, Card, Field, Input, Segmented, Select, Textarea, Toggle } from '@/components/ui';
import { DateInput } from '@/components/DateInput';
import { EditingBanner } from '@/components/Dialog';
import { NO_SKIPS, SkipDays, type Skips } from './SkipDays';

export type Category = { id: string; name: string; unitEnabled: boolean; unitName: string; used: number };
export type VaultMode = 'ask' | 'USD' | 'IQD';
export type ExpensePayload = {
  date: string;
  categoryId: string;
  note: string;
  amount?: string;
  unitPrice?: string;
  quantity?: string;
  vault: Cur;
  recurring: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
} & Skips;

/**
 * Record an expense, create a recurring rule, or edit an expense. Categories priced per unit show
 * "price per unit × quantity"; everything else (and every recurring rule) takes a single total.
 */
export function ExpenseForm({
  categories,
  vaultMode,
  editing,
  onCancelEdit,
  onSubmit,
}: {
  categories: Category[];
  vaultMode: VaultMode;
  editing: TxnDetail | null;
  onCancelEdit: () => void;
  onSubmit: (p: ExpensePayload) => Promise<{ ok: boolean; fieldErrors?: Record<string, string> }>;
}) {
  const { t, can } = useApp();
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(localTodayIso());
  const [flat, setFlat] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [vault, setVault] = useState<Cur>(vaultMode === 'IQD' ? 'IQD' : 'USD');
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<ExpensePayload['frequency']>('MONTHLY');
  const [skips, setSkips] = useState<Skips>(NO_SKIPS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Load the expense being edited into the form.
  useEffect(() => {
    if (!editing) return;
    setCategoryId(editing.categoryId ?? '');
    setDate(editing.date);
    setVault((editing.vault ?? editing.currency) as Cur);
    setNote(editing.notes);
    setRecurring(false);
    if (editing.unitPrice && editing.quantity) {
      setUnitPrice(D(editing.unitPrice).toString());
      setQty(D(editing.quantity).toString());
      setFlat(D(editing.total).toString());
    } else {
      setFlat(D(editing.total).toString());
      setUnitPrice('');
      setQty('');
    }
    setErrors({});
  }, [editing]);

  useEffect(() => {
    if (vaultMode !== 'ask') setVault(vaultMode);
  }, [vaultMode]);

  const cat = categories.find((c) => c.id === categoryId);
  const unitOn = !!cat?.unitEnabled && !recurring;
  const amount: Dec | null = unitOn
    ? parseDec(unitPrice) && parseDec(qty)
      ? roundMoney(parseDec(unitPrice)!.times(parseDec(qty)!), vault)
      : null
    : parseDec(flat)
      ? roundMoney(parseDec(flat)!, vault)
      : null;

  function reset() {
    setFlat('');
    setUnitPrice('');
    setQty('');
    setNote('');
    setDate(localTodayIso());
    setRecurring(false);
    setFrequency('MONTHLY');
    setSkips(NO_SKIPS);
    setErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!categoryId) er.categoryId = t('exp.categoryRequired');
    if (!date) er.date = t('v.date');
    if (unitOn) {
      if (!parseDec(unitPrice)?.gt(0)) er.unitPrice = t('v.positive');
      if (!parseDec(qty)?.gt(0)) er.quantity = t('v.positive');
    } else if (!amount || !amount.gt(0)) er.amount = t('v.positive');
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const res = await onSubmit({
      date,
      categoryId,
      note,
      ...(unitOn ? { unitPrice, quantity: qty } : { amount: flat }),
      vault,
      recurring: !editing && recurring,
      frequency,
      ...(recurring && !editing ? skips : NO_SKIPS),
    });
    setBusy(false);
    if (res.ok) {
      if (!editing) reset();
    } else if (res.fieldErrors) setErrors(res.fieldErrors);
  }

  const submitLabel = editing ? t('exp.update') : recurring ? t('exp.createRule') : t('exp.record');

  return (
    <Card className="mb-5 overflow-hidden" aria-labelledby="exp-form-title">
      {editing ? <EditingBanner text={t('exp.editing', { number: editing.number })} onCancel={onCancelEdit} cancelLabel={t('exp.cancelEdit')} /> : null}
      <form onSubmit={submit} noValidate className="p-5 md:p-6">
        <h2 id="exp-form-title" className="mb-4 text-title font-semibold text-ink">
          {editing ? t('exp.editTitle') : t('exp.newTitle')}
        </h2>

        {!categories.length ? (
          <p className="mb-4 rounded-ctl bg-warning-tint px-4 py-3 text-meta text-warning-ink">
            {can('settings') ? (
              <>
                {t('exp.noCategories')}{' '}
                <Link href="/settings?section=expenses" className="font-semibold underline underline-offset-2">
                  {t('exp.openSettings')}
                </Link>
              </>
            ) : (
              t('exp.noCategoriesStaff')
            )}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t('exp.category')} htmlFor="exp-cat" error={errors.categoryId} required>
            <Select id="exp-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} invalid={!!errors.categoryId}>
              <option value="">{t('exp.categoryPick')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.date')} htmlFor="exp-date" error={errors.date} required hint={recurring && !editing ? t('exp.startHint') : undefined}>
            <DateInput id="exp-date" value={date} onChange={setDate} invalid={!!errors.date} />
          </Field>

          {unitOn ? (
            <>
              <Field label={t('exp.unitPrice', { unit: cat!.unitName })} htmlFor="exp-up" error={errors.unitPrice} required>
                <Input id="exp-up" numeric value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} invalid={!!errors.unitPrice} />
              </Field>
              <Field label={t('exp.quantity', { unit: cat!.unitName })} htmlFor="exp-qty" error={errors.quantity} required>
                <Input id="exp-qty" numeric value={qty} onChange={(e) => setQty(e.target.value)} invalid={!!errors.quantity} />
              </Field>
            </>
          ) : (
            <Field label={t('exp.amount')} htmlFor="exp-amount" error={errors.amount} required className="xl:col-span-2">
              <div className="relative">
                <Input id="exp-amount" numeric value={flat} onChange={(e) => setFlat(e.target.value)} invalid={!!errors.amount} className="pe-14" />
                <span className="input-suffix pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{vault}</span>
              </div>
            </Field>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('exp.vault')} htmlFor="exp-vault" error={errors.vault} required={vaultMode === 'ask'}>
            {vaultMode === 'ask' ? (
              <Segmented<Cur>
                label={t('exp.vault')}
                value={vault}
                onChange={setVault}
                options={[
                  { value: 'USD', label: t('vault.USD') },
                  { value: 'IQD', label: t('vault.IQD') },
                ]}
                className="w-full"
              />
            ) : (
              <p id="exp-vault" className="flex h-11 items-center gap-2 rounded-ctl bg-tint px-3 text-body text-ink md:h-10">
                <Wallet className="h-4 w-4 text-brand-ink" aria-hidden="true" />
                {t('exp.vaultFixed', { vault: t(`vault.${vault}`) })}
              </p>
            )}
          </Field>
          <Field label={t('common.notes')} htmlFor="exp-note" optionalLabel={t('common.optional')}>
            <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={1} maxLength={500} className="min-h-11 md:min-h-10" />
          </Field>
        </div>

        {!editing ? (
          <div className="mt-5 flex flex-col gap-4 border-t border-line-soft pt-5">
            <label className="flex items-center gap-3 text-body font-medium text-ink">
              <Toggle checked={recurring} onChange={setRecurring} label={t('exp.recurring')} />
              <span>
                {t('exp.recurring')}
                <span className="block text-caption font-normal text-muted">{t('exp.recurringHint')}</span>
              </span>
            </label>
            {recurring ? (
              <div className="flex flex-col gap-4">
                <Field label={t('exp.frequency')} htmlFor="exp-freq" className="max-w-xs">
                  <Select id="exp-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as ExpensePayload['frequency'])}>
                    {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map((f) => (
                      <option key={f} value={f}>
                        {t(`exp.freq.${f}` as DictKey)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SkipDays value={skips} onChange={setSkips} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted">
            {t('exp.total')}:{' '}
            <span className={cx('num text-lead font-bold', amount ? 'text-ink' : 'text-muted')}>{amount ? fmtMoney(amount, vault) : '—'}</span>
            {recurring && !editing && amount ? <span className="ms-1 text-meta">/ {t(`exp.per.${frequency}` as DictKey)}</span> : null}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {editing ? (
              <Button variant="secondary" onClick={onCancelEdit}>
                {t('common.cancel')}
              </Button>
            ) : null}
            <Button type="submit" busy={busy} disabled={!categories.length} icon={recurring && !editing ? <Repeat className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
