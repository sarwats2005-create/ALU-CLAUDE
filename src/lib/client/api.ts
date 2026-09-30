'use client';
import { t, type Lang } from '@/lib/i18n';

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; status: number; error: string; code?: string; fieldErrors?: Record<string, string> };
export type ApiResult<T> = ApiOk<T> | ApiErr;

const docLang = (): Lang => (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'ku' : 'en');

/**
 * JSON fetch with the product's error vocabulary: 401 → back to sign-in with "Session expired",
 * network failure → "Connection lost…", server errors arrive already translated.
 */
export async function api<T = unknown>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const lang = docLang();
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return { ok: false, status: 0, error: '', code: 'aborted' };
    return { ok: false, status: 0, error: t('err.network', lang), code: 'err.network' };
  }
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?expired=1';
    }
    return { ok: false, status: 401, error: t('auth.sessionExpired', lang), code: 'auth.sessionExpired' };
  }
  const json = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof json?.error === 'string' ? json.error : t('err.generic', lang),
      code: typeof json?.code === 'string' ? json.code : undefined,
      fieldErrors: (json?.fieldErrors as Record<string, string>) ?? undefined,
    };
  }
  return { ok: true, data: json as T };
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
