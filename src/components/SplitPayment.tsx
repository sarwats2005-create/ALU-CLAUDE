'use client';
import { useApp } from '@/lib/client/app-context';
import { convert, D, Dec, fmtMoney, fmtRate, parseDec, roundMoney, toUsd, type Cur } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Field, Input } from './ui';

// Split payment for a sale or purchase: one amount in USD (USD vault) and one in IQD (IQD vault), either
// or both. The IQD part counts toward the invoice at the invoice's rate — e.g. invoice $200, $100 paid in
// USD, rate 100 USD = 157,500 IQD → the rest is 157,500 IQD. The server recomputes all of this.

export type SplitTotals = {
  usd: Dec;
  iqd: Dec;
  /** Both parts together, in the invoice currency. */
  paid: Dec;
  paidUsd: Dec;
  /** What is still unpaid, in the invoice currency (never below 0). */
  rest: Dec;
  restUsd: Dec;
  restIqd: Dec;
};

export function splitTotals(currency: Cur, total: Dec, totalUsd: Dec, rate: string, usdText: string, iqdText: string): SplitTotals {
  const r = D(rate);
  const usd = roundMoney(parseDec(usdText) ?? new Dec(0), 'USD');
  const iqd = roundMoney(parseDec(iqdText) ?? new Dec(0), 'IQD');
  const paid = roundMoney(convert(usd, 'USD', currency, r).plus(convert(iqd, 'IQD', currency, r)), currency);
  const paidUsd = paid.eq(total) ? totalUsd : usd.plus(toUsd(iqd, 'IQD', r)).toDecimalPlaces(2);
  const rest = Dec.max(0, total.minus(paid));
  return { usd, iqd, paid, paidUsd, rest, restUsd: roundMoney(convert(rest, currency, 'USD', r), 'USD'), restIqd: roundMoney(convert(rest, currency, 'IQD', r), 'IQD') };
}

/** Amount of `cur` that pays the rest of the invoice when the other field keeps its value. */
function restIn(cur: Cur, currency: Cur, total: Dec, rate: string, other: Dec): Dec {
  const r = D(rate);
  const otherCur: Cur = cur === 'USD' ? 'IQD' : 'USD';
  const left = Dec.max(0, total.minus(convert(other, otherCur, currency, r)));
  return roundMoney(convert(left, currency, cur, r), cur);
}

export function SplitPayment({
  id,
  currency,
  total,
  rate,
  usd,
  iqd,
  onUsd,
  onIqd,
  errors,
  label,
  out,
}: {
  id: string;
  currency: Cur;
  total: Dec;
  rate: string;
  usd: string;
  iqd: string;
  onUsd: (v: string) => void;
  onIqd: (v: string) => void;
  errors: { paidUsd?: string; paidIqd?: string };
  /** "Cash paid now" / "Cash paid to supplier". */
  label: string;
  /** Money leaves the vaults (purchases) instead of coming in (sales). */
  out?: boolean;
}) {
  const { t } = useApp();
  const totalUsd = toUsd(total, currency, D(rate)).toDecimalPlaces(2);
  const s = splitTotals(currency, total, totalUsd, rate, usd, iqd);
  const has = total.gt(0);
  const fmtIn = (v: Dec) => (v.isZero() ? '' : v.toString());

  const part = (cur: Cur) => {
    const value = cur === 'USD' ? usd : iqd;
    const set = cur === 'USD' ? onUsd : onIqd;
    const other = cur === 'USD' ? s.iqd : s.usd;
    const fill = restIn(cur, currency, total, rate, other);
    const err = cur === 'USD' ? errors.paidUsd : errors.paidIqd;
    return (
      <Field
        key={cur}
        label={t(cur === 'USD' ? 'pay.inUsd' : 'pay.inIqd')}
        htmlFor={`${id}-${cur}`}
        error={err}
        hint={t(out ? 'pay.fromVault' : 'pay.toVault', { vault: t(cur === 'USD' ? 'vault.USD' : 'vault.IQD') })}
        trailing={
          <button
            type="button"
            onClick={() => set(fmtIn(fill))}
            disabled={!has || !fill.gt(0)}
            className="rounded px-1 text-caption font-bold text-brand-ink hover:underline disabled:opacity-40"
          >
            {t('pay.rest')}
          </button>
        }
      >
        <div className="relative">
          <Input id={`${id}-${cur}`} numeric value={value} onChange={(e) => set(e.target.value)} placeholder="0" invalid={!!err} className="pe-14" />
          <span className="input-suffix pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-meta font-semibold text-muted">{cur}</span>
        </div>
      </Field>
    );
  };

  // Show the rate whenever a part is in the other currency than the invoice.
  const crossed = (currency === 'USD' && s.iqd.gt(0)) || (currency === 'IQD' && s.usd.gt(0));
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-meta font-semibold text-ink">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {part('USD')}
        {part('IQD')}
      </div>

      {crossed ? (
        <p className="rounded-ctl bg-tint px-3 py-2 text-caption text-ink">
          {/* Only the amounts are isolated left-to-right, so the sentence reads correctly in Kurdish too. */}
          {t(currency === 'USD' ? 'pay.iqdWorth' : 'pay.usdWorth', { iqd: '\u0001', usd: '\u0002', rate: '\u0003' })
            .split(/([\u0001-\u0003])/)
            .map((part, i) => {
              const r = D(rate);
              const v =
                part === '\u0001'
                  ? fmtMoney(currency === 'USD' ? s.iqd : roundMoney(convert(s.usd, 'USD', 'IQD', r), 'IQD'), 'IQD')
                  : part === '\u0002'
                    ? fmtMoney(currency === 'USD' ? convert(s.iqd, 'IQD', 'USD', r).toDecimalPlaces(2) : s.usd)
                    : part === '\u0003'
                      ? fmtRate(rate)
                      : null;
              return v === null ? part : (
                <bdi key={i} dir="ltr" className="num font-semibold">
                  {v}
                </bdi>
              );
            })}
        </p>
      ) : null}

      {has ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-ctl border border-line-soft bg-line-soft text-meta">
          <div className="bg-surface px-3 py-2">
            <dt className="text-caption text-muted">{t('pay.totalPaid')}</dt>
            <dd className="num font-semibold text-success-ink">{fmtMoney(s.paid, currency)}</dd>
          </div>
          <div className={cx('px-3 py-2', s.rest.gt(0) ? 'bg-danger-tint' : 'bg-surface')}>
            <dt className="text-caption text-muted">{t('pay.remaining')}</dt>
            <dd className={cx('num font-semibold', s.rest.gt(0) ? 'text-danger-ink' : 'text-ink')}>
              {s.rest.gt(0) ? (
                <>
                  <span className="block">{fmtMoney(s.restUsd)}</span>
                  <span className="block text-caption font-medium">= {fmtMoney(s.restIqd, 'IQD')}</span>
                </>
              ) : (
                fmtMoney(0, currency)
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </fieldset>
  );
}
