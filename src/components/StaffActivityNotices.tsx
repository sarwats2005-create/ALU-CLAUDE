'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, FilePlus2, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/dates';
import { cx } from '@/lib/cx';
import { useTxnPanel } from '@/components/TxnPanel';
import type { NotificationRow } from '@/lib/server/q/notifications';

const SHOWN = 2;
const POLL_MS = 30000;

/**
 * Owner only: every document a staff user creates, edits or deletes slides in here with the user's name.
 * It stays until the owner presses "I get it" (stored on the server, so it is cleared on every device).
 */
export function StaffActivityNotices() {
  const { t, dataVersion } = useApp();
  const panel = useTxnPanel();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const res = await api<{ rows: NotificationRow[]; total: number }>('/api/notifications');
    if (res.ok) {
      setRows(res.data.rows);
      setTotal(res.data.total);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, dataVersion]);

  async function ack(ids: number[] | 'all') {
    // Optimistic: the card leaves at once; the server is the record.
    if (ids === 'all') {
      setRows([]);
      setTotal(0);
    } else {
      setRows((l) => l.filter((r) => !ids.includes(r.id)));
      setTotal((n) => Math.max(0, n - ids.length));
    }
    const res = await api('/api/notifications', { method: 'POST', body: ids === 'all' ? { all: true } : { ids } });
    if (!res.ok) load();
  }

  if (!rows.length) return null;
  const shown = rows.slice(0, SHOWN);
  const more = total - shown.length;

  return (
    <section
      aria-label={t('notice.region')}
      aria-live="polite"
      className="fixed inset-x-4 top-[calc(64px+env(safe-area-inset-top))] z-50 flex flex-col gap-2 sm:inset-x-auto sm:end-4 sm:w-[380px] md:top-6"
    >
      {shown.map((n) => {
        const Icon = n.action === 'delete' ? Trash2 : n.action === 'update' ? Pencil : FilePlus2;
        return (
          <article key={n.id} className="anim-notice rounded-card border border-line-soft bg-surface-solid px-4 py-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
            <div className="flex items-start gap-3">
              <span
                className={cx(
                  'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  n.action === 'delete' ? 'bg-danger-tint text-danger-ink' : n.action === 'update' ? 'bg-warning-tint text-warning-ink' : 'bg-tint text-brand-ink',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink">
                  <span className="bidi font-semibold">{n.actorName}</span>{' '}
                  {t(n.action === 'delete' ? 'notice.deleted' : n.action === 'update' ? 'notice.edited' : 'notice.created', { kind: t(`kind.${n.kind}` as 'kind.SALE') })}{' '}
                  <span className="num font-semibold text-brand-ink">{n.number}</span>
                </p>
                <p className="bidi mt-0.5 truncate text-meta text-muted">
                  {[n.summary, n.totalText].filter(Boolean).join(' · ')}
                  {n.summary || n.totalText ? ' · ' : ''}
                  <span className="num">{fmtDateTime(n.createdAt)}</span>
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1">
              {n.txnId && n.action !== 'delete' ? (
                <button type="button" onClick={() => panel.open(n.txnId!)} className="min-h-11 rounded-ctl px-3 text-meta font-semibold text-brand-ink hover:bg-tint">
                  {t('notice.open')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => ack([n.id])}
                className="alu-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-ctl px-4 text-meta font-semibold text-on-brand"
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                {t('notice.gotIt')}
              </button>
            </div>
          </article>
        );
      })}
      {total > 1 ? (
        <div className="flex items-center justify-between gap-2 rounded-card bg-dark px-4 py-2 text-meta text-white">
          <span>{more > 0 ? t('notice.more', { n: more }) : t('notice.count', { n: total })}</span>
          <button type="button" onClick={() => ack('all')} className="inline-flex min-h-11 items-center gap-1.5 rounded-ctl px-2 font-semibold hover:underline">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            {t('notice.gotItAll')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
