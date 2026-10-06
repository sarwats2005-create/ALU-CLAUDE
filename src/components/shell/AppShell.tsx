'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  LogOut,
  Ellipsis,
  Menu,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { AppProvider, useApp, type ClientUser } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { PAGES, PAGE_HREF, type Page } from '@/lib/permissions';
import type { DictKey, Lang } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Logo } from '../Logo';
import { ToastProvider } from '../Toast';
import { AlertsBell } from '../AlertsBell';
import { ExchangeRateFab } from '../ExchangeRateFab';
import { Dialog } from '../Dialog';
import { Segmented } from '../ui';
import { TxnPanelProvider } from '../TxnPanel';
import { MoneyGuardProvider } from '../MoneyGuard';
import { EraseProvider } from '../EraseMode';
import { useToast } from '../Toast';
import { runWeeklyBackupIfDue } from '@/lib/client/backup-folder';

const NAV: Record<Page, { icon: LucideIcon; label: DictKey; short?: DictKey }> = {
  dashboard: { icon: LayoutDashboard, label: 'nav.dashboard' },
  customers: { icon: Users, label: 'nav.customers' },
  beneficiaries: { icon: Truck, label: 'nav.beneficiaries' },
  inventory: { icon: Boxes, label: 'nav.inventory' },
  pos: { icon: ShoppingCart, label: 'nav.pos', short: 'nav.posShort' },
  invoices: { icon: ReceiptText, label: 'nav.invoices' },
  expenses: { icon: Wallet, label: 'nav.expenses' },
  vault: { icon: Vault, label: 'nav.vault' },
  reports: { icon: BarChart3, label: 'nav.reports' },
  settings: { icon: Settings, label: 'nav.settings' },
};
const TAB_PRIORITY: Page[] = ['dashboard', 'customers', 'pos', 'invoices', 'inventory', 'beneficiaries', 'expenses', 'vault', 'reports', 'settings'];

export function AppShell(props: { user: ClientUser; lang: Lang; rate: string; company: string; children: ReactNode }) {
  return (
    <AppProvider user={props.user} lang={props.lang} rate={props.rate} company={props.company}>
      <ToastProvider>
        <EraseProvider>
          <TxnPanelProvider>
            <MoneyGuardProvider>
              <Shell>{props.children}</Shell>
            </MoneyGuardProvider>
          </TxnPanelProvider>
        </EraseProvider>
      </ToastProvider>
    </AppProvider>
  );
}

function usePrefs() {
  const router = useRouter();
  const { lang } = useApp();
  return {
    setLang: async (l: Lang) => {
      if (l === lang) return;
      await api('/api/auth/lang', { method: 'PUT', body: { lang: l } });
      router.refresh();
    },
    logout: async () => {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    },
  };
}

