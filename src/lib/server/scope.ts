import type { SessionUser } from './auth';

import type { TxnKind } from '@prisma/client';
import { seesAll, type ActivityPage, type PermUser } from '@/lib/permissions';

export { canPage, seesAll, seesProfit } from '@/lib/permissions';

/** The activity toggles under which a document of this kind shows up. */
const ACTIVITY_OF: Partial<Record<TxnKind, ActivityPage[]>> = {
  SALE: ['invoices', 'customers', 'dashboard'],
  PURCHASE: ['invoices', 'beneficiaries', 'dashboard'],
  CUSTOMER_PAYMENT: ['customers', 'dashboard'],
  CUSTOMER_REFUND: ['customers', 'dashboard'],
  BENEFICIARY_PAYMENT: ['beneficiaries', 'dashboard'],
  BENEFICIARY_REFUND: ['beneficiaries', 'dashboard'],
  EXPENSE: ['expenses', 'dashboard'],
  // Vault movements are never shown to staff unless they are in the staff user's own vault.
  VAULT_DEPOSIT: [],
  VAULT_WITHDRAWAL: [],
  VAULT_TRANSFER: [],
  USER_VAULT_FUND: [],
  USER_VAULT_COLLECT: [],
};

/** Kinds whose other-people's documents staff never see, even with an activity toggle on. */
export const VAULT_ONLY_KINDS: TxnKind[] = ['VAULT_DEPOSIT', 'VAULT_WITHDRAWAL', 'VAULT_TRANSFER', 'USER_VAULT_FUND', 'USER_VAULT_COLLECT'];

/** Can this user open someone else's document? Owner: always. Staff: own documents, or with the matching toggle. */
export function canSeeTxn(u: PermUser & { id: string }, t: { kind: TxnKind; createdById: string | null; vaultOwnerUserId?: string | null }) {
  if (u.isOwner) return true;
  if (t.createdById === u.id || t.vaultOwnerUserId === u.id) return true;
  return (ACTIVITY_OF[t.kind] ?? ['dashboard']).some((p) => seesAll(u, p));
}

/**
 * Which vault a user's money goes through: null = the main factory vault (owner only); a staff user always
 * works from their own personal USD + IQD vault and never touches the main vault.
 */
export function personalVaultId(u: Pick<SessionUser, 'id' | 'isOwner'> | null | undefined): string | null {
  if (!u || u.isOwner) return null;
  return u.id;
}
