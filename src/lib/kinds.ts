// Which page owns each transaction type (drives edit/delete permission in UI and API).
import type { Page } from './permissions';

export type Kind =
  | 'SALE'
  | 'PURCHASE'
  | 'CUSTOMER_PAYMENT'
  | 'CUSTOMER_REFUND'
  | 'BENEFICIARY_PAYMENT'
  | 'BENEFICIARY_REFUND'
  | 'VAULT_DEPOSIT'
  | 'VAULT_WITHDRAWAL'
  | 'VAULT_TRANSFER'
  | 'PROCESSING'
  | 'EXPENSE';

export const KINDS: Kind[] = [
  'SALE',
  'PURCHASE',
  'CUSTOMER_PAYMENT',
  'CUSTOMER_REFUND',
  'BENEFICIARY_PAYMENT',
  'BENEFICIARY_REFUND',
  'VAULT_DEPOSIT',
  'VAULT_WITHDRAWAL',
  'VAULT_TRANSFER',
  'PROCESSING',
  'EXPENSE',
];

export const KIND_PAGE: Record<Kind, Page> = {
  SALE: 'pos',
  PURCHASE: 'beneficiaries',
  CUSTOMER_PAYMENT: 'customers',
  CUSTOMER_REFUND: 'customers',
  BENEFICIARY_PAYMENT: 'beneficiaries',
  BENEFICIARY_REFUND: 'beneficiaries',
  VAULT_DEPOSIT: 'vault',
  VAULT_WITHDRAWAL: 'vault',
  VAULT_TRANSFER: 'vault',
  PROCESSING: 'inventory',
  EXPENSE: 'expenses',
};

/** Pages from which a transaction of this kind may be viewed (its own page, the dashboard, and party pages). */
export function viewPages(kind: Kind): Page[] {
  const own = KIND_PAGE[kind];
  const extra: Page[] = ['dashboard'];
  if (kind === 'SALE') extra.push('customers');
  if (kind.startsWith('CUSTOMER')) extra.push('customers');
  if (kind === 'PURCHASE' || kind.startsWith('BENEFICIARY')) extra.push('beneficiaries', 'inventory');
  if (kind === 'PROCESSING') extra.push('inventory');
  if (kind === 'SALE' || kind === 'PURCHASE') extra.push('invoices');
  extra.push('vault');
  return [...new Set([own, ...extra])];
}

/** Where the edit form for a transaction lives. */
export function editHref(kind: Kind, id: string, partyId?: string | null): string {
  switch (kind) {
    case 'SALE':
      return `/pos?edit=${id}`;
    case 'PURCHASE':
      return `/beneficiaries/purchase?edit=${id}`;
    case 'CUSTOMER_PAYMENT':
    case 'CUSTOMER_REFUND':
      return `/customers/${partyId}?edit=${id}`;
    case 'BENEFICIARY_PAYMENT':
    case 'BENEFICIARY_REFUND':
      return `/beneficiaries/${partyId}?edit=${id}`;
    case 'PROCESSING':
      return `/inventory?edit=${id}`;
    case 'EXPENSE':
      return `/expenses?edit=${id}`;
    default:
      return `/vault?edit=${id}`;
  }
}

export type DocKind = 'invoice' | 'receipt' | 'voucher';
export function docKindOf(kind: Kind): DocKind {
  if (kind === 'SALE') return 'invoice';
  if (kind.startsWith('CUSTOMER') || kind.startsWith('BENEFICIARY')) return 'receipt';
  return 'voucher';
}
