'use client';
import { useEffect, useState } from 'react';

// Paper size for printed / downloaded documents (A5 default, or A4). A per-computer preference kept in this
// browser; every print, PDF download and folder auto-save uses it.

export type Paper = 'A5' | 'A4';
const KEY = 'alu:paper';
const EVENT = 'alu:paper';

export function getPaper(): Paper {
  try {
    return localStorage.getItem(KEY) === 'A4' ? 'A4' : 'A5';
  } catch {
    return 'A5';
  }
}

export function setPaper(p: Paper) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

/** URL of a transaction document in the chosen size. */
export const docUrl = (id: string, format: 'pdf' | 'html', size: Paper = getPaper()) => `/api/docs/txn/${encodeURIComponent(id)}?format=${format}&size=${size}`;

export function usePaper(): [Paper, (p: Paper) => void] {
  const [p, setP] = useState<Paper>('A5');
  useEffect(() => {
    setP(getPaper());
    const on = (e: Event) => setP((e as CustomEvent<Paper>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [p, setPaper];
}
