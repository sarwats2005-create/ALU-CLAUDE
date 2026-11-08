'use client';
import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/cx';
import { DropdownItem, DropdownMenu } from './menu/hamburger-menu';
export { cx };

// ─── Button ────────────────────────────────────────────────────────────────────────────────────────
// Flat buttons: solid colour blocks, no shadow. Feedback is a colour shift plus a subtle scale.
// Every button is a large touch target (--ctl-h / --ctl-h-lg).
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'quiet';
const BTN: Record<BtnVariant, string> = {
  primary: 'alu-btn-primary text-on-brand border border-white/10 hover:border-white/15',
  // Muted block. On the grey page canvas it turns white (see PageHeader / [data-on-canvas]).
  secondary:
    'border border-line-soft bg-surface text-ink shadow-[0_1px_0_rgba(255,255,255,0.5)_inset] hover:border-brand/20 hover:bg-tint',
  outline:
    'border-2 border-brand/35 bg-surface-glass text-brand-ink backdrop-blur-sm hover:border-brand hover:bg-brand hover:text-on-brand',
  ghost: 'text-brand-ink hover:bg-tint/80',
  quiet: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-danger/20 bg-danger text-white shadow-[0_4px_14px_-4px_rgba(217,48,37,0.45)] hover:bg-danger-ink',
};
/** Shared micro-interaction: 160ms colour/transform, subtle press — respects reduced motion. */
export const BTN_MOTION =
  'motion-safe:transition-[background-color,color,border-color,transform,opacity] motion-safe:duration-[var(--motion-base)] hover:scale-[1.02] active:scale-100 disabled:hover:scale-100 motion-reduce:hover:scale-100';

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
        size === 'sm' && 'h-[var(--ctl-h)] px-5 text-body',
        size === 'md' && 'h-[var(--ctl-h)] px-6 text-body',
        size === 'lg' && 'h-[var(--ctl-h-lg)] px-8 text-lead',
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
      className={cx('inline-flex h-[var(--ctl-h)] w-[var(--ctl-h)] shrink-0 items-center justify-center rounded-ctl text-muted hover:bg-surface-2 hover:text-ink', BTN_MOTION, className)}
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
    <div className={cx('flex min-w-0 flex-col gap-2', className)}>
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

const INPUT =
  'alu-field h-[var(--ctl-h)] w-full min-w-0 rounded-ctl px-4 text-body text-ink placeholder:text-muted motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-[var(--motion-base)] focus:outline-none disabled:text-muted disabled:opacity-70';

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
      className={cx(INPUT, numeric && 'num text-left', !numeric && 'bidi', className)}
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
      className={cx(INPUT, 'bidi h-auto min-h-[96px] py-3', className)}
      {...rest}
    />
  );
});

type SelectOption = { value: string; label: ReactNode; disabled: boolean };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean; hidden?: boolean };

/** Reads the <option> children (also inside arrays and fragments) into a plain list. */
function readOptions(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const walk = (nodes: ReactNode) =>
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as ReactElement<OptionProps>;
      if (el.type === 'option') {
        if (el.props.hidden) return;
        out.push({ value: String(el.props.value ?? textOf(el.props.children)), label: el.props.children, disabled: !!el.props.disabled });
      } else if (el.type === Fragment || el.type === 'optgroup') walk(el.props.children);
    });
  walk(children);
  return out;
}

