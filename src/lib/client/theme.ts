export type Theme = 'light' | 'dark';

export const THEME_KEY = 'alu:theme';
export const THEME_EVENT = 'alu:theme';

/** How long the toggle animates before the document theme class updates. */
export const THEME_SWITCH_DELAY_MS = 320;

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* private mode */
  }
  return null;
}

export function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Default appearance when the user has not chosen yet — always light. */
export const DEFAULT_THEME: Theme = 'light';

export function resolveTheme(stored: Theme | null = readStoredTheme()): Theme {
  return stored ?? DEFAULT_THEME;
}

export function applyThemeClass(theme: Theme, crossfade = false) {
  const el = document.documentElement;
  el.classList.remove('theme-light', 'theme-dark');
  el.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  if (crossfade) {
    el.classList.add('theme-crossfade');
    window.setTimeout(() => el.classList.remove('theme-crossfade'), THEME_SWITCH_DELAY_MS + 520);
  }
}

/** Runs before paint to avoid a flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('alu:theme');var d=document.documentElement;var dark=s==='dark';d.classList.remove('theme-light','theme-dark');d.classList.add(dark?'theme-dark':'theme-light');}catch(e){}})();`;

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  } catch {
    /* private mode */
  }
}
