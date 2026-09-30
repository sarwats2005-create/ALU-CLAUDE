'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { useDebounced } from '@/lib/client/use-remote';
import { cx } from '@/lib/cx';
import { Spinner } from './ui';

export type Option<T> = { id: string; label: string; data: T };

/**
 * Searchable picker (ARIA combobox). Options come from `source(q)` — an endpoint returning an array.
 * Optional `onCreate` adds an "Add “text”" row so new records can be created without leaving the form.
 */
export function Combobox<T>({
  id,
  value,
  onChange,
  source,
  toOption,
  renderOption,
  placeholder,
  invalid,
  onCreate,
  disabled,
  emptyText,
}: {
  id: string;
  value: Option<T> | null;
  onChange: (o: Option<T> | null) => void;
  source: (q: string) => string;
  toOption: (row: T) => Option<T>;
  renderOption?: (o: Option<T>) => ReactNode;
  placeholder: string;
  invalid?: boolean;
  onCreate?: (text: string) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  const { t } = useApp();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Option<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(text, 180);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    api<T[]>(source(dq), { signal: ctrl.signal }).then((r) => {
      if (r.ok) {
        setItems(r.data.map(toOption));
        setActive(0);
      }
      if (r.ok || r.code !== 'aborted') setLoading(false);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const showCreate = !!onCreate && dq.trim().length > 0 && !items.some((i) => i.label.toLocaleLowerCase() === dq.trim().toLocaleLowerCase());
  const count = items.length + (showCreate ? 1 : 0);

  function pick(i: number) {
    if (i < items.length) {
      onChange(items[i]);
      setText('');
      setOpen(false);
    } else if (showCreate) {
      onCreate!(dq.trim());
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative min-w-0">
      {value && !open ? (
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            window.setTimeout(() => input.current?.focus(), 0);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={cx(
            'flex h-11 w-full min-w-0 items-center gap-2 rounded-ctl border bg-surface ps-3 pe-2 text-start text-body text-ink transition-colors hover:border-brand/60 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] disabled:bg-surface-2 disabled:text-muted md:h-10',
            invalid ? 'border-danger' : 'border-line',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{renderOption ? renderOption(value) : <span className="bidi">{value.label}</span>}</span>
          {!disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={t('common.clear')}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-tint hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
        </button>
      ) : (
        <div className="relative">
          <input
            ref={input}
            id={value ? undefined : id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            disabled={disabled}
            autoComplete="off"
            placeholder={placeholder}
            value={text}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(count - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                if (open && count) {
                  e.preventDefault();
                  pick(active);
                }
              } else if (e.key === 'Escape') {
                if (open) {
                  e.stopPropagation();
                  setOpen(false);
                }
              }
            }}
            className={cx(
              'bidi h-11 w-full min-w-0 rounded-ctl border bg-surface ps-3 pe-9 text-body text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] md:h-10',
              invalid ? 'border-danger' : 'border-line',
            )}
          />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted">{loading && open ? <Spinner /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}</span>
        </div>
      )}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="scroll-thin absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-ctl border border-line bg-surface py-1 shadow-pop"
        >
          {items.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={value?.id === o.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              onMouseEnter={() => setActive(i)}
              className={cx('cursor-pointer px-3 py-2 text-body text-ink', i === active && 'bg-tint')}
            >
              {renderOption ? renderOption(o) : <span className="bidi">{o.label}</span>}
            </li>
          ))}
          {showCreate ? (
            <li
              id={`${listId}-${items.length}`}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(items.length)}
              onMouseEnter={() => setActive(items.length)}
              className={cx('flex cursor-pointer items-center gap-2 px-3 py-2 text-body font-semibold text-brand-ink', active === items.length && 'bg-tint')}
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="bidi truncate">{t('common.addNamed', { name: dq.trim() })}</span>
            </li>
          ) : null}
          {!loading && !count ? <li className="px-3 py-3 text-meta text-muted">{emptyText ?? t('common.noMatches')}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