function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement(n)) return textOf((n as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

/** What `onChange` receives: shaped like a change event, so `e.target.value` works as with a native select. */
export type SelectChange = { target: { value: string }; currentTarget: { value: string } };

/**
 * Dropdown (springy list, see components/menu). Same API as a native <select>: `value`, `onChange(e)` with
 * `e.target.value`, and <option> children. `placeholder` is shown in the field while nothing is picked (muted,
 * like a text field's hint) but is never offered in the open list. Picking an item replaces it.
 */
export function Select({
  id,
  name,
  value,
  onChange,
  children,
  placeholder,
  invalid,
  disabled,
  className,
  title,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: {
  id?: string;
  name?: string;
  value?: string | number | null;
  onChange?: (e: SelectChange) => void;
  children?: ReactNode;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const options = readOptions(children);
  const val = value == null ? '' : String(value);
  const current = options.find((o) => o.value === val);
  // Like a native select: with no placeholder and no match, the first option is what shows.
  const shown = current ?? (placeholder === undefined ? options[0] : undefined);
  const empty = !shown;
  const menu = (
    <DropdownMenu
      role="listbox"
      label={ariaLabel ?? placeholder ?? ''}
      disabled={disabled}
      trigger={(p) => (
        <button
          {...p}
          type="button"
          id={id}
          // Select-only combobox: the label names it, its text is the current value.
          role="combobox"
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy ?? (invalid && id ? `${id}-error` : undefined)}
          data-empty={empty || undefined}
          className={cx(INPUT, 'alu-select group relative flex items-center pe-10 text-start', className)}
        >
          <span className="bidi min-w-0 flex-1 truncate">{shown ? shown.label : placeholder}</span>
          {/* A real icon, not a background image: .alu-field's background shorthand would wipe an image out. */}
          <ChevronDown
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted motion-safe:transition-transform motion-safe:duration-300 group-aria-expanded:rotate-180"
            aria-hidden="true"
          />
        </button>
      )}
    >
      {options.map((o) => (
        <DropdownItem
          key={o.value}
          selected={o.value === val}
          disabled={o.disabled}
          onSelect={() => {
            if (o.value !== val) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
          }}
        >
          {o.label}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
  return name ? (
    <>
      {menu}
      <input type="hidden" name={name} value={val} />
    </>
  ) : (
    menu
  );
}

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
    <div role="radiogroup" aria-label={label} className={cx('alu-segmented alu-glass inline-flex max-w-full gap-1 rounded-full p-1', className)}>
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
              'min-w-0 flex-1 rounded-full px-3 py-1 font-semibold leading-tight motion-safe:transition-[background-color,color] motion-safe:duration-[var(--motion-base)] sm:whitespace-nowrap sm:px-4',
              size === 'sm' ? 'min-h-11 text-body' : 'min-h-11 text-body',
              on ? 'text-on-brand' : 'text-muted hover:bg-line/80 hover:text-ink',
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
export function Card({ children, className, as: As = 'section', elevated, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; elevated?: boolean; 'aria-labelledby'?: string }) {
  return (
    <As
      className={cx(
        'alu-card alu-glass motion-safe:transition-[box-shadow,border-color,transform] motion-safe:duration-[var(--motion-panel)]',
        elevated && 'alu-card--elevated',
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * "Elegant redesign" page banner: dark navy hero with an icon tile, the page title + subtitle, a decorative
 * illustration (lg+) and the page actions. Inside `.elegant-hero` the colour tokens are re-mapped for the dark
 * background (globals.css), so ordinary Buttons, links and muted text just work on it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  icon,
  media,
  art,
  eyebrow,
  extra,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  /** Lucide icon shown in the gradient tile. */
  icon?: ReactNode;
  /** Replaces the icon tile (e.g. a person's avatar). */
  media?: ReactNode;
  /** Decorative scene from `@/components/hero-art`. */
  art?: ReactNode;
  /** Small line above the title (e.g. today's date). */
  eyebrow?: ReactNode;
  /** Extra content under the subtitle (badges, small links). */
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <header data-on-hero className={cx('elegant-hero relative mb-5 overflow-hidden rounded-[20px] px-5 py-6 md:mb-6 md:px-8 md:py-7', className)}>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="absolute inset-y-0 end-0 h-full w-[70%] rtl:-scale-x-100">
          <path d="M330 220 C 430 150, 470 60, 600 10" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
          <path d="M380 220 C 470 160, 520 80, 620 40" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <path d="M440 220 C 520 170, 560 110, 640 90 L640 220 Z" fill="rgba(255,255,255,0.05)" />
        </svg>
        <div className="absolute -top-24 end-[18%] h-64 w-64 rounded-full bg-[#5b9cf0]/25 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4 md:gap-6">
          {media ?? (icon ? <span className="elegant-hero-icon flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white md:h-[72px] md:w-[72px] [&_svg]:h-7 [&_svg]:w-7 md:[&_svg]:h-9 md:[&_svg]:w-9">{icon}</span> : null)}
          {media || icon ? <span className="hidden h-14 w-px shrink-0 bg-white/25 sm:block" aria-hidden="true" /> : null}
          <div className="min-w-0">
            {back}
            {eyebrow ? <p className="text-meta font-medium text-muted">{eyebrow}</p> : null}
            <h1 className="bidi text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink md:text-[36px] md:leading-[42px]">{title}</h1>
            {subtitle ? <div className="mt-1 text-body text-muted">{subtitle}</div> : null}
            {extra}
          </div>
        </div>
        <div className="pointer-events-none relative hidden min-w-[140px] flex-1 self-stretch lg:block" aria-hidden="true">
          {art ? <div className="absolute inset-x-0 -bottom-14 flex h-[172px] justify-center [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:drop-shadow-[0_18px_24px_rgba(4,16,40,0.45)]">{art}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3 md:shrink-0 md:justify-end md:self-start">{actions}</div> : null}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title?: ReactNode; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand">{icon}</div> : null}
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
  return <span className={cx('alu-badge inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold', tones[tone], className)}>{children}</span>;
}

/** Amount span: tabular, LTR, optional tone. */
export function Num({ children, tone, className }: { children: ReactNode; tone?: 'danger' | 'success' | 'muted'; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', tone === 'danger' && 'text-danger-ink', tone === 'success' && 'text-success-ink', tone === 'muted' && 'text-muted', className)}>
      {children}
    </span>
  );
}
