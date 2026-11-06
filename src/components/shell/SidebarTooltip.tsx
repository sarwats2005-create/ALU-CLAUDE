'use client';
import { useId, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/**
 * Tooltip shown only when the sidebar is collapsed (icons-only).
 * Uses a focusable wrapper so keyboard users also see the label.
 */
export function SidebarTooltip({
  label,
  enabled,
  children,
  className,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!enabled) return <>{children}</>;

  return (
    <span
      className={cx('relative flex w-full', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className={cx(
          'pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 whitespace-nowrap rounded-ctl bg-dark px-2.5 py-1.5 text-caption font-semibold text-on-brand shadow-[var(--shadow-card)]',
          'motion-safe:transition-opacity motion-safe:duration-150',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {label}
      </span>
    </span>
  );
}