function PrefControls({ onBrand }: { onBrand?: boolean }) {
  const { t, lang } = useApp();
  const p = usePrefs();
  return (
    <div className="flex flex-col gap-2">
      <div dir="ltr" className={cx(onBrand && '[&_[role=radiogroup]]:bg-sidebar-active [&_[aria-checked=false]]:text-sidebar-muted')}>
        <Segmented<Lang>
          label={t('nav.language')}
          size="sm"
          className="w-full"
          value={lang}
          onChange={p.setLang}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'ku', label: <span lang="ckb">کوردی</span> },
          ]}
        />
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t, can, user } = useApp();
  const pathname = usePathname();
  const prefs = usePrefs();
  const [moreOpen, setMoreOpen] = useState(false);
  const allowed = PAGES.filter((p) => can(p));
  const isActive = (p: Page) => pathname === PAGE_HREF[p] || pathname.startsWith(PAGE_HREF[p] + '/');

  const ordered = TAB_PRIORITY.filter((p) => allowed.includes(p));
  const tabs = ordered.length > 5 ? ordered.slice(0, 4) : ordered;
  const overflow = ordered.length > 5 ? ordered.slice(4) : [];

  useEffect(() => setMoreOpen(false), [pathname]);

  // Sidebar starts collapsed on every load. On phones/tablets (drawer) a page change closes it,
  // because the drawer would otherwise hide the page you just opened.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023.98px)').matches) setExpanded(false);
  }, [pathname]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>

      {/* Sidebar. Desktop: a collapsed icon rail by default; the hamburger expands it over the page.
          Phones/tablets: hidden by default; the hamburger in the top bar slides it in.
          Once open it closes only by tapping/clicking outside it (or Escape). Logical start/end → RTL-safe. */}
      {expanded ? (
        <div aria-hidden="true" onClick={() => setExpanded(false)} className="anim-fade fixed inset-0 z-[39] bg-black/30" />
      ) : null}
      <aside
        id="app-sidebar"
        aria-label={t('nav.menu')}
        className={cx(
          'fixed inset-y-0 start-0 z-40 flex w-[17rem] flex-col bg-sidebar text-sidebar-ink motion-safe:transition-[width,transform] motion-safe:duration-200 motion-safe:ease-out',
          expanded ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:w-[72px] lg:translate-x-0 lg:rtl:translate-x-0',
        )}
      >
        {/* Poster-style decoration: large flat shapes at low opacity behind the menu. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <span className="absolute -bottom-28 -start-28 h-80 w-80 rounded-full bg-white/[0.07]" />
          <span className="absolute -end-16 top-1/3 h-40 w-40 rotate-45 rounded-card bg-white/[0.05]" />
        </div>
        <div className="flex h-[80px] shrink-0 items-center gap-2 px-2">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={expanded}
            aria-controls="app-sidebar"
            title={expanded ? undefined : t('nav.openMenu')}
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-ctl text-sidebar-ink transition-all duration-200 hover:scale-105 hover:bg-sidebar-active"
          >
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <span className={cx('flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap transition-opacity', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            <Logo size={28} framed />
            <span className="truncate text-[17px] font-extrabold tracking-[0.02em]" dir="ltr">
              ALU FACTORY
            </span>
          </span>
          {expanded ? <AlertsBell onBrand align="end" /> : null}
        </div>
        {!expanded ? (
          <div className="hidden px-2 pb-2 lg:block">
            <AlertsBell onBrand align="start" />
          </div>
        ) : null}
        <nav aria-label={t('nav.menu')} className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-2">
          <ul className="flex flex-col gap-1">
            {allowed.map((p) => {
              const Icon = NAV[p].icon;
              const active = isActive(p);
              const label = t(NAV[p].label);
              return (
                <li key={p}>
                  <Link
                    href={PAGE_HREF[p]}
                    aria-current={active ? 'page' : undefined}
                    aria-label={expanded ? undefined : label}
                    title={expanded ? undefined : label}
                    className={cx(
                      'flex h-14 items-center gap-3 overflow-hidden whitespace-nowrap rounded-ctl px-[17px] text-body font-semibold transition-all duration-200',
                      active ? 'bg-white text-brand-ink' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink',
                    )}
                  >
                    <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                    <span className={cx('truncate transition-opacity', expanded ? 'opacity-100' : 'opacity-0')}>{label}</span>
                  </Link>
                </li>
              );
            })}
            {/* "How the app works" — open to every signed-in user, not a permission page. */}
            <li className="mt-3">
              <Link
                href="/about"
                aria-current={pathname === '/about' ? 'page' : undefined}
                aria-label={expanded ? undefined : t('nav.about')}
                title={expanded ? undefined : t('nav.about')}
                className={cx(
                  'flex h-14 items-center gap-3 overflow-hidden whitespace-nowrap rounded-ctl px-[17px] text-body font-semibold transition-all duration-200',
                  pathname === '/about' ? 'bg-white text-brand-ink' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink',
                )}
              >
                <Info className="h-[22px] w-[22px] shrink-0" strokeWidth={pathname === '/about' ? 2.5 : 2} aria-hidden="true" />
                <span className={cx('truncate transition-opacity', expanded ? 'opacity-100' : 'opacity-0')}>{t('nav.about')}</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className={cx('flex flex-col gap-3 bg-black/10 pb-5 pt-4', expanded ? 'px-4' : 'items-center px-2')}>
          {expanded ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-meta font-bold text-brand-ink" aria-hidden="true">
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="bidi truncate text-meta font-semibold">{user.name}</p>
                  <p className="truncate text-caption text-sidebar-muted" dir="ltr">
                    {user.isOwner ? t('common.owner') : user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={prefs.logout}
                  aria-label={t('nav.logout')}
                  title={t('nav.logout')}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-ctl text-sidebar-muted transition-all duration-200 hover:scale-105 hover:bg-sidebar-active hover:text-sidebar-ink"
                >
                  <LogOut className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </button>
              </div>
              <PrefControls onBrand />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                title={user.name}
                aria-label={user.name}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-meta font-bold text-brand-ink transition-all duration-200 hover:scale-105"
              >
                {initials(user.name)}
              </button>
              <button
                type="button"
                onClick={prefs.logout}
                aria-label={t('nav.logout')}
                title={t('nav.logout')}
                className="inline-flex h-14 w-14 items-center justify-center rounded-ctl text-sidebar-muted transition-all duration-200 hover:scale-105 hover:bg-sidebar-active hover:text-sidebar-ink"
              >
                <LogOut className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-2 bg-surface px-2 lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('nav.openMenu')}
          aria-expanded={expanded}
          aria-controls="app-sidebar"
          className="inline-flex h-14 w-14 items-center justify-center rounded-ctl text-ink transition-all duration-200 hover:scale-105 hover:bg-surface-2"
        >
          <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
        <Logo size={28} />
        <span className="flex-1 text-[17px] font-extrabold tracking-[0.02em] text-ink" dir="ltr">
          ALU FACTORY
        </span>
        <AlertsBell />
      </header>

      <div className="lg:ps-[72px]">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 pb-32 pt-5 outline-none md:px-6 lg:px-8 lg:pb-20 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Mobile / tablet bottom tabs */}
      <nav aria-label={t('nav.menu')} className="safe-bottom fixed inset-x-0 bottom-0 z-30 bg-surface lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((p) => {
            const Icon = NAV[p].icon;
            const active = isActive(p);
            return (
              <li key={p} className="flex-1">
                <Link
                  href={PAGE_HREF[p]}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition-colors duration-200', active ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink')}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="max-w-full truncate px-1">{t(NAV[p].short ?? NAV[p].label)}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cx('flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition-colors duration-200', overflow.some(isActive) || pathname === '/about' ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink')}
            >
              <Ellipsis className="h-[22px] w-[22px]" aria-hidden="true" />
              <span>{t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} size="sm">
        <ul className="-mx-2 flex flex-col">
          {overflow.map((p) => {
            const Icon = NAV[p].icon;
            return (
              <li key={p}>
                <Link href={PAGE_HREF[p]} className="flex h-14 items-center gap-3 rounded-ctl px-3 text-lead font-semibold text-ink transition-colors duration-200 hover:bg-tint">
                  <Icon className="h-5 w-5 text-brand-ink" aria-hidden="true" />
                  {t(NAV[p].label)}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/about" className="flex h-14 items-center gap-3 rounded-ctl px-3 text-lead font-semibold text-ink transition-colors duration-200 hover:bg-tint">
              <Info className="h-5 w-5 text-brand-ink" aria-hidden="true" />
              {t('nav.about')}
            </Link>
          </li>
        </ul>
        <div className={cx('mt-4 flex flex-col gap-3 border-t border-line-soft pt-4')}>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tint text-meta font-bold text-brand-ink" aria-hidden="true">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="bidi truncate text-body font-semibold text-ink">{user.name}</p>
              <p className="truncate text-caption text-muted" dir="ltr">
                {user.email}
              </p>
            </div>
          </div>
          <PrefControls />
          <button type="button" onClick={prefs.logout} className="flex h-14 items-center justify-center gap-2 rounded-ctl bg-danger-tint text-body font-semibold text-danger-ink transition-all duration-200 hover:scale-105 hover:bg-[#fee2e2]">
            <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </div>
      </Dialog>

      <ExchangeRateFab />
      {user.isOwner ? <WeeklyBackup /> : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** Owner only: when the app opens, saves this week's backup into the chosen folder if it's due. */
function WeeklyBackup() {
  const { t } = useApp();
  const toast = useToast();
  useEffect(() => {
    const id = window.setTimeout(() => {
      void runWeeklyBackupIfDue().then((r) => {
        if (r.status === 'saved') toast.success(t('bk.weeklyDone', { file: r.file }));
        else if (r.status === 'needs-access') {
          let shown = false;
          try {
            shown = sessionStorage.getItem('alu:backup-nag') === '1';
            sessionStorage.setItem('alu:backup-nag', '1');
          } catch {
            /* private mode: just show it */
          }
          if (!shown) toast.error(t('bk.weeklyWaiting'));
        }
      });
    }, 4000);
    return () => window.clearTimeout(id);
  }, [t, toast]);
  return null;
}
