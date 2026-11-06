import type { Page } from '@/lib/permissions';
import { canPage, type PermUser } from '@/lib/permissions';
import type { SessionUser } from './auth';

/** Own-only data scope for a page (`scope:<page>:own`). Owner is never scoped. */
export function scopeOwnKey(p: Page) {
  return `scope:${p}:own`;
}

export function isOwnScope(u: PermUser | null | undefined, p: Page): boolean {
  if (!u || u.isOwner) return false;
  return u.permissions.includes(scopeOwnKey(p));
}

/** Staff personal wallet id when they have one; owner / others → null (main). */
export function personalVaultId(u: Pick<SessionUser, 'id' | 'isOwner' | 'hasPersonalVault'> | null | undefined): string | null {
  if (!u || u.isOwner || !u.hasPersonalVault) return null;
  return u.id;
}

export { canPage };
