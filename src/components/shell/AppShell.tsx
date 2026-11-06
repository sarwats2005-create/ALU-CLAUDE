'use client';
import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
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

/** Desktop with a real pointer: the rail widens on hover. Phones, tablets, and touch screens use the menu button. */
function canHoverExpand() {
  return window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
}

function RailWash({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute inset-y-1 start-2 end-2 z-0 rounded-ctl transition-colors duration-200',
        active ? 'bg-white' : 'group-hover/item:bg-sidebar-active group-active/item:bg-sidebar-active',
      )}
    />
  );
}

function RailText({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden={expanded ? undefined : true}
      className={cx(
        'relative z-10 truncate text-start text-body font-semibold transition-opacity duration-150',
        expanded ? 'min-w-0 flex-1 pe-4 opacity-100 delay-75' : 'w-0 flex-none overflow-hidden p-0 opacity-0',
      )}
    >
      {children}
    </span>
  );
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

  // `open` is the explicit drawer (phones, tablets, touch desktops). `hovered` is the desktop
  // hover/keyboard widen. The rail itself is always on screen from the lg breakpoint up.
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const expanded = open || hovered;

  const clearHoverTimer = () => {
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (!canHoverExpand()) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      const aside = asideRef.current;
      if (!aside || !canHoverExpand()) return;
      if (aside.matches(':hover') || aside.querySelector(':focus-visible')) return;
      // The alerts panel hangs off the rail; keep the labels up until it closes.
      if (aside.querySelector('[role="dialog"]')) {
        scheduleClose();
        return;
      }
      setHovered(false);
    }, 160);
  };

  const onEnter = () => {
    if (!canHoverExpand()) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => setHovered(true), 50);
  };

  const onFocusIn = (e: FocusEvent<HTMLElement>) => {
    if (!canHoverExpand()) return;
    if (!(e.target instanceof Element) || !e.target.matches(':focus-visible')) return;
    clearHoverTimer();
    setHovered(true);
  };

  const onFocusOut = (e: FocusEvent<HTMLElement>) => {
    if (!canHoverExpand()) return;
    if (e.relatedTarget instanceof Node && asideRef.current?.contains(e.relatedTarget)) return;
    scheduleClose();
  };

  const onMenuClick = () => {
    if (canHoverExpand()) return;
    setOpen((v) => !v);
  };

  useEffect(() => () => clearHoverTimer(), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    const sync = () => {
      if (mq.matches) setOpen(false);
      else setHovered(false);
    };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open && !hovered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setOpen(false);
      setHovered(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hovered]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>

      {/* Backdrop only for the explicit drawer. Hover-expand stays clear so the page underneath does not dim. */}
      {open ? (
        <div aria-hidden="true" onClick={() => setOpen(false)} className="anim-fade fixed inset-0 z-[39] bg-black/30" />
      ) : null}
      <aside
        ref={asideRef}
        id="app-sidebar"
        aria-label={t('nav.menu')}
        data-open={open ? '' : undefined}
        data-expanded={expanded ? '' : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={scheduleClose}
        onFocusCapture={onFocusIn}
        onBlurCapture={onFocusOut}
        className="app-sidebar"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute -bottom-28 -start-28 h-80 w-80 rounded-full bg-white/[0.07]" />
          <span className="absolute -end-16 top-1/3 h-40 w-40 rotate-45 rounded-card bg-white/[0.05]" />
        </div>
        <div className="relative flex h-[4.5rem] shrink-0 items-center">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('nav.openMenu')}
            aria-expanded={expanded}
            aria-controls="app-sidebar"
            title={expanded ? undefined : t('nav.openMenu')}
            className="group/item relative flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center text-sidebar-ink"
          >
            <RailWash />
            <Menu className="relative z-10 h-[22px] w-[22px]" aria-hidden="true" />
          </button>
          <span className={cx('flex min-w-0 items-center gap-2.5 overflow-hidden', expanded ? 'flex-1 pe-4 opacity-100' : 'w-0 flex-none p-0 opacity-0')}>
            <Logo size={28} framed />
            <span className="truncate text-[17px] font-extrabold tracking-[0.02em]" dir="ltr">
              ALU FACTORY
            </span>
          </span>
        </div>
        <div className="relative z-20 flex shrink-0 items-center">
          <div className="flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center">
            <AlertsBell onBrand align="start" />
          </div>
          <RailText expanded={expanded}>{t('alerts.title')}</RailText>
        </div>
        <nav aria-label={t('nav.menu')} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <ul className="flex flex-col">
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
                    onClick={() => {
                      if (window.matchMedia('(max-width: 1023.98px)').matches) setOpen(false);
                    }}
                    className={cx('group/item relative flex h-14 items-center', active ? 'text-brand-ink' : 'text-sidebar-muted hover:text-sidebar-ink')}
                  >
                    <RailWash active={active} />
                    <span className="relative z-10 flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center">
                      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                    </span>
                    <RailText expanded={expanded}>{label}</RailText>
                  </Link>
                </li>
              );
            })}
            <li className="mt-2">
              <Link
                href="/about"
                aria-current={pathname === '/about' ? 'page' : undefined}
                aria-label={expanded ? undefined : t('nav.about')}
                title={expanded ? undefined : t('nav.about')}
                onClick={() => {
                  if (window.matchMedia('(max-width: 1023.98px)').matches) setOpen(false);
                }}
                className={cx('group/item relative flex h-14 items-center', pathname === '/about' ? 'text-brand-ink' : 'text-sidebar-muted hover:text-sidebar-ink')}
              >
                <RailWash active={pathname === '/about'} />
                <span className="relative z-10 flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center">
                  <Info className="h-[22px] w-[22px]" strokeWidth={pathname === '/about' ? 2.5 : 2} aria-hidden="true" />
                </span>
                <RailText expanded={expanded}>{t('nav.about')}</RailText>
              </Link>
            </li>
          </ul>
        </nav>
        <div className="relative shrink-0 bg-black/10 pb-4 pt-2">
          <div className="flex min-w-0 items-center">
            <div className="flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center" title={expanded ? undefined : user.name}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-meta font-bold text-brand-ink" aria-hidden="true">
                {initials(user.name)}
              </span>
            </div>
            <div className={cx('min-w-0 overflow-hidden pe-4', expanded ? 'flex-1 opacity-100' : 'w-0 flex-none p-0 opacity-0')}>
              <p className="bidi truncate text-meta font-semibold">{user.name}</p>
              <p className="truncate text-caption text-sidebar-muted" dir="ltr">
                {user.isOwner ? t('common.owner') : user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={prefs.logout}
            aria-label={expanded ? undefined : t('nav.logout')}
            title={expanded ? undefined : t('nav.logout')}
            className="group/item relative flex h-14 w-full items-center text-sidebar-muted hover:text-sidebar-ink"
          >
            <RailWash />
            <span className="relative z-10 flex h-14 w-[var(--sidebar-rail)] shrink-0 items-center justify-center">
              <LogOut className="h-[22px] w-[22px] rtl:rotate-180" aria-hidden="true" />
            </span>
            <RailText expanded={expanded}>{t('nav.logout')}</RailText>
          </button>
          {expanded ? (
            <div className="overflow-hidden px-3 pb-1">
              <PrefControls onBrand />
            </div>
          ) : null}
        </div>
      </aside>

      <header className="app-topbar">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={t('nav.openMenu')}
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-ctl text-ink transition-colors duration-200 hover:bg-surface-2"
        >
          <Menu className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
        <Logo size={28} />
        <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-[0.02em] text-ink" dir="ltr">
          ALU FACTORY
        </span>
        <AlertsBell />
      </header>

      <div className="app-main-offset">
        <main id="main" tabIndex={-1} className="app-main">
          {children}
        </main>
      </div>

      <nav aria-label={t('nav.menu')} className="app-tabbar">
        <ul className="mx-auto flex w-full max-w-xl">
          {tabs.map((p) => {
            const Icon = NAV[p].icon;
            const active = isActive(p);
            return (
              <li key={p} className="min-w-0 flex-1">
                <Link
                  href={PAGE_HREF[p]}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold leading-tight transition-colors duration-200 min-[400px]:text-[12px]',
                    active ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="w-full truncate text-center">{t(NAV[p].short ?? NAV[p].label)}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cx(
                'flex h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold leading-tight transition-colors duration-200 min-[400px]:text-[12px]',
                overflow.some(isActive) || pathname === '/about' ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink',
              )}
            >
              <Ellipsis className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
              <span className="w-full truncate text-center">{t('nav.more')}</span>
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
