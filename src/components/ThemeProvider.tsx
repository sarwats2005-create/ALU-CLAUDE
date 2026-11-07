'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  THEME_EVENT,
  THEME_SWITCH_DELAY_MS,
  applyThemeClass,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type Theme,
} from '@/lib/client/theme';

type ThemeApi = {
  theme: Theme;
  /** Value shown on the toggle while the switch animation is in flight. */
  displayTheme: Theme;
  switching: boolean;
  toggle: () => void;
  setTheme: (next: Theme) => void;
};

const ThemeCtx = createContext<ThemeApi | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** Optional hook for surfaces that may render outside ThemeProvider (e.g. marketing pages). */
export function useThemeOptional(): ThemeApi | null {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [displayTheme, setDisplayTheme] = useState<Theme>('light');
  const [switching, setSwitching] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const resolved = resolveTheme();
    setThemeState(resolved);
    setDisplayTheme(resolved);
    applyThemeClass(resolved);
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'alu:theme') return;
      const next = resolveTheme(e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : null);
      setThemeState(next);
      setDisplayTheme(next);
      applyThemeClass(next);
    };
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') {
        setThemeState(next);
        setDisplayTheme(next);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(THEME_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(THEME_EVENT, onCustom);
    };
  }, []);

  const commitTheme = useCallback((next: Theme, animated: boolean) => {
    setThemeState(next);
    setDisplayTheme(next);
    applyThemeClass(next, animated);
    persistTheme(next);
    setSwitching(false);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      if (next === theme) return;
      setSwitching(true);
      setDisplayTheme(next);
      window.setTimeout(() => commitTheme(next, true), THEME_SWITCH_DELAY_MS);
    },
    [theme, commitTheme],
  );

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme: ready ? theme : 'light', displayTheme, switching, toggle, setTheme }),
    [ready, theme, displayTheme, switching, toggle, setTheme],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
