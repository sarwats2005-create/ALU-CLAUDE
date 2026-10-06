'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cx } from '@/lib/cx';

// Shared page-summary pieces (used on every main page, same as the dashboard). Flat "colour block" stats:
//  • Each figure is its own white block on the grey canvas, separated by space, never by lines or shadows.
//  • Each block's icon sits in a solid circle; the circles cycle Blue, Emerald, Amber, Dark Gray so a row of
//    stats reads as a multi-colour poster. A block that needs action turns red.
//  • Least effort — every figure can link straight to the place that explains it (hover: scale + icon pop).

const COLS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' } as const;

export function SummaryStrip({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cx(
        // gap-px over a hairline-coloured background = dividers that work for any number of cells, in LTR and RTL.
        'stat-strip grid grid-cols-2 gap-3',
        // Odd number of cells on a 2-column phone grid: the last one takes the full row (no empty hole).
        cols === 3 ? 'max-sm:[&>*:last-child:nth-child(odd)]:col-span-2' : 'max-lg:[&>*:last-child:nth-child(odd)]:col-span-2',
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
        {icon ? (
          <span className={cx('stat-icon flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-200 group-hover:scale-110', alert && 'is-alert')}>{icon}</span>
        ) : null}
        <span className="min-w-0 leading-tight">{label}</span>
      </span>
      <span className={cx('fig mt-4 block break-words text-heading font-extrabold md:text-large', tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink')}>{value}</span>
      {sub ? (
        <span className={cx('mt-1.5 flex items-center gap-1 text-caption', alert ? 'font-semibold text-danger-ink' : 'text-muted')}>
          <span className="min-w-0">{sub}</span>
          {go ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" /> : null}
        </span>
      ) : null}
    </>
  );
  const cls = cx(
    'group relative block min-w-0 overflow-hidden rounded-card p-5 text-start md:p-6',
    alert ? 'bg-danger-tint' : active ? 'bg-tint-2' : 'bg-surface',
    // Selected filter: a solid Primary bar along the bottom edge (flat, no shadow).
    active && 'after:absolute after:inset-x-0 after:bottom-0 after:h-1.5 after:bg-brand',
    go && 'cursor-pointer transition-all duration-200 hover:scale-[1.02] motion-reduce:hover:scale-100',
    go && (alert ? 'hover:bg-danger-tint' : active ? '' : 'hover:bg-tint'),
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
      <h2 id={id} className="text-caption font-bold uppercase tracking-wider text-muted">
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
      <h2 className="flex items-center gap-2.5 text-caption font-bold uppercase tracking-wider text-ink">
        <span className="num flex h-8 w-8 items-center justify-center rounded-full bg-brand text-meta font-bold text-on-brand" aria-hidden="true">
          {n}
        </span>
        {children}
      </h2>
      {aside}
    </div>
  );
}
