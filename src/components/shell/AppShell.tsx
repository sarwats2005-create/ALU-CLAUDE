'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Ellipsis, Menu, PanelLeftClose, PanelLeftOpen, Info } from 'lucide-react';
import { AppProvider, useApp, type ClientUser } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { PAGES, PAGE_HREF, type Page } from '@/lib/permissions';
import type { Lang } from '@/lib/i18n';
import { cx } from '@/lib/cx';
import { Logo } from '../Logo';
import { ToastProvider, useToast } from '../Toast';
import { AlertsBell } from '../AlertsBell';
import { ExchangeRateFab } from '../ExchangeRateFab';
import { Dialog } from '../Dialog';
import { Segmented } from '../ui';
import { TxnPanelProvider } from '../TxnPanel';
import { MoneyGuardProvider } from '../MoneyGuard';
import { EraseProvider } from '../EraseMode';
import { runWeeklyBackupIfDue } from '@/lib/client/backup-folder';
import { PAGE_NAV, TAB_PRIORITY, currentNavLabel } from './nav-config';
import { ThemeToggle } from './ThemeToggle';
import { SidebarNav, activeNavGroupIds } from './SidebarNav';
import { SidebarTooltip } from './SidebarTooltip';
import { useSidebarState } from './useSidebarState';

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

