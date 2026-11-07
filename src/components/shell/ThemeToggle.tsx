'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';

const KEY = 'alu-theme';

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  } catch {
    /* private mode */
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useApp();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !document.documentElement.classList.contains('dark');
        applyTheme(next);
        setDark(next);
      }}
      aria-pressed={dark}
      aria-label={dark ? t('nav.themeLight') : t('nav.themeDark')}
      title={dark ? t('nav.themeLight') : t('nav.themeDark')}
      className={
        className ??
        'inline-flex h-9 w-9 items-center justify-center rounded-ctl text-muted motion-safe:transition-colors motion-safe:duration-[var(--motion-fast)] hover:bg-surface-2 hover:text-ink'
      }
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
