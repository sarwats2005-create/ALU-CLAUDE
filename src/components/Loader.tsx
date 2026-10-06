'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from '@/lib/client/app-context';
import { busyCount, subscribeBusy } from '@/lib/client/busy';

/** The bars-and-ball loader over a plain white veil (flat, no blur). Styles: .alu-loader in globals.css. */
export function LoaderOverlay() {
  const { t } = useT();
  return (
    <div className="alu-loading-overlay" role="status" aria-live="polite">
      <div className="alu-loader" aria-hidden="true">
        <div className="alu-loader__bar" />
        <div className="alu-loader__bar" />
        <div className="alu-loader__bar" />
        <div className="alu-loader__bar" />
        <div className="alu-loader__bar" />
        <div className="alu-loader__ball" />
      </div>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/**
 * Shows the loader while a save / delete / PDF / print is running. Quick actions (under ~300 ms) never
 * flash it; once shown it stays at least 400 ms so it doesn't flicker.
 */
export function GlobalLoader() {
  const n = useSyncExternalStore(subscribeBusy, busyCount, () => 0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (n > 0) {
      const id = window.setTimeout(() => setShow(true), 300);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setShow(false), show ? 150 : 0);
    return () => window.clearTimeout(id);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return show ? <LoaderOverlay /> : null;
}
