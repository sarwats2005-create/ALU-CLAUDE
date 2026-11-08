// Extensible permission model: page keys + action keys + activity keys, stored as strings on the user.
export const PAGES = ['dashboard', 'customers', 'beneficiaries', 'inventory', 'pos', 'invoices', 'expenses', 'employees', 'vault', 'reports', 'settings'] as const;
export type Page = (typeof PAGES)[number];

export const ACTIONS = ['canEditExchangeRate'] as const;
export type Action = (typeof ACTIONS)[number];

export type PermUser = { isOwner: boolean; permissions: string[]; hasPersonalVault?: boolean };

export const pageKey = (p: Page) => `page:${p}`;
export const actionKey = (a: Action) => `action:${a}`;

/**
 * Pages that list documents. A staff user sees only the documents they created on these pages, unless the
 * owner switches on "see everyone's activity" for that page (`activity:<page>`). All off by default.
 */
export const ACTIVITY_PAGES = ['invoices', 'customers', 'beneficiaries', 'expenses', 'reports', 'dashboard'] as const;
export type ActivityPage = (typeof ACTIVITY_PAGES)[number];
export const activityKey = (p: ActivityPage) => `activity:${p}`;

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

/** True when this user sees everyone's documents on the page (owner always); false = only their own. */
export function seesAll(u: PermUser | null | undefined, p: ActivityPage): boolean {
  if (!u) return false;
  return u.isOwner || u.permissions.includes(activityKey(p));
}

/** Profit, cost of goods and P&L are owner only. */
export const seesProfit = (u: PermUser | null | undefined) => !!u?.isOwner;

/** Only known keys survive — users cannot smuggle arbitrary strings in. */
export function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>([...PAGES.map(pageKey), ...ACTIVITY_PAGES.map(activityKey), ...ACTIONS.map(actionKey)]);
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && allowed.has(x)))];
}

/** Staff permissions: an activity key only counts for a page the user can open. */
export function normalizeStaffPermissions(permissions: string[]): string[] {
  const perms = sanitizePermissions(permissions);
  return perms.filter((k) => !k.startsWith('activity:') || perms.includes(`page:${k.slice('activity:'.length)}`));
}

export const PAGE_HREF: Record<Page, string> = {
  dashboard: '/dashboard',
  customers: '/customers',
  beneficiaries: '/beneficiaries',
  inventory: '/inventory',
  pos: '/pos',
  invoices: '/invoices',
  expenses: '/expenses',
  employees: '/employees',
  vault: '/vault',
  reports: '/reports',
  settings: '/settings',
};

export function firstAllowedHref(u: PermUser): string {
  for (const p of PAGES) if (canPage(u, p)) return PAGE_HREF[p];
  return '/no-access';
}
