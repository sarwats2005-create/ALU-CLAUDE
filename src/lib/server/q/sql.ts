import 'server-only';
import { Prisma, type TxnKind } from '@prisma/client';
import { dict } from '@/lib/i18n/dict';
import { parseDmy, isValidIsoDate } from '@/lib/dates';

export const sql = Prisma.sql;
export const join = Prisma.join;
export const empty = Prisma.empty;
export type Sql = Prisma.Sql;

export const ALL_KINDS: TxnKind[] = [
  'SALE',
  'PURCHASE',
  'CUSTOMER_PAYMENT',
  'CUSTOMER_REFUND',
  'BENEFICIARY_PAYMENT',
  'BENEFICIARY_REFUND',
  'VAULT_DEPOSIT',
  'VAULT_WITHDRAWAL',
  'VAULT_TRANSFER',
  'PROCESSING',
];

export const isKind = (v: unknown): v is TxnKind => typeof v === 'string' && (ALL_KINDS as string[]).includes(v);

/** AND-join fragments (ignoring empties). */
export function where(parts: (Sql | null | undefined | false)[]): Sql {
  const ps = parts.filter(Boolean) as Sql[];
  return ps.length ? sql`WHERE ${join(ps, ' AND ')}` : empty;
}

export const like = (q: string) => `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
export const prefix = (q: string) => `${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;

/** Kinds whose English or Kurdish label contains the query — lets people search by "sale", "payment", "فرۆشتن"… */
export function kindsMatching(q: string): TxnKind[] {
  const s = q.toLocaleLowerCase();
  return ALL_KINDS.filter((k) => {
    const e = dict[`kind.${k}` as keyof typeof dict] as readonly [string, string];
    return e[0].toLocaleLowerCase().includes(s) || e[1].includes(q);
  });
}

/** A search term that looks like a date (DD/MM/YYYY, DD/MM, YYYY-MM-DD) → ISO fragments usable in a LIKE. */
export function dateLike(q: string): string | null {
  const full = parseDmy(q);
  if (full) return full;
  if (isValidIsoDate(q)) return q;
  const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(q);
  if (dm) return `%-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  return null;
}

/** A search term that looks like a number (kg, price, total) → normalized numeric string. */
export function numberLike(q: string): string | null {
  const s = q.replace(/[,$\s]/g, '').replace(/kg$/i, '').replace(/iqd$/i, '');
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

export const n = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0));
export const s = (v: unknown): string => (v === null || v === undefined ? '0' : String(v));
