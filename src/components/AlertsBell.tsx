'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { cx } from '@/lib/cx';

type Alert = { key: string; type: string; severity: 'danger' | 'warning'; text: string; href: string; unread: boolean };

export function AlertsBell({ className, onBrand, align = 'end' }: { className?: string; onBrand?: boolean; align?: 'start' | 'end' }) {
  const { t, dataVersion } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await api<{ alerts: Alert[] }>('/api/alerts');
    if (res.ok) setAlerts(res.data.alerts);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load, dataVersion]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = alerts.filter((a) => a.unread).length;

  async function markRead(keys: string[]) {
    if (!keys.length) return;
    setAlerts((l) => l.map((a) => (keys.includes(a.key) ? { ...a, unread: false } : a)));
    await api('/api/alerts', { method: 'POST', body: { keys } });
  }

  return (
    <div ref={wrap} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('alerts.open', { n: unread })}
        className={cx(
          'relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors md:h-10 md:w-10',
          onBrand ? 'text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-ink' : 'text-muted hover:bg-tint hover:text-ink',
        )}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="num absolute end-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t('alerts.title')}
          className={cx(
            'anim-sheet fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-hidden rounded-card border border-line bg-surface shadow-pop md:absolute md:inset-x-auto md:top-12 md:w-[380px]',
            align === 'end' ? 'md:end-0' : 'md:start-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <h2 className="text-body font-semibold text-ink">{t('alerts.title')}</h2>
            {unread > 0 ? (
              <button type="button" onClick={() => markRead(alerts.filter((a) => a.unread).map((a) => a.key))} className="text-meta font-semibold text-brand-ink hover:underline">
                {t('alerts.markRead')}
              </button>
            ) : null}
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-meta text-muted">{t('alerts.none')}</p>
          ) : (
            <ul className="scroll-thin max-h-[calc(70dvh-52px)] overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    onClick={() => {
                      markRead([a.key]);
                      setOpen(false);
                    }}
                    className={cx('flex items-start gap-3 border-b border-line-soft px-4 py-3 text-meta transition-colors last:border-0 hover:bg-surface-2', a.unread && 'bg-tint/50')}
                  >
                    {a.severity === 'danger' ? (
                      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    )}
                    <span className={cx('bidi flex-1', a.unread ? 'font-semibold text-ink' : 'text-muted')}>{a.text}</span>
                    {a.unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
