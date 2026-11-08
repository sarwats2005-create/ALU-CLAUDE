import {
  LayoutDashboard,
  Users,
  Truck,
  Boxes,
  ShoppingCart,
  ReceiptText,
  Wallet,
  Vault,
  BarChart3,
  Settings,
  Info,
  History,
  PackagePlus,
  CircleDollarSign,
  IdCard,
  type LucideIcon,
} from 'lucide-react';
import { PAGE_HREF, type Page } from '@/lib/permissions';
import type { DictKey } from '@/lib/i18n';

/** Route matchers — keep siblings from fighting for the same active state. */
export type PathMatch = (pathname: string) => boolean;

export type NavLeaf = {
  id: string;
  href: string;
  label: DictKey;
  icon?: LucideIcon;
  /** Permission page key; omit for always-visible links (e.g. about). */
  page?: Page;
  match: PathMatch;
  short?: DictKey;
};

export type NavGroup = {
  id: string;
  type: 'group';
  label: DictKey;
  icon: LucideIcon;
  /** Permission gate for the whole group. */
  page: Page;
  /** Default destination when the group icon is clicked while collapsed. */
  href: string;
  children: NavLeaf[];
};

export type NavLink = NavLeaf & { type: 'link'; icon: LucideIcon };

export type NavEntry = NavLink | NavGroup;

export type NavSection = {
  id: string;
  label?: DictKey;
  entries: NavEntry[];
};

const exact =
  (href: string): PathMatch =>
  (p) =>
    p === href;

const prefix =
  (href: string): PathMatch =>
  (p) =>
    p === href || p.startsWith(`${href}/`);

/** `/beneficiaries` + detail pages, but not `/beneficiaries/purchase`. */
const beneficiariesRoot: PathMatch = (p) => p === '/beneficiaries' || /^\/beneficiaries\/(?!purchase(?:\/|$))/.test(p);

/** `/vault` + nested (history, etc.), but not `/vault/dues`. */
const vaultRoot: PathMatch = (p) => p === '/vault' || (p.startsWith('/vault/') && !p.startsWith('/vault/dues'));

/**
 * Centralized app navigation. Only real destinations — never invent pages.
 * Nested groups mirror existing sub-routes (history, purchase, dues).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'main',
    label: 'nav.sectionMain',
    entries: [
      {
        type: 'group',
        id: 'dashboard',
        label: 'nav.dashboard',
        icon: LayoutDashboard,
        page: 'dashboard',
        href: PAGE_HREF.dashboard,
        children: [
          { id: 'dashboard-home', href: PAGE_HREF.dashboard, label: 'nav.overview', page: 'dashboard', match: exact('/dashboard'), icon: LayoutDashboard },
          { id: 'dashboard-history', href: '/dashboard/history', label: 'nav.history', page: 'dashboard', match: prefix('/dashboard/history'), icon: History },
        ],
      },
      {
        type: 'link',
        id: 'customers',
        href: PAGE_HREF.customers,
        label: 'nav.customers',
        icon: Users,
        page: 'customers',
        match: prefix(PAGE_HREF.customers),
      },
      {
        type: 'group',
        id: 'beneficiaries',
        label: 'nav.beneficiaries',
        icon: Truck,
        page: 'beneficiaries',
        href: PAGE_HREF.beneficiaries,
        children: [
          { id: 'beneficiaries-home', href: PAGE_HREF.beneficiaries, label: 'nav.beneficiaries', page: 'beneficiaries', match: beneficiariesRoot, icon: Truck },
          { id: 'beneficiaries-purchase', href: '/beneficiaries/purchase', label: 'nav.purchases', page: 'beneficiaries', match: prefix('/beneficiaries/purchase'), icon: PackagePlus },
        ],
      },
      {
        type: 'link',
        id: 'inventory',
        href: PAGE_HREF.inventory,
        label: 'nav.inventory',
        icon: Boxes,
        page: 'inventory',
        match: prefix(PAGE_HREF.inventory),
      },
      {
        type: 'link',
        id: 'pos',
        href: PAGE_HREF.pos,
        label: 'nav.pos',
        short: 'nav.posShort',
        icon: ShoppingCart,
        page: 'pos',
        match: prefix(PAGE_HREF.pos),
      },
      {
        type: 'link',
        id: 'invoices',
        href: PAGE_HREF.invoices,
        label: 'nav.invoices',
        icon: ReceiptText,
        page: 'invoices',
        match: prefix(PAGE_HREF.invoices),
      },
      {
        type: 'link',
        id: 'expenses',
        href: PAGE_HREF.expenses,
        label: 'nav.expenses',
        icon: Wallet,
        page: 'expenses',
        match: prefix(PAGE_HREF.expenses),
      },
      {
        type: 'link',
        id: 'employees',
        href: PAGE_HREF.employees,
        label: 'nav.employees',
        icon: IdCard,
        page: 'employees',
        match: prefix(PAGE_HREF.employees),
      },
      {
        type: 'group',
        id: 'vault',
        label: 'nav.vault',
        icon: Vault,
        page: 'vault',
        href: PAGE_HREF.vault,
        children: [
          { id: 'vault-home', href: PAGE_HREF.vault, label: 'nav.vault', page: 'vault', match: vaultRoot, icon: Vault },
          { id: 'vault-dues', href: '/vault/dues', label: 'nav.dues', page: 'vault', match: prefix('/vault/dues'), icon: CircleDollarSign },
        ],
      },
      {
        type: 'link',
        id: 'reports',
        href: PAGE_HREF.reports,
        label: 'nav.reports',
        icon: BarChart3,
        page: 'reports',
        match: prefix(PAGE_HREF.reports),
      },
    ],
  },
  {
    id: 'manage',
    label: 'nav.sectionManage',
    entries: [
      {
        type: 'link',
        id: 'settings',
        href: PAGE_HREF.settings,
        label: 'nav.settings',
        icon: Settings,
        page: 'settings',
        match: prefix(PAGE_HREF.settings),
      },
    ],
  },
  {
    id: 'help',
    label: 'nav.sectionHelp',
    entries: [
      {
        type: 'link',
        id: 'about',
        href: '/about',
        label: 'nav.about',
        icon: Info,
        match: exact('/about'),
      },
    ],
  },
];

/** Flat permission pages still used by the mobile tab bar priority list. */
export const TAB_PRIORITY: Page[] = ['dashboard', 'customers', 'pos', 'invoices', 'inventory', 'beneficiaries', 'expenses', 'employees', 'vault', 'reports', 'settings'];

export const PAGE_NAV: Record<Page, { icon: LucideIcon; label: DictKey; short?: DictKey }> = {
  dashboard: { icon: LayoutDashboard, label: 'nav.dashboard' },
  customers: { icon: Users, label: 'nav.customers' },
  beneficiaries: { icon: Truck, label: 'nav.beneficiaries' },
  inventory: { icon: Boxes, label: 'nav.inventory' },
  pos: { icon: ShoppingCart, label: 'nav.pos', short: 'nav.posShort' },
  invoices: { icon: ReceiptText, label: 'nav.invoices' },
  expenses: { icon: Wallet, label: 'nav.expenses' },
  employees: { icon: IdCard, label: 'nav.employees' },
  vault: { icon: Vault, label: 'nav.vault' },
  reports: { icon: BarChart3, label: 'nav.reports' },
  settings: { icon: Settings, label: 'nav.settings' },
};

export function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.children.some((c) => c.match(pathname));
}

export function entryIsActive(entry: NavEntry, pathname: string): boolean {
  if (entry.type === 'group') return groupHasActive(entry, pathname);
  return entry.match(pathname);
}
