import 'server-only';
import type { Currency, StockState } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';
import { D, parseDec, type Dec } from '@/lib/money';
import { isValidIsoDate, isoToDb } from '@/lib/dates';
import type { Validator } from './errors';

export async function getSettings(tx?: Tx) {
  const db = tx ?? prisma;
  const s = await db.appSettings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return db.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function getCompany(tx?: Tx) {
  const db = tx ?? prisma;
  const c = await db.companyProfile.findUnique({ where: { id: 1 } });
  if (c) return c;
  return db.companyProfile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function currentRate(tx?: Tx): Promise<Dec> {
  return D((await getSettings(tx)).exchangeRate);
}

/** Lower-case, trim and collapse whitespace — the uniqueness key for names. */
export const nameKey = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export const cleanText = (v: unknown, max = 500) => (typeof v === 'string' ? v.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, max) : '');
export const cleanMultiline = (v: unknown, max = 2000) =>
  typeof v === 'string' ? v.normalize('NFC').replace(/\r\n/g, '\n').trim().slice(0, max) : '';

export const asCurrency = (v: unknown): Currency | null => (v === 'USD' || v === 'IQD' ? v : null);
export const asState = (v: unknown): StockState | null => (v === 'RAW' || v === 'FINISHED' ? v : null);

/** Field validation helpers that collect errors into a Validator. */
export function reqDate(v: Validator, field: string, value: unknown): Date {
  if (!isValidIsoDate(value)) {
    v.add(field, 'v.date');
    return new Date();
  }
  return isoToDb(value);
}

export function reqPositive(v: Validator, field: string, value: unknown): Dec {
  const d = parseDec(value);
  if (value === undefined || value === null || value === '') v.add(field, 'v.required');
  else if (!d) v.add(field, 'v.number');
  else if (!d.gt(0)) v.add(field, 'v.positive');
  return d ?? D(0);
}

export function reqNonNegative(v: Validator, field: string, value: unknown): Dec {
  if (value === undefined || value === null || value === '') return D(0);
  const d = parseDec(value);
  if (!d) v.add(field, 'v.number');
  else if (d.isNegative()) v.add(field, 'v.nonNegative');
  return d ?? D(0);
}

export function reqCurrency(v: Validator, field: string, value: unknown): Currency {
  const c = asCurrency(value);
  if (!c) v.add(field, 'v.required');
  return c ?? 'USD';
}

export function phone(v: unknown): string {
  const s = cleanText(v, 40);
  return s === '+964' ? '' : s;
}
