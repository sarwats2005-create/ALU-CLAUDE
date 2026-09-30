'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useApp } from './app-context';

/**
 * GET a JSON endpoint and keep it fresh: re-fetches when the URL changes and after any
 * create/edit/delete anywhere in the app (dataVersion). Stale responses are discarded.
 */
export function useRemote<T>(url: string | null, opts: { keepPrevious?: boolean } = {}) {
  const { dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const my = ++seq.current;
    const ctrl = new AbortController();
    setLoading(true);
    if (!opts.keepPrevious) setData(null);
    api<T>(url, { signal: ctrl.signal }).then((res) => {
      if (my !== seq.current) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else if (res.code !== 'aborted') {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, dataVersion, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}

/** Debounced value — search boxes wait for the user to pause typing. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}
