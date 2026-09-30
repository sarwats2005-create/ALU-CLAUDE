// Exact decimal arithmetic shared by server (authoritative) and client (display-only previews).
import Decimal from 'decimal.js';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export type Cur = 'USD' | 'IQD';

type DecLike = string | number | { toString(): string } | null | undefined;

/** Parse anything (number, string, Prisma.Decimal) into an exact decimal. Blank → 0. */
export function D(v: DecLike): Dec {
  if (v === null || v === undefined || v === '') return new Dec(0);
  if (typeof v === 'number') return new Dec(v);
  return new Dec(String(v).trim().replace(/,/g, ''));
}

/** Parse user text into a decimal, or null when it is not a finite number. */
export function parseDec(v: unknown): Dec | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const d = new Dec(s);
  return d.isFinite() ? d : null;
}

/** Final stored money: USD 2 dp, IQD whole dinars. */
export const roundMoney = (v: Dec, cur: Cur): Dec => v.toDecimalPlaces(cur === 'IQD' ? 0 : 2);
export const round2 = (v: Dec): Dec => v.toDecimalPlaces(2);
export const round3 = (v: Dec): Dec => v.toDecimalPlaces(3);
export const round4 = (v: Dec): Dec => v.toDecimalPlaces(4);

/** Convert between currencies at `rate` (1 USD = rate IQD). Not rounded — round only the final stored amount. */
export function convert(amount: Dec, from: Cur, to: Cur, rate: Dec): Dec {
  if (from === to) return amount;
  return from === 'IQD' ? amount.div(rate) : amount.times(rate);
}
export const toUsd = (amount: Dec, cur: Cur, rate: Dec): Dec => convert(amount, cur, 'USD', rate);

const nf = (min: number, max: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF2 = nf(2, 2);
const NF0 = nf(0, 0);
const NF4 = nf(4, 4);
const NFKG = nf(2, 3);

/** "$1,250.00" / "960,000 IQD". Negative → "−$40.00". Always Latin digits, LTR. */
export function fmtMoney(v: DecLike, cur: Cur = 'USD'): string {
  const d = D(v);
  const neg = d.isNegative() && !d.isZero();
  const abs = d.abs();
  if (cur === 'IQD') return `${neg ? '−' : ''}${NF0.format(Number(abs.toDecimalPlaces(0).toString()))} IQD`;
  return `${neg ? '−' : ''}$${NF2.format(Number(abs.toDecimalPlaces(2).toString()))}`;
}

/** Amount without currency sign: "1,250.00" / "960,000". */
export function fmtAmount(v: DecLike, cur: Cur = 'USD'): string {
  const d = D(v);
  const s = cur === 'IQD' ? NF0.format(Number(d.abs().toDecimalPlaces(0).toString())) : NF2.format(Number(d.abs().toDecimalPlaces(2).toString()));
  return (d.isNegative() && !d.isZero() ? '−' : '') + s;
}

export const fmtCost = (v: DecLike): string => `$${NF4.format(Number(D(v).toDecimalPlaces(4).toString()))}`;
const NFP_USD = nf(2, 4);
const NFP_IQD = nf(0, 2);
/** Unit price per kg: USD 2–4 dp, IQD 0–2 dp. */
export function fmtPrice(v: DecLike, cur: Cur = 'USD'): string {
  const n = Number(D(v).toDecimalPlaces(4).toString());
  return cur === 'IQD' ? `${NFP_IQD.format(n)} IQD` : `$${NFP_USD.format(n)}`;
}
export const fmtKg = (v: DecLike): string => `${NFKG.format(Number(D(v).toDecimalPlaces(3).toString()))} kg`;
export const fmtKgPlain = (v: DecLike): string => NF2.format(Number(D(v).toDecimalPlaces(2).toString()));
export const fmtNum = (v: DecLike, dp = 2): string => nf(dp, dp).format(Number(D(v).toDecimalPlaces(dp).toString()));
export const fmtRate = (v: DecLike): string => nf(0, 4).format(Number(D(v).toString()));
export const fmtPct = (v: DecLike): string => `${NF2.format(Number(D(v).toDecimalPlaces(2).toString()))}%`;

/** Decimal → JSON-safe string. */
export const S = (v: DecLike): string => D(v).toString();
