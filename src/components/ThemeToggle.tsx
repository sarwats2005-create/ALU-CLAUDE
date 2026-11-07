'use client';

import { Moon, Sun } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useTheme, useThemeOptional } from './ThemeProvider';

type Props = {
  onBrand?: boolean;
  className?: string;
  /** Sidebar tooltips only work when a label is provided; pass i18n strings from the shell. */
  labelLight?: string;
  labelDark?: string;
};

export function ThemeToggle({ onBrand, className, labelLight = 'Light mode', labelDark = 'Dark mode' }: Props) {
  const ctx = useThemeOptional();
  if (!ctx) return null;
  return <ThemeToggleInner {...ctx} onBrand={onBrand} className={className} labelLight={labelLight} labelDark={labelDark} />;
}

/** Use inside ThemeProvider when you want a hard error if the provider is missing. */
export function ThemeToggleBound(props: Omit<Props, never>) {
  const ctx = useTheme();
  return <ThemeToggleInner {...ctx} {...props} />;
}

function ThemeToggleInner({
  displayTheme,
  switching,
  toggle,
  onBrand,
  className,
  labelLight,
  labelDark,
}: Props & { displayTheme: 'light' | 'dark'; switching: boolean; toggle: () => void }) {
  const isDark = displayTheme === 'dark';
  const label = isDark ? labelDark : labelLight;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={switching}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={cx(
        'theme-toggle relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-ctl motion-safe:transition-[transform,background-color,color] motion-safe:duration-[var(--motion-base)] motion-safe:ease-[var(--ease-out)]',
        onBrand
          ? 'text-sidebar-ink hover:bg-sidebar-active disabled:opacity-70'
          : 'text-ink hover:bg-surface-2 disabled:opacity-70',
        switching && 'theme-toggle--busy',
        className,
      )}
    >
      <Sun
        className={cx(
          'theme-toggle__icon absolute h-5 w-5 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[var(--ease-out)]',
          isDark ? 'theme-toggle__icon--out scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
        style={{ transitionDelay: isDark ? '0ms' : '80ms' }}
        aria-hidden
      />
      <Moon
        className={cx(
          'theme-toggle__icon absolute h-5 w-5 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-[var(--ease-out)]',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'theme-toggle__icon--out scale-50 -rotate-90 opacity-0',
        )}
        style={{ transitionDelay: isDark ? '80ms' : '0ms' }}
        aria-hidden
      />
    </button>
  );
}
