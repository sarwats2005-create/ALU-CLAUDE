// Recurring-expense date maths, shared by the server scheduler and the form preview. Dates are ISO
// "YYYY-MM-DD" calendar days (no time zone involved).
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type SkipRule = { skipFridays: boolean; skipWeekdays: number[]; skipDates: string[] };

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 0 = Sunday … 5 = Friday … 6 = Saturday */
export const weekdayOf = (iso: string) => {
  const { y, m, d } = parse(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * Next run after `iso`. Monthly rules keep their day of month (`anchorDay`, from the start date) and use the
 * last day of shorter months: a rule started on the 31st runs on 28/29 Feb, then on 31 Mar again.
 */
export function addPeriod(iso: string, frequency: Frequency, anchorDay?: number): string {
  const { y, m, d } = parse(iso);
  if (frequency === 'DAILY' || frequency === 'WEEKLY') {
    const dt = new Date(Date.UTC(y, m - 1, d + (frequency === 'DAILY' ? 1 : 7)));
    return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fmt(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

export function isSkippedDay(iso: string, rule: SkipRule): boolean {
  const dow = weekdayOf(iso);
  if (rule.skipFridays && dow === 5) return true;
  if (rule.skipWeekdays.includes(dow)) return true;
  return rule.skipDates.includes(iso);
}
