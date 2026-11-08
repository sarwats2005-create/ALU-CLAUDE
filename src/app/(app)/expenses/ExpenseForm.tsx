'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, Clock, Repeat, Save, Tag, Wallet, X } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { localTodayIso } from '@/lib/dates';
import { D, Dec, fmtMoney, parseDec, roundMoney, type Cur } from '@/lib/money';
import type { DictKey } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Button, Card, Field, IconButton, Input, Select, Textarea, Toggle } from '@/components/ui';
import { DateInput } from '@/components/DateInput';
import { EditingBanner } from '@/components/Dialog';
import { NO_SKIPS, SkipDays, type Skips } from './SkipDays';

export type Category = { id: string; name: string; unitEnabled: boolean; unitName: string; used: number };
export type VaultMode = 'ask' | 'USD' | 'IQD';
export type ExpensePayload = {
  date: string;
  /** Local wall-clock time "HH:MM" (one-off expenses only; rules carry a date only). */
  time: string;
  categoryId: string;
  note: string;
  amount?: string;
  unitPrice?: string;
  quantity?: string;
  vault: Cur;
  recurring: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
} & Skips;

/** The device's current local time as "HH:MM" — the value format of <input type="time">. */
function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Record an expense, create a recurring rule, or edit an expense — in reading order: amount (with the
 * currency, which is also the vault that pays), category, date + time, notes, repeat, then the actions.
 * Categories priced per unit take "price per unit × quantity"; everything else (and every rule) a single total.
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
  // Filled on the client after mount (the server's clock and time zone are not the user's).
  const [time, setTime] = useState('');
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
  const [hidden, setHidden] = useState(false);

  useEffect(() => setTime((v) => v || nowHm()), []);

  // Load the expense being edited into the form (and make sure the form is showing).
  useEffect(() => {
    if (!editing) return;
    setHidden(false);
    setCategoryId(editing.categoryId ?? '');
    setDate(editing.date);
    setTime(editing.time ?? '');
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
  const dirty = !!(categoryId || flat || unitPrice || qty || note || recurring);

  function reset() {
    setCategoryId('');
    setFlat('');
    setUnitPrice('');
    setQty('');
    setNote('');
    setDate(localTodayIso());
    setTime(nowHm());
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
    if (Object.keys(er).length) {
      // Take the user straight to the first field that needs attention.
      const first = (['amount', 'unitPrice', 'quantity', 'categoryId', 'date'] as const).find((k) => er[k]);
      const target = { amount: 'exp-amount', unitPrice: 'exp-up', quantity: 'exp-qty', categoryId: 'exp-cat', date: 'exp-date' }[first!];
      document.getElementById(target)?.focus();
      return;
    }
    setBusy(true);
    const res = await onSubmit({
      date,
      time: recurring && !editing ? '' : time,
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
  const title = editing ? t('exp.editTitle') : t('exp.newTitle');
  const askVault = vaultMode === 'ask';
  const showTime = !(recurring && !editing);

  // Collapsed: one quiet bar that opens the form again.
  if (hidden && !editing) {
    return (
      <Card className="mx-auto mb-5 max-w-3xl overflow-hidden">
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-expanded={false}
          className="flex w-full items-center gap-3 px-5 py-4 text-start motion-safe:transition-colors motion-safe:duration-[var(--motion-base)] hover:bg-tint/60 md:px-7"
        >
          <WalletBadge small />
          <span className="flex-1 text-lead font-bold text-ink">{t('exp.newTitle')}</span>
          <ChevronDown className="h-5 w-5 text-muted" aria-hidden="true" />
        </button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mb-5 max-w-3xl overflow-hidden" aria-labelledby="exp-form-title">
      {editing ? <EditingBanner text={t('exp.editing', { number: editing.number })} onCancel={onCancelEdit} cancelLabel={t('exp.cancelEdit')} /> : null}

      {/* A. Header — soft brand-tinted band */}
      <header className="flex items-start gap-4 bg-tint/70 px-5 py-5 md:px-7">
        <WalletBadge />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id="exp-form-title" className="text-title font-bold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-meta text-muted">{t('exp.formSubtitle')}</p>
        </div>
        <IconButton
          label={editing ? t('exp.cancelEdit') : t('exp.hideForm')}
          onClick={() => (editing ? onCancelEdit() : setHidden(true))}
          className="-me-3 -mt-2"
        >
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
        </IconButton>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 pb-5 pt-6 md:px-7 md:pb-6">
        {!categories.length ? (
          <p className="rounded-ctl bg-warning-tint px-4 py-3 text-meta text-warning-ink">
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

        {/* B. Amount — the first and largest field; its currency is also the vault that pays. */}
        {unitOn ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Field label={t('exp.unitPrice', { unit: cat!.unitName })} htmlFor="exp-up" error={errors.unitPrice} required>
              <AmountBox id="exp-up" value={unitPrice} onChange={setUnitPrice} invalid={!!errors.unitPrice} vault={vault} onVault={askVault ? setVault : undefined} />
            </Field>
            <Field label={t('exp.quantity', { unit: cat!.unitName })} htmlFor="exp-qty" error={errors.quantity} required>
              <Input id="exp-qty" numeric value={qty} onChange={(e) => setQty(e.target.value)} invalid={!!errors.quantity} placeholder="0" className="h-[4.5rem] text-[22px] font-semibold" />
            </Field>
          </div>
        ) : (
          <Field
            label={t('exp.amount')}
            htmlFor="exp-amount"
            error={errors.amount}
            required
            hint={askVault ? t('exp.takenFrom', { vault: t(`vault.${vault}`) }) : t('exp.vaultFixed', { vault: t(`vault.${vault}`) })}
          >
            <AmountBox id="exp-amount" value={flat} onChange={setFlat} invalid={!!errors.amount} vault={vault} onVault={askVault ? setVault : undefined} />
          </Field>
        )}

        {/* C. Category — directly beneath Amount, full width. */}
        <Field label={t('exp.category')} htmlFor="exp-cat" error={errors.categoryId} required>
          <div className="relative">
            <Tag className="pointer-events-none absolute start-4 top-1/2 z-[1] h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
            <Select id="exp-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} invalid={!!errors.categoryId} placeholder={t('exp.categoryPick')} className="ps-11">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </Field>

        {/* D. Date + Time — one row on wider screens, stacked on phones. A recurring rule has a start date only. */}
        <div className={cx('grid grid-cols-1 gap-4', showTime && 'sm:grid-cols-2')}>
          <Field
            label={<IconLabel icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}>{t('common.date')}</IconLabel>}
            htmlFor="exp-date"
            error={errors.date}
            required
            hint={recurring && !editing ? t('exp.startHint') : undefined}
          >
            <DateInput id="exp-date" value={date} onChange={setDate} invalid={!!errors.date} />
          </Field>
          {showTime ? (
            <Field label={<IconLabel icon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}>{t('exp.time')}</IconLabel>} htmlFor="exp-time">
              <TimeInput id="exp-time" value={time} onChange={setTime} label={t('exp.time')} />
            </Field>
          ) : null}
        </div>

        {/* E. Notes — optional and quiet. */}
        <Field label={t('common.notes')} htmlFor="exp-note" optionalLabel={t('common.optional')}>
          <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('exp.notePh')} className="min-h-[88px] resize-y" />
        </Field>

        {/* F. Repeat — off by default; its schedule appears only once switched on. */}
        {!editing ? (
          <div className="flex flex-col gap-4 rounded-card bg-surface-2/70 px-4 py-3.5">
            <label className="flex cursor-pointer items-center gap-3 text-body font-semibold text-ink">
              <Toggle checked={recurring} onChange={setRecurring} label={t('exp.recurring')} />
              <span className="min-w-0">
                {t('exp.recurring')}
                <span className="block text-caption font-normal text-muted">{t('exp.recurringHint')}</span>
              </span>
            </label>
            {recurring ? (
              <div className="anim-fade flex flex-col gap-4 border-t border-line-soft pt-4">
                <Field label={t('exp.frequency')} htmlFor="exp-freq" className="sm:max-w-xs">
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

        {/* G. Actions — one strong primary at the end. */}
        <div className="flex flex-col gap-4 border-t border-line-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-meta text-muted" aria-live="polite">
            {t('exp.total')}:{' '}
            <span className={cx('num text-lead font-bold', amount ? 'text-ink' : 'text-muted')}>{amount ? fmtMoney(amount, vault) : '—'}</span>
            {recurring && !editing && amount ? <span className="ms-1">/ {t(`exp.per.${frequency}` as DictKey)}</span> : null}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => (editing ? onCancelEdit() : reset())}
              disabled={!editing && !dirty}
              icon={<X className="h-4 w-4" aria-hidden="true" />}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              busy={busy}
              disabled={!categories.length}
              className="sm:min-w-52"
              icon={recurring && !editing ? <Repeat className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function WalletBadge({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'alu-btn-primary inline-flex shrink-0 items-center justify-center rounded-2xl text-on-brand shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--brand)_70%,transparent)]',
        small ? 'h-10 w-10' : 'h-12 w-12',
      )}
    >
      <Wallet className={small ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2} />
    </span>
  );
}

function IconLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted">{icon}</span>
      {children}
    </span>
  );
}

/**
 * The amount: one tall field with the currency at its start. When the vault is chosen per expense, the
 * currency is a two-way switch (USD vault / IQD vault); when Settings fixes the vault it is a plain label.
 */
function AmountBox({
  id,
  value,
  onChange,
  invalid,
  vault,
  onVault,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  vault: Cur;
  onVault?: (v: Cur) => void;
}) {
  const { t } = useApp();
  return (
    <div
      dir="ltr"
      className={cx(
        'alu-field flex h-[4.5rem] w-full min-w-0 items-center gap-2 rounded-ctl ps-2 pe-4 motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-[var(--motion-base)]',
        'focus-within:border-[color-mix(in_srgb,var(--brand)_55%,var(--line))] focus-within:bg-surface-solid focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_14%,transparent)]',
      )}
      aria-invalid={invalid || undefined}
    >
      {onVault ? (
        <div role="radiogroup" aria-label={t('common.currency')} className="flex shrink-0 gap-0.5 rounded-[10px] bg-surface-2 p-1 ring-1 ring-line-soft">
          {(['USD', 'IQD'] as const).map((c) => {
            const on = c === vault;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t(`vault.${c}`)}
                onClick={() => onVault(c)}
                className={cx(
                  'h-11 min-w-14 rounded-[7px] px-3 text-meta font-bold tracking-wide motion-safe:transition-[background-color,color] motion-safe:duration-[var(--motion-base)]',
                  on ? 'alu-btn-primary text-on-brand' : 'text-muted hover:bg-surface-solid hover:text-ink',
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="inline-flex h-11 shrink-0 items-center rounded-[10px] bg-surface-2 px-3 text-meta font-bold tracking-wide text-muted ring-1 ring-line-soft">{vault}</span>
      )}
      <span className="mx-1 h-8 w-px shrink-0 bg-line" aria-hidden="true" />
      <input
        id={id}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
        className="num h-full min-w-0 flex-1 bg-transparent text-[28px] font-bold leading-none tracking-tight text-ink placeholder:font-semibold placeholder:text-muted/60 focus:outline-none"
      />
    </div>
  );
}

/** Time of day, styled to match DateInput: the native picker opens from the clock button (or the field). */
function TimeInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    try {
      ref.current?.showPicker();
    } catch {
      ref.current?.focus();
    }
  };
  return (
    <div dir="ltr" className="relative">
      <input
        ref={ref}
        id={id}
        type="time"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num h-[var(--ctl-h)] w-full min-w-0 rounded-ctl border-2 border-transparent bg-surface-2 ps-4 pe-14 text-body text-ink motion-safe:transition-colors motion-safe:duration-[var(--motion-base)] focus:border-brand focus:bg-surface focus:outline-none [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <button
        type="button"
        onClick={open}
        aria-label={label}
        tabIndex={-1}
        className="absolute end-1.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-ctl text-muted motion-safe:transition-colors motion-safe:duration-[var(--motion-base)] hover:bg-tint hover:text-ink"
      >
        <Clock className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