function PrefControls() {
  const { t, lang } = useApp();
  const p = usePrefs();
  return (
    <div className="flex flex-col gap-2">
      <div dir="ltr">
        <Segmented<Lang>
          label={t('nav.language')}
          size="sm"
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

  const activeGroups = useMemo(() => activeNavGroupIds(pathname, can), [pathname, can]);
  const sidebar = useSidebarState(pathname, activeGroups);

  const allowed = PAGES.filter((p) => can(p));
  const isActive = (p: Page) => pathname === PAGE_HREF[p] || pathname.startsWith(PAGE_HREF[p] + '/');
  const ordered = TAB_PRIORITY.filter((p) => allowed.includes(p));
  const tabs = ordered.length > 5 ? ordered.slice(0, 4) : ordered;
  const overflow = ordered.length > 5 ? ordered.slice(4) : [];

  useEffect(() => setMoreOpen(false), [pathname]);

  // Escape closes the mobile drawer (desktop collapse uses the toggle button).
  useEffect(() => {
    if (!sidebar.mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) sidebar.closeMobile();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebar.mobileOpen, sidebar.closeMobile]);

  // Keep the off-canvas drawer out of the tab order when closed on small screens.
  useEffect(() => {
    const el = document.getElementById('app-sidebar');
    if (!el) return;
    const mobile = window.matchMedia('(max-width: 1023.98px)').matches;
    if (mobile && !sidebar.mobileOpen) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [sidebar.mobileOpen, sidebar.hydrated]);

  // Desktop content inset follows collapse preference; mobile CSS forces --sidebar-offset: 0.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-offset',
      sidebar.desktopExpanded ? 'var(--sidebar-w-expanded)' : 'var(--sidebar-w-collapsed)',
    );
  }, [sidebar.desktopExpanded, sidebar.hydrated]);

  // Labels: always in the mobile drawer; desktop follows persisted expand preference.
  const showLabels = sidebar.mobileOpen || sidebar.desktopExpanded;

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>

      {/* Mobile backdrop */}
      {sidebar.mobileOpen ? (
        <div aria-hidden="true" onClick={sidebar.closeMobile} className="anim-fade fixed inset-0 z-[39] bg-black/30 lg:hidden" />
      ) : null}

      <aside
        id="app-sidebar"
        aria-label={t('nav.menu')}
        className={cx(
          'shell-sidebar fixed inset-y-0 start-0 z-40 flex flex-col text-sidebar-ink',
          'motion-safe:transition-[width,transform] motion-safe:duration-[var(--motion-panel)] motion-safe:ease-[var(--ease-out)]',
          // Mobile drawer always uses expanded width when present; desktop follows preference.
          showLabels ? 'w-[var(--sidebar-w-expanded)]' : 'w-[var(--sidebar-w-collapsed)]',
          !sidebar.desktopExpanded && 'lg:w-[var(--sidebar-w-collapsed)]',
          sidebar.desktopExpanded && 'lg:w-[var(--sidebar-w-expanded)]',
          // Off-canvas below lg; always docked on desktop.
          sidebar.mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0',
        )}
      >
        {/* Header: brand + collapse / close controls */}
        <div className={cx('flex h-14 shrink-0 items-center gap-2 border-b border-white/10', showLabels ? 'px-3' : 'justify-center px-2')}>
          <button
            type="button"
            onClick={sidebar.closeMobile}
            aria-label={t('nav.closeMenu')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-sidebar-ink motion-safe:transition-colors motion-safe:duration-[var(--motion-fast)] hover:bg-sidebar-active lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="hidden lg:inline-flex">
            <SidebarTooltip label={sidebar.desktopExpanded ? t('nav.collapse') : t('nav.expand')} enabled={!sidebar.desktopExpanded}>
              <button
                type="button"
                onClick={sidebar.toggleExpanded}
                aria-label={sidebar.desktopExpanded ? t('nav.collapse') : t('nav.expand')}
                aria-expanded={sidebar.desktopExpanded}
                aria-controls="app-sidebar"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-sidebar-ink motion-safe:transition-colors motion-safe:duration-[var(--motion-fast)] hover:bg-sidebar-active"
              >
                {sidebar.desktopExpanded ? <PanelLeftClose className="h-5 w-5 rtl:rotate-180" aria-hidden="true" /> : <PanelLeftOpen className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />}
              </button>
            </SidebarTooltip>
          </span>
          <span className={cx('flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap motion-safe:transition-opacity motion-safe:duration-[var(--motion-fast)]', showLabels ? 'opacity-100' : 'pointer-events-none w-0 flex-none opacity-0')}>
            <Logo size={28} framed />
            <span className="truncate text-body font-semibold tracking-[-0.01em] text-sidebar-ink" dir="ltr">
              ALU FACTORY
            </span>
          </span>
        </div>

        <SidebarNav
          pathname={pathname}
          showLabels={showLabels}
          openGroups={sidebar.openGroups}
          onToggleGroup={sidebar.toggleGroup}
          onNavigate={sidebar.closeMobile}
        />

        {/* User / prefs footer */}
        <div className={cx('flex flex-col gap-3 border-t border-white/10 pb-4 pt-3', showLabels ? 'px-3' : 'items-center px-2')}>
          {showLabels ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-meta font-semibold text-brand-ink" aria-hidden="true">
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
                  className="inline-flex h-11 w-11 items-center justify-center rounded-ctl text-sidebar-muted motion-safe:transition-colors motion-safe:duration-150 hover:bg-sidebar-active hover:text-sidebar-ink"
                >
                  <LogOut className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </button>
              </div>
              <PrefControls />
            </>
          ) : (
            <>
              <SidebarTooltip label={user.name} enabled>
                <button
                  type="button"
                  onClick={sidebar.toggleExpanded}
                  aria-label={user.name}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-tint text-meta font-semibold text-brand-ink"
                >
                  {initials(user.name)}
                </button>
              </SidebarTooltip>
              <SidebarTooltip label={t('nav.logout')} enabled>
                <button
                  type="button"
                  onClick={prefs.logout}
                  aria-label={t('nav.logout')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-ctl text-sidebar-muted motion-safe:transition-colors motion-safe:duration-150 hover:bg-sidebar-active hover:text-sidebar-ink"
                >
                  <LogOut className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </button>
              </SidebarTooltip>
            </>
          )}
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="glass-bar sticky top-0 z-30 flex h-12 items-center gap-2 px-2 lg:hidden">
        <button
          type="button"
          onClick={sidebar.openMobile}
          aria-label={t('nav.openMenu')}
          aria-expanded={sidebar.mobileOpen}
          aria-controls="app-sidebar"
          className="inline-flex h-11 w-11 items-center justify-center rounded-ctl text-ink motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-2"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Logo size={28} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink" dir="ltr">
          ALU FACTORY
        </span>
        <ThemeToggle />
        <AlertsBell />
      </header>

      <div className="motion-safe:transition-[padding] motion-safe:duration-[var(--motion-panel)] motion-safe:ease-[var(--ease-out)] lg:ps-[var(--sidebar-offset)]">
        <header className="glass-bar sticky top-0 z-20 hidden h-12 items-center gap-2 px-6 lg:flex">
          <p className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{t(currentNavLabel(pathname))}</p>
          <div dir="ltr" className="shrink-0">
            <PrefControls />
          </div>
          <ThemeToggle />
          <AlertsBell />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-5 outline-none md:px-6 lg:px-8 lg:pb-16 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Mobile / tablet bottom tabs */}
      <nav aria-label={t('nav.menu')} className="glass-bar safe-bottom fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((p) => {
            const Icon = PAGE_NAV[p].icon;
            const active = isActive(p);
            return (
              <li key={p} className="flex-1">
                <Link
                  href={PAGE_HREF[p]}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium motion-safe:transition-colors motion-safe:duration-150',
                    active ? 'text-brand-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="max-w-full truncate px-1">{t(PAGE_NAV[p].short ?? PAGE_NAV[p].label)}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cx(
                'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium motion-safe:transition-colors motion-safe:duration-150',
                overflow.some(isActive) || pathname === '/about' ? 'text-brand-ink' : 'text-muted hover:text-ink',
              )}
            >
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
              <span>{t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} size="sm">
        <ul className="-mx-2 flex flex-col">
          {overflow.map((p) => {
            const Icon = PAGE_NAV[p].icon;
            return (
              <li key={p}>
                <Link href={PAGE_HREF[p]} className="flex h-11 items-center gap-3 rounded-ctl px-3 text-lead font-semibold text-ink motion-safe:transition-colors motion-safe:duration-150 hover:bg-tint">
                  <Icon className="h-5 w-5 text-brand-ink" aria-hidden="true" />
                  {t(PAGE_NAV[p].label)}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/about" className="flex h-11 items-center gap-3 rounded-ctl px-3 text-lead font-semibold text-ink motion-safe:transition-colors motion-safe:duration-150 hover:bg-tint">
              <Info className="h-5 w-5 text-brand-ink" aria-hidden="true" />
              {t('nav.about')}
            </Link>
          </li>
        </ul>
        <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tint text-meta font-bold text-brand-ink" aria-hidden="true">
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
          <button
            type="button"
            onClick={prefs.logout}
            className="flex h-10 items-center justify-center gap-2 rounded-ctl bg-danger-tint text-body font-medium text-danger-ink motion-safe:transition-colors motion-safe:duration-150 hover:opacity-80"
          >
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
