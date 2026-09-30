'use client';
import type { TxnRow } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { fmtDate } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Badge } from './ui';
import { useTxnPanel } from './TxnPanel';

export function statusTone(s: TxnRow['status']) {
  return s === 'paid' ? 'success' : s === 'unpaid' ? 'danger' : s === 'partial' ? 'warning' : 'neutral';
}

/** Compact transaction list: a table on desktop, stacked cards on phones. Row click → detail panel. */
export function TxnRows({ rows, emptyText }: { rows: TxnRow[]; emptyText: string }) {
  const { t } = useApp();
  const panel = useTxnPanel();
  if (!rows.length) return <p className="px-5 pb-8 pt-4 text-center text-meta text-muted">{emptyText}</p>;
  const party = (r: TxnRow) => r.partyName || r.label || (r.kind === 'PROCESSING' ? r.products : '');
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-meta">
          <thead>
            <tr className="border-y border-line-soft bg-surface-2 text-caption text-muted">
              <th scope="col" className="px-5 py-2.5 text-start font-semibold">{t('common.number')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.type')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.party')}</th>
              <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t('common.amount')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.currency')}</th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.vault')}</th>
              <th scope="col" className="px-5 py-2.5 text-start font-semibold">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => panel.open(r.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), panel.open(r.id))}
                tabIndex={0}
                className="cursor-pointer border-b border-line-soft outline-none transition-colors last:border-0 hover:bg-surface-2 focus-visible:bg-tint"
              >
                <td className="num px-5 py-3 font-semibold text-brand-ink">{r.number}</td>
                <td className="num px-3 py-3 text-muted">{fmtDate(r.date)}</td>
                <td className="px-3 py-3 text-ink">{t(`kind.${r.kind}` as 'kind.SALE')}</td>
                <td className="bidi max-w-[220px] truncate px-3 py-3 text-ink">{party(r)}</td>
                <td className="num px-3 py-3 text-end font-semibold text-ink">{r.kind === 'PROCESSING' ? `${Number(r.kg).toLocaleString('en-US')} kg` : fmtMoney(r.total, r.currency)}</td>
                <td className="px-3 py-3 text-muted">{r.currency}</td>
                <td className="px-3 py-3 text-muted">{r.vault ? t(`vault.${r.vault}` as 'vault.USD') : '—'}</td>
                <td className="px-5 py-3">
                  <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge>
                  {r.isDemo ? <Badge tone="brand" className="ms-1">{t('app.demo')}</Badge> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="border-t border-line-soft">
            <button type="button" onClick={() => panel.open(r.id)} className="flex w-full items-start justify-between gap-3 px-5 py-3.5 text-start hover:bg-surface-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="num text-meta font-semibold text-brand-ink">{r.number}</span>
                  <span className="text-caption text-muted">{t(`kind.${r.kind}` as 'kind.SALE')}</span>
                </span>
                <span className="bidi mt-0.5 block truncate text-body text-ink">{party(r) || '—'}</span>
                <span className="num mt-0.5 block text-caption text-muted">{fmtDate(r.date)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={cx('num text-body font-semibold text-ink')}>{r.kind === 'PROCESSING' ? `${Number(r.kg).toLocaleString('en-US')} kg` : fmtMoney(r.total, r.currency)}</span>
                <Badge tone={statusTone(r.status)}>{t(`status.${r.status}` as 'status.paid')}</Badge>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
