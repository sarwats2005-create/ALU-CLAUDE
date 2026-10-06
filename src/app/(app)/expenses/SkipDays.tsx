'use client';
import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { fmtDate } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { Button, Toggle } from '@/components/ui';
import { DateInput } from '@/components/DateInput';

export type Skips = { skipFridays: boolean; skipWeekdays: number[]; skipDates: string[] };
export const NO_SKIPS: Skips = { skipFridays: false, skipWeekdays: [], skipDates: [] };
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Days a recurring rule must not post on. The scheduler moves past them to the next allowed day. */
export function SkipDays({ value, onChange }: { value: Skips; onChange: (v: Skips) => void }) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [pick, setPick] = useState('');
  const open = expanded || value.skipFridays || value.skipWeekdays.length > 0 || value.skipDates.length > 0;

  const toggleDay = (d: number) => {
    if (d === 5 && value.skipFridays) return;
    const has = value.skipWeekdays.includes(d);
    onChange({ ...value, skipWeekdays: has ? value.skipWeekdays.filter((x) => x !== d) : [...value.skipWeekdays, d].sort() });
  };
  const addDate = () => {
    if (!pick || value.skipDates.includes(pick)) return setPick('');
    onChange({ ...value, skipDates: [...value.skipDates, pick].sort() });
    setPick('');
  };

  return (
    <div className="rounded-ctl bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-body font-medium text-ink">
          <Toggle checked={value.skipFridays} onChange={(v) => onChange({ ...value, skipFridays: v })} label={t('exp.skipFridays')} />
          {t('exp.skipFridays')}
        </label>
        <button
          type="button"
          onClick={() => setExpanded(!open)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-ctl px-2 py-1 text-meta font-semibold text-brand-ink hover:bg-tint"
        >
          {open ? t('exp.lessOptions') : t('exp.moreOptions')}
          <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="mt-4 flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-meta font-medium text-ink">{t('exp.skipWeekdays')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const fri = d === 5 && value.skipFridays;
                const on = fri || value.skipWeekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-disabled={fri || undefined}
                    onClick={() => toggleDay(d)}
                    className={cx(
                      'h-14 min-w-[4rem] rounded-ctl px-4 text-meta font-bold transition-all duration-200 hover:scale-105 active:scale-100 disabled:hover:scale-100',
                      on ? 'bg-warning text-ink' : 'bg-surface-2 text-muted hover:text-ink',
                      fri && 'cursor-default',
                    )}
                  >
                    {t(`day.${d}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p className="mb-2 text-meta font-medium text-ink">{t('exp.skipDates')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <DateInput id="skip-date" value={pick} onChange={setPick} label={t('exp.skipDates')} className="w-44" />
              <Button size="sm" variant="secondary" onClick={addDate} disabled={!pick} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                {t('exp.addDate')}
              </Button>
            </div>
            {value.skipDates.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {value.skipDates.map((d) => (
                  <li key={d}>
                    <span className="inline-flex h-14 items-center gap-1 rounded-full bg-warning-tint ps-3 pe-1 text-meta font-semibold text-warning-ink">
                      <span className="num">{fmtDate(d)}</span>
                      <button
                        type="button"
                        onClick={() => onChange({ ...value, skipDates: value.skipDates.filter((x) => x !== d) })}
                        aria-label={t('exp.removeDate', { date: fmtDate(d) })}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-warning/20"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Skips: Fri, Sun, 3 dates" for the rules table. */
export function skipSummary(r: Skips, t: (k: string, p?: Record<string, string | number>) => string): string | null {
  const parts: string[] = [];
  if (r.skipFridays) parts.push(t('day.5'));
  for (const d of r.skipWeekdays) if (!(d === 5 && r.skipFridays)) parts.push(t(`day.${d}`));
  if (r.skipDates.length) parts.push(r.skipDates.length === 1 ? t('exp.date1') : t('exp.datesN', { n: r.skipDates.length }));
  return parts.length ? t('exp.skips', { list: parts.join(t('exp.listSep')) }) : null;
}
