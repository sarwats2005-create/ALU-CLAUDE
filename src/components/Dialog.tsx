'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/client/app-context';

const openStack: object[] = [];

/**
 * Modal dialog: a centred sheet on desktop, a bottom sheet on phones. Traps focus, closes on Escape,
 * restores focus to the opener. Motion only on open (user-triggered), and respects reduced motion.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  banner,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  banner?: ReactNode;
  dismissible?: boolean;
}) {
  const { t } = useT();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // onClose is usually a new function on every render (e.g. typing in a field). Keep it in a ref so the
  // open/focus setup below runs once per opening — otherwise each keystroke re-ran it and focus jumped
  // away from the field being typed in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the field marked data-autofocus, else the first field in the body, else the first button.
    const focusFirst = () => {
      const p = panel.current;
      if (!p || p.contains(document.activeElement)) return;
      const el =
        p.querySelector<HTMLElement>('[data-autofocus]') ??
        p.querySelector<HTMLElement>('[data-dialog-body] :is(input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]))') ??
        p.querySelector<HTMLElement>('[data-dialog-body] button:not([disabled]), [data-dialog-footer] button:not([disabled])') ??
        p.querySelector<HTMLElement>('button:not([disabled])');
      el?.focus();
    };
    const id = window.setTimeout(focusFirst, 20);
    const me = {};
    openStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog reacts (a confirm can open above another dialog).
      if (openStack[openStack.length - 1] !== me) return;
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
          (x) => x.offsetParent !== null,
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onKey);
      openStack.splice(openStack.indexOf(me), 1);
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, dismissible]);

  if (!open || typeof document === 'undefined') return null;
  const width = { sm: 'md:max-w-[420px]', md: 'md:max-w-[560px]', lg: 'md:max-w-[760px]', xl: 'md:max-w-[1040px]' }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="anim-fade absolute inset-0 bg-overlay" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'anim-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-card bg-surface md:rounded-card',
          width,
        )}
      >
        {/* Flat sheet: no divider lines. The footer is a Gray 100 colour block instead. */}
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5 md:px-7 md:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="bidi text-heading font-extrabold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-meta text-muted">{description}</p> : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-me-2 -mt-2 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-ctl text-muted transition-all duration-200 hover:scale-105 hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {banner}
        <div data-dialog-body className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-7">{children}</div>
        {footer ? (
          <div
            data-dialog-footer
            data-on-canvas
            className="safe-bottom flex flex-col-reverse gap-3 bg-surface-2 px-5 py-4 md:flex-row md:justify-end md:px-7"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** "EDITING [TYPE] [NUMBER]" banner shown at the top of any form in edit mode. */
export function EditingBanner({ text, onCancel, cancelLabel }: { text: string; onCancel?: () => void; cancelLabel?: string }) {
  return (
    <div role="status" className="flex items-center justify-between gap-3 bg-warning-tint px-5 py-2.5 text-meta font-bold tracking-[0.02em] text-warning-ink md:px-6">
      <span className="bidi">{text}</span>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="rounded-ctl px-2 py-1 font-semibold underline-offset-2 hover:underline">
          {cancelLabel}
        </button>
      ) : null}
    </div>
  );
}
