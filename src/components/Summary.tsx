'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cx } from '@/lib/cx';

// Shared page-summary pieces (used on every main page, same as the dashboard):
//  • Gestalt — related figures sit in ONE card, same shape, divided by hairlines.
//  • Colour & Von Restorff — a cell only gets colour when it needs action (alert) or is clearly good.
//  • Least effort — every figure can link straight to the place that explains it.

const COLS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' } as const;

export function SummaryStrip({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cx(
        // gap-px over a hairline-coloured background = dividers that work for any number of cells, in LTR and RTL.
        'grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line-soft bg-line-soft shadow-card',
        cols === 3 && 'sm:grid-cols-3',
        COLS[cols],
        className,
      )}
    >
      {children}
    </div>
  );
}

export type CellProps = {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Colour of the figure. */
  tone?: 'danger' | 'success';
  /** Needs attention: tinted cell, solid icon. */
  alert?: boolean;
  /** Selected (when the cell acts as a filter). */
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function SummaryCell({ icon, label, value, sub, tone, alert, active, href, onClick, className }: CellProps) {
  const go = !!(href || onClick);
  const body = (
    <>
      <span className="flex items-center gap-2 text-meta font-medium text-muted">
        {icon ? <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', alert ? 'bg-danger text-white' : 'bg-tint text-brand-ink')}>{icon}</span> : null}
        <span className="min-w-0 leading-tight">{label}</span>
      </span>
      <span className={cx('fig mt-3 block break-words text-heading font-bold md:text-large', tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink')}>{value}</span>
      {sub ? (
        <span className={cx('mt-1.5 flex items-center gap-1 text-caption', alert ? 'font-semibold text-danger-ink' : 'text-muted')}>
          <span className="min-w-0">{sub}</span>
          {go ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" /> : null}
        </span>
      ) : null}
    </>
  );
  const cls = cx(
    'group block min-w-0 p-4 text-start md:p-5',
    alert ? 'bg-danger-tint' : 'bg-surface',
    active && 'shadow-[inset_0_-3px_0_var(--brand)]',
    go && 'transition-colors',
    go && (alert ? 'hover:bg-danger-tint/70' : 'hover:bg-surface-2'),
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** Small uppercase label above a band of the page (chunking into sections). */
export function SectionLabel({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 id={id} className="text-meta font-semibold uppercase tracking-[0.06em] text-muted">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Numbered step label for multi-part forms (chunking + a visible order to follow). */
export function StepLabel({ n, children, aside }: { n: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-meta font-semibold uppercase tracking-[0.06em] text-muted">
        <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-brand text-caption font-bold text-on-brand" aria-hidden="true">
          {n}
        </span>
        {children}
      </h2>
      {aside}
    </div>
  );
}
