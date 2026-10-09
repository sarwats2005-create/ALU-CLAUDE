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
// Flat buttons: solid colour blocks, no shadow. Feedback is a colour shift plus a snappy scale (hover:scale-105).
// Every button is a large touch target (h-14 / h-16).
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'quiet';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  // Muted block. On the grey page canvas it turns white (see PageHeader / [data-on-canvas]).
  secondary: 'bg-surface-2 text-ink hover:bg-line',
  // Thick outline that fills with colour on hover.
  outline: 'border-4 border-brand bg-transparent text-brand-ink hover:bg-brand hover:text-on-brand',
  ghost: 'text-brand-ink hover:bg-tint',
  quiet: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger-ink',
};
export const BTN_MOTION = 'transition-all duration-200 hover:scale-105 active:scale-100 disabled:hover:scale-100 motion-reduce:hover:scale-100';

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
      data-variant={variant}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-semibold disabled:opacity-55',
        BTN_MOTION,
        size === 'sm' && 'h-14 px-5 text-body',
        size === 'md' && 'h-14 px-6 text-body',
        size === 'lg' && 'h-16 px-8 text-lead',
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
      className={cx('inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-ctl text-muted hover:bg-surface-2 hover:text-ink', BTN_MOTION, className)}
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
        <label htmlFor={htmlFor} className="text-caption font-semibold uppercase tracking-wider text-ink">
          {label}
          {required ? <span className="text-danger-ink" aria-hidden="true"> *</span> : null}
          {optionalLabel ? <span className="font-medium normal-case tracking-normal text-muted"> ({optionalLabel})</span> : null}
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

// Flat inputs: Gray 100 block, no visible border. Focus: white with a hard 2px Primary border, no glow.
const INPUT =
  'h-14 w-full min-w-0 rounded-ctl border-2 bg-surface-2 px-4 text-body text-ink placeholder:text-muted transition-colors duration-200 focus:border-brand focus:bg-surface focus:outline-none disabled:text-muted disabled:opacity-70';

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
      className={cx(INPUT, invalid ? 'border-danger' : 'border-transparent', numeric && 'num text-left', !numeric && 'bidi', className)}
      {...rest}
      // Always set (a blank one when none is given) so CSS can tell an empty field from a filled one —
      // used to hide the unit/currency label inside a field once something is typed.
      placeholder={rest.placeholder ?? ' '}
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
      className={cx(INPUT, 'bidi h-auto min-h-[96px] py-3', invalid ? 'border-danger' : 'border-transparent', className)}
      {...rest}
    />
  );
});

/**
 * Dropdown. `placeholder` is shown in the field while nothing is picked (muted, like a text field's hint) but is
 * never offered in the open list: it is a hidden, disabled option, so it can't be chosen. Picking an item replaces it.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; placeholder?: string }>(function Select(
  { invalid, className, children, placeholder, ...rest },
  ref,
) {
  const empty = placeholder !== undefined && (rest.value === '' || rest.value === undefined || rest.value === null);
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      data-empty={empty || undefined}
      className={cx(INPUT, 'select-chevron appearance-none pe-9', invalid ? 'border-danger' : 'border-transparent', className)}
      {...rest}
    >
      {placeholder !== undefined ? (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      ) : null}
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
    <div role="radiogroup" aria-label={label} className={cx('inline-flex max-w-full gap-1 rounded-ctl bg-surface-2 p-1', className)}>
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
              // Long labels wrap to two lines on narrow phones instead of pushing the page sideways.
              'min-w-0 flex-1 rounded-[5px] px-3 py-1 font-semibold leading-tight transition-all duration-200 sm:whitespace-nowrap sm:px-4',
              size === 'sm' ? 'min-h-12 text-body' : 'min-h-12 text-body',
              on ? 'bg-brand text-on-brand' : 'text-muted hover:bg-line hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  // Styles: .alu-switch in globals.css. The real checkbox (role="switch") sits on top of the track, so the
  // switch works on its own and when wrapped in a <label> with its text.
  return (
    <span className="alu-switch">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" aria-hidden="true">
        <span className="glow" />
        <span className="icon-on">✓</span>
        <span className="icon-off">✕</span>
      </span>
    </span>
  );
}

// ─── Surfaces ──────────────────────────────────────────────────────────────────────────────────────
export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string }) {
  return (
    <As className={cx('rounded-card bg-surface', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="subline-host mb-5 flex flex-col gap-3 md:mb-7 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="bidi text-large font-extrabold tracking-[-0.02em] text-ink md:text-[44px] md:leading-[46px]">{title}</h1>
        {subtitle ? <p className="subline mt-1 text-body text-muted">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div data-on-canvas className="flex flex-wrap items-center gap-3">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title?: ReactNode; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-on-brand">{icon}</div> : null}
      {title ? <h3 className="text-title font-bold text-ink">{title}</h3> : null}
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
    neutral: 'bg-surface-2 text-muted',
    brand: 'bg-tint-2 text-brand-ink',
    success: 'bg-success-tint text-success-ink',
    danger: 'bg-danger-tint text-danger-ink',
    warning: 'bg-warning-tint text-warning-ink',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold', tones[tone], className)}>{children}</span>;
}

/** Amount span: tabular, LTR, optional tone. */
export function Num({ children, tone, className }: { children: ReactNode; tone?: 'danger' | 'success' | 'muted'; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', tone === 'danger' && 'text-danger-ink', tone === 'success' && 'text-success-ink', tone === 'muted' && 'text-muted', className)}>
      {children}
    </span>
  );
}
