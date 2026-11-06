// Extensible permission model: page keys + action keys + optional own-scope keys, stored as strings on the user.
export const PAGES = ['dashboard', 'customers', 'beneficiaries', 'inventory', 'pos', 'invoices', 'expenses', 'vault', 'reports', 'settings'] as const;
export type Page = (typeof PAGES)[number];

export const ACTIONS = ['canEditExchangeRate'] as const;
export type Action = (typeof ACTIONS)[number];

export type PermUser = { isOwner: boolean; permissions: string[]; hasPersonalVault?: boolean };

export const pageKey = (p: Page) => `page:${p}`;
export const actionKey = (a: Action) => `action:${a}`;
export const scopeOwnKey = (p: Page) => `scope:${p}:own`;

export function canPage(u: PermUser | null | undefined, p: Page): boolean {
  if (!u) return false;
  return u.isOwner || u.permissions.includes(pageKey(p));
}
export function canAnyPage(u: PermUser | null | undefined, ps: readonly Page[]): boolean {
  return ps.some((p) => canPage(u, p));
}
export function canAction(u: PermUser | null | undefined, a: Action): boolean {
  if (!u) return false;
  return u.isOwner || u.permissions.includes(actionKey(a));
}

/** Own-only data on this page (staff). Owner is never scoped. */
export function isOwnScope(u: PermUser | null | undefined, p: Page): boolean {
  if (!u || u.isOwner) return false;
  return u.permissions.includes(scopeOwnKey(p));
}

/** Only known keys survive — users cannot smuggle arbitrary strings in. */
export function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>([
    ...PAGES.map(pageKey),
    ...PAGES.map(scopeOwnKey),
    ...ACTIONS.map(actionKey),
  ]);
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && allowed.has(x)))];
}

/**
 * Normalize staff permissions: vault page requires personal vault; vault is always own-scoped for staff;
 * drop scope keys for pages that aren't granted.
 */
export function normalizeStaffPermissions(permissions: string[], hasPersonalVault: boolean): string[] {
  let perms = sanitizePermissions(permissions);
  if (!hasPersonalVault) {
    perms = perms.filter((p) => p !== pageKey('vault') && p !== scopeOwnKey('vault'));
  } else if (perms.includes(pageKey('vault'))) {
    if (!perms.includes(scopeOwnKey('vault'))) perms = [...perms, scopeOwnKey('vault')];
  }
  const pages = new Set(PAGES.filter((p) => perms.includes(pageKey(p))));
  perms = perms.filter((k) => {
    if (!k.startsWith('scope:') || !k.endsWith(':own')) return true;
    const page = k.slice('scope:'.length, -':own'.length) as Page;
    return pages.has(page);
  });
  return sanitizePermissions(perms);
}

export const PAGE_HREF: Record<Page, string> = {
  dashboard: '/dashboard',
  customers: '/customers',
  beneficiaries: '/beneficiaries',
  inventory: '/inventory',
  pos: '/pos',
  invoices: '/invoices',
  expenses: '/expenses',
  vault: '/vault',
  reports: '/reports',
  settings: '/settings',
};

export function firstAllowedHref(u: PermUser): string {
  for (const p of PAGES) if (canPage(u, p)) return PAGE_HREF[p];
  return '/no-access';
}
