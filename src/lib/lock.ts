// Invoice edit window: a sale or purchase invoice can be edited or deleted for 24 hours after it is
// created. After that it is locked for everyone, the Owner included. Shared by the server (which enforces
// it) and the browser (which shows the countdown and hides the edit/delete buttons).
import { RULES, HOUR_MS } from './rules';

export const EDIT_WINDOW_MS = RULES.editWindowHours * HOUR_MS;

export const isInvoiceKind = (kind: string) => kind === 'SALE' || kind === 'PURCHASE';

/** When this invoice locks (ms since epoch), or null for transaction types that never lock. */
export function locksAt(kind: string, createdAt: string | Date): number | null {
  if (!isInvoiceKind(kind)) return null;
  return new Date(createdAt).getTime() + EDIT_WINDOW_MS;
}

export function isLocked(kind: string, createdAt: string | Date, now = Date.now()): boolean {
  const at = locksAt(kind, createdAt);
  return at !== null && now >= at;
}

/** Remaining edit time as hours + minutes (minutes rounded up so "0m" never shows while still open). */
export function remaining(kind: string, createdAt: string | Date, now = Date.now()): { h: number; m: number; ms: number } | null {
  const at = locksAt(kind, createdAt);
  if (at === null || now >= at) return null;
  const ms = at - now;
  const mins = Math.ceil(ms / 60000);
  return { h: Math.floor(mins / 60), m: mins % 60, ms };
}
