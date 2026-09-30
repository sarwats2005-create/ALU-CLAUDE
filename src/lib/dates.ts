// Business dates are calendar days (no time). They travel as "YYYY-MM-DD" and display as DD/MM/YYYY.
export const BUSINESS_TZ = 'Asia/Baghdad';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Today's date in the factory's timezone, as YYYY-MM-DD. */
export function todayIso(tz = BUSINESS_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Local (browser) today — used for form defaults on the client. */
export function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const isoToDb = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

export function dbToIso(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function fmtDate(s: string | Date | null | undefined): string {
  const iso = typeof s === 'string' ? s.slice(0, 10) : dbToIso(s);
  const m = ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** DD/MM/YYYY → YYYY-MM-DD (or null) */
export function parseDmy(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** Timestamp → "DD/MM/YYYY HH:MM" in the factory timezone. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d) : d;
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(x);
  const g = (t: string) => p.find((q) => q.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addDaysIso(iso: string, n: number): string {
  const d = isoToDb(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dbToIso(d);
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((isoToDb(bIso).getTime() - isoToDb(aIso).getTime()) / 86400000);
}

/** Last `n` month keys ending with the month of `endIso`, oldest first. */
export function lastMonths(endIso: string, n: number): string[] {
  const y = Number(endIso.slice(0, 4));
  const m = Number(endIso.slice(5, 7));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}
