'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { fmtDate, parseDmy } from '@/lib/dates';
import { cx } from '@/lib/cx';

/**
 * Date field that always reads DD/MM/YYYY (whatever the browser locale), with a calendar button
 * that opens the native picker. Value in and out is ISO YYYY-MM-DD ('' when empty/invalid).
 */
export function DateInput({
  id,
  value,
  onChange,
  invalid,
  className,
  label,
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
  invalid?: boolean;
  className?: string;
  label?: string;
}) {
  const { t } = useApp();
  const [text, setText] = useState(fmtDate(value));
  const native = useRef<HTMLInputElement>(null);
  useEffect(() => setText(fmtDate(value)), [value]);

  function commit(s: string) {
    if (!s.trim()) return onChange('');
    const iso = parseDmy(s);
    if (iso) onChange(iso);
    else onChange('');
  }

  return (
    <div dir="ltr" className={cx('relative', className)}>
      <input
        id={id}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t('common.dateFormatHint')}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d/]/g, '').slice(0, 10);
          setText(v);
          const iso = parseDmy(v);
          if (iso) onChange(iso);
        }}
        onBlur={(e) => commit(e.target.value)}
        className={cx(
          'num h-14 w-full min-w-0 rounded-ctl border-2 bg-surface-2 ps-4 pe-14 text-body text-ink placeholder:text-muted transition-colors duration-200 focus:border-brand focus:bg-surface focus:outline-none',
          invalid ? 'border-danger' : 'border-transparent',
        )}
      />
      <button
        type="button"
        onClick={() => {
          const el = native.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
            el.click();
          }
        }}
        aria-label={t('common.openCalendar')}
        className="absolute end-1 top-1/2 inline-flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-ctl text-muted hover:bg-tint-2 hover:text-ink"
      >
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        ref={native}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 end-0 h-px w-px opacity-0"
      />
    </div>
  );
}

/** From–to pair used by lists and reports. */
export function DateRange({ from, to, onFrom, onTo, idPrefix }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; idPrefix: string }) {
  const { t } = useApp();
  return (
    <fieldset className="flex min-w-0 items-center gap-2">
      <legend className="sr-only">{t('common.dateRange')}</legend>
      <DateInput id={`${idPrefix}-from`} value={from} onChange={onFrom} label={t('common.from')} className="w-[150px] min-w-0 flex-1" />
      <span className="text-muted" aria-hidden="true">
        –
      </span>
      <DateInput id={`${idPrefix}-to`} value={to} onChange={onTo} label={t('common.to')} className="w-[150px] min-w-0 flex-1" />
    </fieldset>
  );
}
