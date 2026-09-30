// Extensible permission model: page keys + action keys, stored as strings on the user.
export const PAGES = ['dashboard', 'customers', 'beneficiaries', 'inventory', 'pos', 'vault', 'reports', 'settings'] as const;
export type Page = (typeof PAGES)[number];

export const ACTIONS = ['canEditExchangeRate'] as const;
export type Action = (typeof ACTIONS)[number];

export type PermUser = { isOwner: boolean; permissions: string[] };

export const pageKey = (p: Page) => `page:${p}`;
export const actionKey = (a: Action) => `action:${a}`;

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

/** Only known keys survive — users cannot smuggle arbitrary strings in. */
export function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>([...PAGES.map(pageKey), ...ACTIONS.map(actionKey)]);
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && allowed.has(x)))];
}

export const PAGE_HREF: Record<Page, string> = {
  dashboard: '/dashboard',
  customers: '/customers',
  beneficiaries: '/beneficiaries',
  inventory: '/inventory',
  pos: '/pos',
  vault: '/vault',
  reports: '/reports',
  settings: '/settings',
};

export function firstAllowedHref(u: PermUser): string {
  for (const p of PAGES) if (canPage(u, p)) return PAGE_HREF[p];
  return '/no-access';
}
