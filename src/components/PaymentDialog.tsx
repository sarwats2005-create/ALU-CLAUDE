'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { conversionText } from '@/lib/conversion';
import { balanceLabel } from '@/lib/format';
import { localTodayIso } from '@/lib/dates';
import { D, Dec, parseDec, roundMoney, toUsd, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Dialog, EditingBanner } from './Dialog';
import { Button, Field, Input, Segmented, Textarea } from './ui';
import { DateInput } from './DateInput';
import { useToast } from './Toast';
import { useMoneyGuard } from './MoneyGuard';

export type PaymentKind = 'CUSTOMER_PAYMENT' | 'CUSTOMER_REFUND' | 'BENEFICIARY_PAYMENT' | 'BENEFICIARY_REFUND';

const TITLE: Record<PaymentKind, 'pay.receiveTitle' | 'pay.refundTitle' | 'pay.payBenTitle' | 'pay.benRefundTitle'> = {
  CUSTOMER_PAYMENT: 'pay.receiveTitle',
  CUSTOMER_REFUND: 'pay.refundTitle',
  BENEFICIARY_PAYMENT: 'pay.payBenTitle',
  BENEFICIARY_REFUND: 'pay.benRefundTitle',
};
const SUBMIT: Record<PaymentKind, 'pay.receive' | 'pay.refund' | 'pay.pay' | 'pay.benRefund'> = {
  CUSTOMER_PAYMENT: 'pay.receive',
  CUSTOMER_REFUND: 'pay.refund',
  BENEFICIARY_PAYMENT: 'pay.pay',
  BENEFICIARY_REFUND: 'pay.benRefund',
};
/** Sign of the effect on the party balance (positive = party owes more / factory owes more). */
const SIGN: Record<PaymentKind, 1 | -1> = { CUSTOMER_PAYMENT: -1, CUSTOMER_REFUND: 1, BENEFICIARY_PAYMENT: -1, BENEFICIARY_REFUND: 1 };
/** Cash direction for the vault. */
const DIR: Record<PaymentKind, 'in' | 'out'> = { CUSTOMER_PAYMENT: 'in', CUSTOMER_REFUND: 'out', BENEFICIARY_PAYMENT: 'out', BENEFICIARY_REFUND: 'in' };

/**
 * Receive / refund / pay dialog. Shows the balance now and after, the vault conversion when the
 * currency differs from the vault, and edits an existing payment when `edit` is given.
 */
