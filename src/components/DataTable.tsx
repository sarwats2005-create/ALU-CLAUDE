'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { qs } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/use-remote';
import { cx } from '@/lib/cx';
import { Skeleton } from './ui';

export type Column<R> = {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  align?: 'start' | 'end';
  render: (r: R) => ReactNode;
  className?: string;
};

/** List state shared by every paginated table: search, sort, page, page size and extra filters. */
export function useListState(defaultSort: string, defaultDir: 'asc' | 'desc' = 'desc', initial: Record<string, string> = {}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [sort, setSortKey] = useState(defaultSort);
  const [dir, setDir] = useState<'asc' | 'desc'>(defaultDir);
  const [filters, setFilters] = useState<Record<string, string>>(initial);
  const dq = useDebounced(q, 250);

  const query = useMemo(() => qs({ q: dq, page, size, sort, dir, ...filters }), [dq, page, size, sort, dir, filters]);
  return {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    page,
    setPage,
    size,
    setSize: (n: number) => {
      setSize(n);
      setPage(1);
    },
    sort,
    dir,
    onSort: (key: string) => {
      if (key === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
      else {
        setSortKey(key);
        setDir(key === 'name' || key === 'sku' || key === 'type' || key === 'party' ? 'asc' : 'desc');
      }
      setPage(1);
    },
    filters,
    setFilter: (k: string, v: string) => {
      setFilters((f) => ({ ...f, [k]: v }));
      setPage(1);
    },
    clearFilters: () => {
      setFilters(initial);
      setQ('');
      setPage(1);
    },
    hasFilters: !!q || Object.entries(filters).some(([k, v]) => v && v !== (initial[k] ?? '')),
    query,
  };
}

export function SearchBox({ value, onChange, placeholder, className, label }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; label?: string }) {
  const { t } = useApp();
  return (
    <div className={cx('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="bidi h-11 w-full rounded-ctl border border-line bg-surface ps-9 pe-9 text-body text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] md:h-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label={t('common.clear')} className="absolute end-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-tint hover:text-ink">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Sortable table on tablet/desktop, stacked cards on phones (the `mobile` renderer).
 * Rows are keyboard-activatable when `onRowClick` is set.
 */
export function DataTable<R extends { id: string | number }>({
  rows,
  columns,
  sort,
  dir,
  onSort,
  onRowClick,
  mobile,
  loading,
  empty,
  minWidth = 720,
  rowClassName,
  caption,
}: {
  rows: R[] | null | undefined;
  columns: Column<R>[];
  sort?: string;
  dir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (r: R) => void;
  mobile: (r: R) => ReactNode;
  loading?: boolean;
  empty: ReactNode;
  minWidth?: number;
  rowClassName?: (r: R) => string | undefined;
  caption?: string;
}) {
  const { t } = useApp();
  if (!rows && loading) return <TableSkeleton />;
  if (rows && !rows.length) return <div className="px-5 py-12 text-center">{empty}</div>;
  const list = rows ?? [];
  return (
    <div className={cx('transition-opacity', loading && 'opacity-60')} aria-busy={loading || undefined}>
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full text-meta" style={{ minWidth }}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-y border-line-soft bg-surface-2 text-caption text-muted">
              {columns.map((c, i) => {
                const active = sort === c.key;
                const pad = i === 0 ? 'ps-5 pe-3' : i === columns.length - 1 ? 'ps-3 pe-5' : 'px-3';
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx('py-2.5 font-semibold whitespace-nowrap', pad, c.align === 'end' ? 'text-end' : 'text-start')}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cx('inline-flex items-center gap-1 rounded hover:text-ink', active && 'text-ink', c.align === 'end' && 'flex-row-reverse')}
                        aria-label={typeof c.label === 'string' ? t('common.sortBy', { col: c.label }) : undefined}
                      >
                        {c.label}
                        {active ? dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="w-3.5" />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr
                key={r.id}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onRowClick(r)) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx(
                  'border-b border-line-soft last:border-0',
                  onRowClick && 'cursor-pointer outline-none transition-colors hover:bg-surface-2 focus-visible:bg-tint',
                  rowClassName?.(r),
                )}
              >
                {columns.map((c, i) => {
                  const pad = i === 0 ? 'ps-5 pe-3' : i === columns.length - 1 ? 'ps-3 pe-5' : 'px-3';
                  return (
                    <td key={c.key} className={cx('py-3 align-middle', pad, c.align === 'end' ? 'text-end' : 'text-start', c.className)}>
                      {c.render(r)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden">
        {list.map((r) => (
          <li key={r.id} className="border-t border-line-soft first:border-t-0">
            {onRowClick ? (
              <button type="button" onClick={() => onRowClick(r)} className="block w-full px-4 py-3.5 text-start hover:bg-surface-2">
                {mobile(r)}
              </button>
            ) : (
              <div className="px-4 py-3.5">{mobile(r)}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-5" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/5" />
        </div>
      ))}
    </div>
  );
}

export function Pager({ total, page, size, onPage, onSize }: { total: number; page: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const { t } = useApp();
  if (total <= 25 && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(total, page * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3 text-meta text-muted">
      <p className="num">{t('common.showing', { from, to, total })}</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">{t('common.perPage')}</span>
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="select-chevron h-9 appearance-none rounded-ctl border border-line bg-surface ps-2 pe-8 text-meta text-ink">
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="num px-1">{t('common.page', { n: page, total: pages })}</span>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.prev')} className="inline-flex h-9 w-9 items-center justify-center rounded-ctl border border-line text-ink hover:bg-tint disabled:opacity-40">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.next')} className="inline-flex h-9 w-9 items-center justify-center rounded-ctl border border-line text-ink hover:bg-tint disabled:opacity-40">
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Pill filter bar (segmented, scrolls horizontally on phones). */
export function FilterPills<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-9 shrink-0 rounded-full border px-3.5 text-meta font-semibold transition-colors',
              on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
