// Cell formatting shared by on-screen tables, CSV exports and printed documents, so all three agree.
import { D, fmtAmount, fmtCost, fmtKg, fmtMoney, fmtPct, fmtRate, type Cur } from './money';
import { fmtDate } from './dates';
import { t, hasKey, type DictKey, type Lang } from './i18n';

export type Fmt =
  | 'text'
  | 'money' // USD
  | 'iqd' // IQD
  | 'moneyCur' // amount in row.currency
  | 'amountCur' // amount in row.currency, without currency sign
  | 'signedMoney' // USD with explicit sign
  | 'kg'
  | 'cost'
  | 'int'
  | 'date'
  | 'kind'
  | 'state'
  | 'month'
  | 'pct'
  | 'rate'
  | 'vault'
  | 'cur';

export type Col = { key: string; label: DictKey; fmt?: Fmt; align?: 'start' | 'end' | 'center'; curKey?: string };

/** Numeric formats are right-aligned (end) and always LTR. */
export const isNumericFmt = (f?: Fmt) => !!f && !['text', 'date', 'kind', 'state', 'month', 'vault', 'cur'].includes(f);

export function fmtCell(value: unknown, fmt: Fmt | undefined, lang: Lang, row?: Record<string, unknown>, curKey = 'currency'): string {
  if (value === null || value === undefined || value === '') return fmt && isNumericFmt(fmt) && fmt !== 'int' ? '—' : '';
  const cur = ((row?.[curKey] as Cur) ?? 'USD') as Cur;
  switch (fmt) {
    case 'money':
      return fmtMoney(value as string, 'USD');
    case 'iqd':
      return fmtMoney(value as string, 'IQD');
    case 'moneyCur':
      return fmtMoney(value as string, cur);
    case 'amountCur':
      return fmtAmount(value as string, cur);
    case 'signedMoney': {
      const d = D(value as string);
      return d.isZero() ? fmtMoney(0) : (d.gt(0) ? '+' : '') + fmtMoney(d);
    }
    case 'kg':
      return fmtKg(value as string);
    case 'cost':
      return fmtCost(value as string);
    case 'int':
      return String(value);
    case 'pct':
      return fmtPct(value as string);
    case 'rate':
      return fmtRate(value as string);
    case 'date':
      return fmtDate(String(value));
    case 'month': {
      const m = /^(\d{4})-(\d{2})$/.exec(String(value));
      return m ? `${m[2]}/${m[1]}` : String(value);
    }
    case 'kind': {
      const k = `kind.${value}`;
      return hasKey(k) ? t(k, lang) : String(value);
    }
    case 'state': {
      const k = `state.${value}`;
      return hasKey(k) ? t(k, lang) : String(value);
    }
    case 'vault': {
      const k = `vault.${value}`;
      return hasKey(k) ? t(k, lang) : String(value);
    }
    case 'cur': {
      const k = `cur.${value}`;
      return hasKey(k) ? t(k, lang) : String(value);
    }
    default:
      return String(value);
  }
}

/** Balance label with the exact wording required everywhere a balance appears. */
export function balanceLabel(side: 'customer' | 'beneficiary', balance: string | number, lang: Lang): { text: string; tone: 'danger' | 'success' | 'neutral'; short: string } {
  const d = D(balance).toDecimalPlaces(2);
  const x = fmtMoney(d.abs());
  if (d.isZero()) return { text: t('due.settled', lang), tone: 'neutral', short: t('due.settled', lang) };
  if (side === 'customer') {
    return d.gt(0)
      ? { text: t('due.customerOwesX', lang, { x }), tone: 'danger', short: t('due.customerOwes', lang) }
      : { text: t('due.customerCreditX', lang, { x }), tone: 'success', short: t('due.customerCredit', lang) };
  }
  return d.gt(0)
    ? { text: t('due.factoryOwesX', lang, { x }), tone: 'danger', short: t('due.factoryOwes', lang) }
    : { text: t('due.beneficiaryOwesX', lang, { x }), tone: 'success', short: t('due.beneficiaryOwes', lang) };
}