export function PaymentDialog({
  open,
  onClose,
  kind,
  party,
  balance,
  edit,
}: {
  open: boolean;
  onClose: () => void;
  kind: PaymentKind;
  party: { id: string; name: string };
  balance: string;
  edit?: TxnDetail | null;
}) {
  const { t, lang, rate: liveRate, bump } = useApp();
  const toast = useToast();
  const guard = useMoneyGuard();
  const side = kind.startsWith('CUSTOMER') ? 'customer' : 'beneficiary';
  const [date, setDate] = useState(localTodayIso());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Cur>('USD');
  const [vault, setVault] = useState<Cur>('USD');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (edit) {
      setDate(edit.date);
      setAmount(D(edit.total).toString());
      setCurrency(edit.currency as Cur);
      setVault((edit.vault as Cur) ?? 'USD');
      setNotes(edit.notes);
    } else {
      setDate(localTodayIso());
      const bal = D(balance);
      // Sensible default: settle the full outstanding amount (payments) or the whole credit (refunds).
      const suggest = SIGN[kind] === -1 ? (bal.gt(0) ? bal : null) : bal.isNegative() ? bal.abs() : null;
      setAmount(suggest ? suggest.toDecimalPlaces(2).toString() : '');
      setCurrency('USD');
      setVault('USD');
      setNotes('');
    }
  }, [open, edit, balance, kind]);

  const rate = D(edit ? edit.rate : liveRate);
  const amt = roundMoney(parseDec(amount) ?? new Dec(0), currency);
  const amtUsd = toUsd(amt, currency, rate).toDecimalPlaces(2);
  const oldEffect = edit ? D(edit.totalUsd).times(SIGN[kind]) : new Dec(0);
  const before = D(balance).minus(oldEffect);
  const after = before.plus(amtUsd.times(SIGN[kind]));
  const nowL = balanceLabel(side, before.toString(), lang);
  const afterL = balanceLabel(side, after.toString(), lang);
  const conv = conversionText(amt.toString(), currency, vault, rate.toString(), DIR[kind], lang);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const a = parseDec(amount);
    if (!amount) errs.amount = t('v.required');
    else if (!a) errs.amount = t('v.number');
    else if (!a.gt(0)) errs.amount = t('v.positive');
    if (!date) errs.date = t('v.date');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await guard.send<{ id: string; number: string }>(edit ? `/api/payments/${edit.id}` : '/api/payments', {
      method: edit ? 'PUT' : 'POST',
      body: { kind, partyId: party.id, date, amount, currency, vault, notes },
    });
    setBusy(false);
    if (!res.ok) {
      if (res.code === 'vault.shortCancelled') return;
      setErrors(res.fieldErrors ?? {});
      if (!res.fieldErrors) toast.error(res.error || t(edit ? 'err.update' : 'err.save'));
      return;
    }
    toast.success(edit ? t('toast.updated') : t(SIGN[kind] === -1 ? 'toast.paymentRecorded' : 'toast.refundRecorded', { number: res.data.number }));
    bump();
    onClose();
    if (kind === 'CUSTOMER_PAYMENT' || kind === 'BENEFICIARY_REFUND') guard.afterIncome(vault);
  }

  const tone = (x: 'danger' | 'success' | 'neutral') => (x === 'danger' ? 'text-danger-ink' : x === 'success' ? 'text-success-ink' : 'text-muted');
  const fid = 'pay';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={t(TITLE[kind], { name: party.name })}
      banner={edit ? <EditingBanner text={t('pay.editing', { kind: t(`kind.${kind}`).toUpperCase(), number: edit.number })} /> : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={`${fid}-form`} busy={busy}>
            {edit ? t('common.saveChanges') : t(SUBMIT[kind])}
          </Button>
        </>
      }
    >
      <form id={`${fid}-form`} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className={cx('rounded-ctl px-4 py-3', nowL.tone === 'danger' ? 'bg-danger-tint' : nowL.tone === 'success' ? 'bg-success-tint' : 'bg-tint')}>
          <p className={cx('text-body font-semibold', tone(nowL.tone))}>{t('pay.currentDue', { label: nowL.text })}</p>
        </div>
        {errors.partyId ? <p role="alert" className="text-meta font-medium text-danger-ink">{errors.partyId}</p> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={t('common.amount')} htmlFor={`${fid}-amount`} error={errors.amount} required>
            <div className="relative">
              <Input id={`${fid}-amount`} numeric value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} className="pe-14" data-autofocus />
              <span className="input-suffix pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{currency}</span>
            </div>
          </Field>
          <Field label={t('common.currency')} htmlFor={`${fid}-cur`}>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('common.vault')} htmlFor={`${fid}-vault`} error={errors.vault}>
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
          <Field label={t('common.date')} htmlFor={`${fid}-date`} error={errors.date} required>
            <DateInput id={`${fid}-date`} value={date} onChange={setDate} invalid={!!errors.date} />
          </Field>
        </div>
        {conv ? <p className="num rounded-ctl bg-tint px-3 py-2 text-meta text-ink">{conv}</p> : null}
        <Field label={t('common.notes')} htmlFor={`${fid}-notes`} optionalLabel={t('common.optional')}>
          <Textarea id={`${fid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </Field>
        {amt.gt(0) ? (
          <p className={cx('rounded-ctl border border-line-soft px-4 py-3 text-body font-semibold', tone(afterL.tone))}>{t('pay.afterDue', { label: afterL.text })}</p>
        ) : null}
      </form>
    </Dialog>
  );
}
