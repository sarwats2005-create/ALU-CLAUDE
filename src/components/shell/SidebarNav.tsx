'use client';
import Link from 'next/link';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { cx } from '@/lib/cx';
import type { Page } from '@/lib/permissions';
import {
  NAV_SECTIONS,
  groupHasActive,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
  type NavLink,
  type NavSection,
} from './nav-config';
import { SidebarTooltip } from './SidebarTooltip';

type CanFn = (page: Page) => boolean;

function filterEntry(entry: NavEntry, can: CanFn): NavEntry | null {
  if (entry.type === 'link') {
    if (entry.page && !can(entry.page)) return null;
    return entry;
  }
  if (!can(entry.page)) return null;
  const children = entry.children.filter((c) => !c.page || can(c.page));
  if (!children.length) return null;
  return { ...entry, children };
}

function filterSections(can: CanFn): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    entries: s.entries.map((e) => filterEntry(e, can)).filter((e): e is NavEntry => !!e),
  })).filter((s) => s.entries.length > 0);
}

/** Which group ids contain the active route (for auto-expand). */
export function activeNavGroupIds(pathname: string, can: CanFn): string[] {
  const ids: string[] = [];
  for (const s of filterSections(can)) {
    for (const e of s.entries) {
      if (e.type === 'group' && groupHasActive(e, pathname)) ids.push(e.id);
    }
  }
  return ids;
}

const itemBase =
  'flex w-full items-center gap-3 overflow-hidden rounded-ctl text-body font-semibold motion-safe:transition-[background-color,color] motion-safe:duration-150';
const itemPad = 'h-11 px-3';
const itemActive = 'bg-white/95 text-brand-ink shadow-[0_2px_12px_-4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.9)]';
const itemIdle = 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink';

export function SidebarNav({
  pathname,
  showLabels,
  openGroups,
  onToggleGroup,
  onNavigate,
}: {
  pathname: string;
  showLabels: boolean;
  openGroups: string[];
  onToggleGroup: (id: string) => void;
  onNavigate?: () => void;
}) {
  const { t, can } = useApp();
  const sections = filterSections(can);

  return (
    <nav aria-label={t('nav.menu')} className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.id}>
            {section.label && showLabels ? (
              <p className="mb-1 truncate px-3 text-caption font-bold uppercase tracking-wider text-sidebar-muted/80">{t(section.label)}</p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {section.entries.map((entry) =>
                entry.type === 'group' ? (
                  <NavGroupItem
                    key={entry.id}
                    entry={entry}
                    pathname={pathname}
                    showLabels={showLabels}
                    open={openGroups.includes(entry.id)}
                    onToggle={() => onToggleGroup(entry.id)}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <li key={entry.id}>
                    <LeafLink leaf={entry} pathname={pathname} showLabels={showLabels} onNavigate={onNavigate} />
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function LeafLink({
  leaf,
  pathname,
  showLabels,
  onNavigate,
  nested,
  fallbackIcon,
}: {
  leaf: NavLeaf | NavLink;
  pathname: string;
  showLabels: boolean;
  onNavigate?: () => void;
  nested?: boolean;
  fallbackIcon?: LucideIcon;
}) {
  const { t } = useApp();
  const active = leaf.match(pathname);
  const label = t(leaf.label);
  const Icon = leaf.icon ?? fallbackIcon;

  const link = (
    <Link
      href={leaf.href}
      aria-current={active ? 'page' : undefined}
      aria-label={!showLabels ? label : undefined}
      onClick={onNavigate}
      className={cx(
        itemBase,
        itemPad,
        active ? itemActive : itemIdle,
        nested && showLabels && 'ps-9',
        !showLabels && 'justify-center px-0',
      )}
    >
      {Icon ? <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} aria-hidden="true" /> : <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />}
      <span className={cx('min-w-0 flex-1 truncate motion-safe:transition-opacity motion-safe:duration-150', showLabels ? 'opacity-100' : 'sr-only')}>{label}</span>
    </Link>
  );

  return (
    <SidebarTooltip label={label} enabled={!showLabels}>
      {link}
    </SidebarTooltip>
  );
}

function NavGroupItem({
  entry,
  pathname,
  showLabels,
  open,
  onToggle,
  onNavigate,
}: {
  entry: NavGroup;
  pathname: string;
  showLabels: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useApp();
  const label = t(entry.label);
  const childActive = groupHasActive(entry, pathname);
  const Icon = entry.icon;
  const panelId = `nav-group-${entry.id}`;

  // Collapsed rail: icon navigates to the group's default route.
  if (!showLabels) {
    return (
      <li>
        <SidebarTooltip label={label} enabled>
          <Link
            href={entry.href}
            aria-current={childActive ? 'true' : undefined}
            aria-label={label}
            onClick={onNavigate}
            className={cx(itemBase, itemPad, 'justify-center px-0', childActive ? itemActive : itemIdle)}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={childActive ? 2.5 : 2} aria-hidden="true" />
          </Link>
        </SidebarTooltip>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cx(itemBase, itemPad, childActive && !open ? itemActive : itemIdle)}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={childActive ? 2.5 : 2} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        <ChevronDown
          className={cx('h-4 w-4 shrink-0 motion-safe:transition-transform motion-safe:duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="group"
        aria-label={label}
        inert={open ? undefined : true}
        className={cx(
          'grid motion-safe:transition-[grid-template-rows] motion-safe:duration-[var(--motion-panel)] motion-safe:ease-[var(--ease-out)]',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <ul className="min-h-0 overflow-hidden" aria-hidden={open ? undefined : true}>
          {entry.children.map((child) => (
            <li key={child.id} className="mt-0.5">
              <LeafLink leaf={child} pathname={pathname} showLabels={showLabels} onNavigate={onNavigate} nested fallbackIcon={entry.icon} />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
