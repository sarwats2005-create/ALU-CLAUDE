'use client';
import { useCallback, useEffect, useState } from 'react';

const EXPANDED_KEY = 'alu:sidebar-expanded';
const GROUPS_KEY = 'alu:sidebar-groups';
const MQ = '(max-width: 1023.98px)';

function readExpanded(): boolean {
  try {
    const v = localStorage.getItem(EXPANDED_KEY);
    if (v === null) return true; // desktop default: labels visible (Supabase-like)
    return v === '1';
  } catch {
    return true;
  }
}

function writeExpanded(v: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, v ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function readGroups(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeGroups(ids: string[]) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

/**
 * Desktop: persistent expand/collapse (icons+labels vs icons-only).
 * Mobile: independent off-canvas drawer; never writes the desktop preference when toggling the drawer.
 */
export function useSidebarState(pathname: string, activeGroupIds: string[]) {
  const [hydrated, setHydrated] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setDesktopExpanded(readExpanded());
    setOpenGroups(readGroups());
    setIsMobile(window.matchMedia(MQ).matches);
    setHydrated(true);
    const mq = window.matchMedia(MQ);
    const onMq = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  // Keep groups that contain the current route open (refresh-safe).
  useEffect(() => {
    if (!activeGroupIds.length) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of activeGroupIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (!changed) return prev;
      const arr = [...next];
      writeGroups(arr);
      return arr;
    });
  }, [pathname, activeGroupIds]);

  // Close mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, isMobile]);

  const setExpanded = useCallback((next: boolean) => {
    setDesktopExpanded(next);
    writeExpanded(next);
  }, []);

  const toggleExpanded = useCallback(() => {
    setDesktopExpanded((v) => {
      const next = !v;
      writeExpanded(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeGroups(next);
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  /** Visible labels: always on mobile drawer; desktop follows preference. */
  const showLabels = isMobile ? mobileOpen : desktopExpanded;
  /** Sidebar panel open on mobile, or always present on desktop. */
  const panelOpen = isMobile ? mobileOpen : true;

  return {
    hydrated,
    isMobile,
    desktopExpanded,
    mobileOpen,
    showLabels,
    panelOpen,
    openGroups,
    setExpanded,
    toggleExpanded,
    toggleGroup,
    openMobile,
    closeMobile,
  };
}
