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
  Sun,
  Moon,
  MonitorSmartphone,
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

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  document.cookie = `alu_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function readTheme(): Theme {
  const m = /(?:^|; )alu_theme=([^;]+)/.exec(document.cookie);
  return m && (m[1] === 'light' || m[1] === 'dark') ? m[1] : 'system';
}

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
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
  return {
    theme,
    setTheme: (th: Theme) => {
      setTheme(th);
      applyTheme(th);
    },
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
      <div className={cx(onBrand && '[&_[role=radiogroup]]:bg-sidebar-active [&_[aria-checked=false]]:text-sidebar-muted')}>
        <Segmented<Theme>
          label={t('nav.theme')}
          size="sm"
          className="w-full"
          value={p.theme}
          onChange={p.setTheme}
          options={[
            { value: 'light', label: <Sun className="mx-auto h-4 w-4" aria-label={t('nav.themeLight')} /> },
            { value: 'dark', label: <Moon className="mx-auto h-4 w-4" aria-label={t('nav.themeDark')} /> },
            { value: 'system', label: <MonitorSmartphone className="mx-auto h-4 w-4" aria-label={t('nav.themeSystem')} /> },
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
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
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
          expanded ? 'translate-x-0 shadow-pop' : '-translate-x-full rtl:translate-x-full lg:w-[72px] lg:translate-x-0 lg:rtl:translate-x-0',
        )}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-2 px-3.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('nav.openMenu')}
            aria-expanded={expanded}
            aria-controls="app-sidebar"
            title={expanded ? undefined : t('nav.openMenu')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-sidebar-ink hover:bg-sidebar-active"
          >
            <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <span className={cx('flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap transition-opacity', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            <Logo size={28} framed />
            <span className="truncate text-[14px] font-extrabold tracking-[0.03em]" dir="ltr">
              ALU FACTORY
            </span>
          </span>
          {expanded ? <AlertsBell onBrand align="end" /> : null}
        </div>
        {!expanded ? (
          <div className="hidden px-3.5 pb-2 lg:block">
            <AlertsBell onBrand align="start" />
          </div>
        ) : null}
        <nav aria-label={t('nav.menu')} className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-3">
          <ul className="flex flex-col gap-0.5">
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
                      'flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-ctl px-3.5 text-body font-medium transition-colors',
                      active ? 'bg-sidebar-active text-sidebar-ink' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink',
                    )}
                  >
                    <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                    <span className={cx('truncate transition-opacity', expanded ? 'opacity-100' : 'opacity-0')}>{label}</span>
                  </Link>
                </li>
              );
            })}
            {/* "How the app works" — open to every signed-in user, not a permission page. */}
            <li className="mt-2 border-t border-white/10 pt-2">
              <Link
                href="/about"
                aria-current={pathname === '/about' ? 'page' : undefined}
                aria-label={expanded ? undefined : t('nav.about')}
                title={expanded ? undefined : t('nav.about')}
                className={cx(
                  'flex h-11 items-center gap-3 overflow-hidden whitespace-nowrap rounded-ctl px-3.5 text-body font-medium transition-colors',
                  pathname === '/about' ? 'bg-sidebar-active text-sidebar-ink' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink',
                )}
              >
                <Info className="h-[19px] w-[19px] shrink-0" strokeWidth={pathname === '/about' ? 2.2 : 1.8} aria-hidden="true" />
                <span className={cx('truncate transition-opacity', expanded ? 'opacity-100' : 'opacity-0')}>{t('nav.about')}</span>
              </Link>
            </li>
          </ul>
        </nav>
        <div className={cx('flex flex-col gap-3 border-t border-white/15 pb-5 pt-4', expanded ? 'px-4' : 'items-center px-2')}>
          {expanded ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-meta font-bold" aria-hidden="true">
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-ctl text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink"
                >
                  <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
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
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-meta font-bold hover:bg-white/25"
              >
                {initials(user.name)}
              </button>
              <button
                type="button"
                onClick={prefs.logout}
                aria-label={t('nav.logout')}
                title={t('nav.logout')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-ctl text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink"
              >
                <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line-soft bg-glass px-2 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('nav.openMenu')}
          aria-expanded={expanded}
          aria-controls="app-sidebar"
          className="inline-flex h-11 w-11 items-center justify-center rounded-ctl text-ink hover:bg-tint"
        >
          <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
        <Logo size={28} />
        <span className="flex-1 text-[15px] font-extrabold tracking-[0.06em] text-ink" dir="ltr">
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
      <nav aria-label={t('nav.menu')} className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-glass backdrop-blur-xl lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((p) => {
            const Icon = NAV[p].icon;
            const active = isActive(p);
            return (
              <li key={p} className="flex-1">
                <Link
                  href={PAGE_HREF[p]}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-brand-ink' : 'text-muted')}
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
              className={cx('flex h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', overflow.some(isActive) || pathname === '/about' ? 'text-brand-ink' : 'text-muted')}
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
                <Link href={PAGE_HREF[p]} className="flex h-12 items-center gap-3 rounded-ctl px-2 text-lead font-medium text-ink hover:bg-tint">
                  <Icon className="h-5 w-5 text-brand-ink" aria-hidden="true" />
                  {t(NAV[p].label)}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/about" className="flex h-12 items-center gap-3 rounded-ctl px-2 text-lead font-medium text-ink hover:bg-tint">
              <Info className="h-5 w-5 text-brand-ink" aria-hidden="true" />
              {t('nav.about')}
            </Link>
          </li>
        </ul>
        <div className={cx('mt-4 flex flex-col gap-3 border-t border-line-soft pt-4')}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-meta font-bold text-brand-ink" aria-hidden="true">
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
          <button type="button" onClick={prefs.logout} className="flex h-11 items-center justify-center gap-2 rounded-ctl border border-line text-body font-semibold text-danger-ink hover:bg-danger-tint">
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
