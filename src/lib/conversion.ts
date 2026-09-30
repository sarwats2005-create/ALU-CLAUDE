// "960,000 IQD ÷ 1,480 = $648.65 into USD Vault" — shown live on forms and on saved records/documents.
import { convert, D, fmtMoney, fmtRate, roundMoney, type Cur } from './money';
import { t, type Lang } from './i18n';

export function conversionText(amount: string | number, from: Cur, to: Cur, rate: string | number, direction: 'in' | 'out', lang: Lang): string | null {
  if (from === to) return null;
  const a = D(amount);
  const r = D(rate);
  if (!a.gt(0) || !r.gt(0)) return null;
  const result = roundMoney(convert(a, from, to, r), to);
  const key =
    from === 'IQD' ? (direction === 'in' ? 'pur.conversion' : 'pur.conversionOut') : direction === 'in' ? 'pur.conversionMul' : 'pur.conversionMulOut';
  return t(key, lang, {
    amount: fmtMoney(roundMoney(a, from), from),
    rate: fmtRate(r),
    result: fmtMoney(result, to),
    vault: t(to === 'USD' ? 'vault.USD' : 'vault.IQD', lang),
  });
}
