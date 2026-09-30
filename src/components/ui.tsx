'use client';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cx } from '@/lib/cx';
export { cx };

// ─── Button ────────────────────────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong dark:hover:bg-brand/85 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-brand-ink hover:bg-tint',
  quiet: 'text-muted hover:text-ink hover:bg-tint',
  danger: 'bg-danger text-white hover:bg-danger-ink shadow-card',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; busy?: boolean; icon?: ReactNode; block?: boolean }
>(function Button({ variant = 'primary', size = 'md', busy, icon, block, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-semibold transition-colors disabled:opacity-55',
        size === 'sm' && 'h-9 px-3 text-meta',
        size === 'md' && 'h-11 px-4 text-body md:h-10',
        size === 'lg' && 'h-12 px-5 text-lead',
        block && 'w-full',
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex h-11 w-11 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-tint hover:text-ink md:h-10 md:w-10', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 motion-safe:animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Form fields ───────────────────────────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  optionalLabel,
  children,
  className,
  trailing,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  required?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-meta font-medium text-ink">
          {label}
          {required ? <span className="text-danger-ink" aria-hidden="true"> *</span> : null}
          {optionalLabel ? <span className="font-normal text-muted"> ({optionalLabel})</span> : null}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-meta font-medium text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  'h-11 w-full min-w-0 rounded-ctl border bg-surface px-3 text-body text-ink placeholder:text-muted/80 transition-colors focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-[var(--focus)] disabled:bg-surface-2 disabled:text-muted md:h-10';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; numeric?: boolean }>(function Input(
  { invalid, numeric, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && rest.id ? `${rest.id}-error` : undefined}
      dir={numeric ? 'ltr' : rest.dir}
      inputMode={numeric ? 'decimal' : rest.inputMode}
      autoComplete={numeric ? 'off' : rest.autoComplete}
      className={cx(INPUT, invalid ? 'border-danger' : 'border-line', numeric && 'num text-left', !numeric && 'bidi', className)}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(INPUT, 'bidi h-auto min-h-[84px] py-2 md:h-auto', invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(INPUT, 'select-chevron appearance-none pe-9', invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Apple-style segmented control (radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
  name?: string;
}) {
  const gid = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-ctl bg-tint p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            name={name ?? gid}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-w-0 flex-1 whitespace-nowrap rounded-[6px] px-3 font-semibold transition-colors',
              size === 'sm' ? 'h-8 text-meta' : 'h-10 text-body md:h-9',
              on ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-success' : 'bg-line')}
    >
      <span className={cx('inline-block h-6 w-6 rounded-full bg-white shadow-card transition-transform', checked ? 'translate-x-[22px] rtl:-translate-x-[22px]' : 'translate-x-0.5 rtl:-translate-x-0.5')} />
    </button>
  );
}

// ─── Surfaces ──────────────────────────────────────────────────────────────────────────────────────
export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string }) {
  return (
    <As className={cx('rounded-card border border-line-soft bg-surface shadow-card', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:mb-7 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="bidi text-large font-bold tracking-[-0.02em] text-ink md:text-[34px] md:leading-[40px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-body text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title?: ReactNode; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tint text-brand-ink">{icon}</div> : null}
      {title ? <h3 className="text-title font-semibold text-ink">{title}</h3> : null}
      <p className="max-w-md text-body text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton h-4', className)} aria-hidden="true" />;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'success' | 'danger' | 'warning'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-tint text-muted',
    brand: 'bg-tint text-brand-ink',
    success: 'bg-success-tint text-success-ink',
    danger: 'bg-danger-tint text-danger-ink',
    warning: 'bg-warning-tint text-warning-ink',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold', tones[tone], className)}>{children}</span>;
}

/** Amount span: tabular, LTR, optional tone. */
export function Num({ children, tone, className }: { children: ReactNode; tone?: 'danger' | 'success' | 'muted'; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', tone === 'danger' && 'text-danger-ink', tone === 'success' && 'text-success-ink', tone === 'muted' && 'text-muted', className)}>
      {children}
    </span>
  );
}
