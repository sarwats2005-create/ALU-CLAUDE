'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/client/app-context';

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

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFirst = () => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([disabled])');
      el?.focus();
    };
    const id = window.setTimeout(focusFirst, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
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
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose, dismissible]);

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
          'anim-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-surface shadow-pop md:rounded-card',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 pb-3 pt-4 md:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="bidi text-title font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-meta text-muted">{description}</p> : null}
          </div>
          {dismissible ? (
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="-me-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-tint hover:text-ink">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {banner}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">{children}</div>
        {footer ? <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-line-soft bg-surface px-5 py-3 md:flex-row md:justify-end md:px-6">{footer}</div> : null}
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
