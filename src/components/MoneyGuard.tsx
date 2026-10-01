'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, CheckCircle2 } from 'lucide-react';
import type { DueRow } from '@/lib/server/dues';
import { useApp } from '@/lib/client/app-context';
import { api, type ApiResult } from '@/lib/client/api';
import { fmtDate } from '@/lib/dates';
import { D, fmtMoney, type Cur } from '@/lib/money';
import type { DictKey } from '@/lib/i18n';
import { Dialog } from './Dialog';
import { Button, Skeleton } from './ui';
import { useToast } from './Toast';
import { useTxnPanel } from './TxnPanel';

// Two money safeguards used across the app:
//  1. "Not enough money in the vault — continue?" before any payment the vault can't fully cover.
//     Continuing pays what the vault holds and records the rest as an unpaid due.
//  2. Whenever money comes INTO a vault that has unpaid dues, a pop-up lists them so they can be paid now.

type Ctx = {
  /** POST/PUT that asks before leaving a vault short, then retries with the user's OK. */
  send: <T>(path: string, opts: { method: 'POST' | 'PUT'; body: Record<string, unknown> }) => Promise<ApiResult<T>>;
  /** Call after money came into a vault: shows its unpaid dues, if any. */
  afterIncome: (vault: Cur) => void;
};
const GuardCtx = createContext<Ctx | null>(null);

export function useMoneyGuard(): Ctx {
  const c = useContext(GuardCtx);
  if (!c) throw new Error('useMoneyGuard outside MoneyGuardProvider');
  return c;
}

export function MoneyGuardProvider({ children }: { children: ReactNode }) {
  const { t, can } = useApp();
  const [ask, setAsk] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null);
  const [duesVault, setDuesVault] = useState<Cur | null>(null);

  const send = useCallback(async <T,>(path: string, opts: { method: 'POST' | 'PUT'; body: Record<string, unknown> }) => {
    const first = await api<T>(path, opts);
    if (first.ok || first.code !== 'vault.short') return first;
    const ok = await new Promise<boolean>((resolve) => setAsk({ text: first.error, resolve }));
    setAsk(null);
    if (!ok) return { ok: false as const, status: 409, error: '', code: 'vault.shortCancelled' };
    return api<T>(path, { ...opts, body: { ...opts.body, allowShortfall: true } });
  }, []);

  const afterIncome = useCallback(
    (vault: Cur) => {
      if (!can('vault')) return;
      void api<{ rows: DueRow[]; cash: Record<Cur, string> }>(`/api/vault/dues?vault=${vault}`).then((r) => {
        if (r.ok && r.data.rows.length && D(r.data.cash[vault]).gt(0)) setDuesVault(vault);
      });
    },
    [can],
  );

  return (
    <GuardCtx.Provider value={{ send, afterIncome }}>
      {children}
      <Dialog
        open={!!ask}
        onClose={() => ask?.resolve(false)}
        size="sm"
        title={t('due.confirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => ask?.resolve(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => ask?.resolve(true)} data-autofocus>
              {t('due.confirmContinue')}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink" aria-hidden="true" />
          <div className="flex flex-col gap-2 text-body text-ink">
            <p>{ask?.text}</p>
            <p className="text-meta text-muted">{t('due.confirmNote')}</p>
          </div>
        </div>
      </Dialog>
      <Dialog open={!!duesVault} onClose={() => setDuesVault(null)} size="xl" title={t('due.popTitle')} description={t('due.popHint')}>
        {duesVault ? <DuesTable vault={duesVault} onEmpty={() => setDuesVault(null)} /> : null}
      </Dialog>
    </GuardCtx.Provider>
  );
}

/** Unpaid dues of one vault, with Pay / Pay all. Used in the pop-up and on Vault → Unpaid dues. */
export function DuesTable({ vault, onEmpty }: { vault: Cur; onEmpty?: () => void }) {
  const { t, bump, dataVersion } = useApp();
  const toast = useToast();
  const panel = useTxnPanel();
  const [data, setData] = useState<{ rows: DueRow[]; cash: Record<Cur, string> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const emptied = useRef(false);

  const load = useCallback(async () => {
    const r = await api<{ rows: DueRow[]; cash: Record<Cur, string> }>(`/api/vault/dues?vault=${vault}`);
    if (r.ok) setData(r.data);
  }, [vault]);
  useEffect(() => {
    void load();
  }, [load, dataVersion]);
  useEffect(() => {
    if (data && !data.rows.length && onEmpty && !emptied.current) {
      emptied.current = true;
      const id = window.setTimeout(onEmpty, 1200);
      return () => window.clearTimeout(id);
    }
  }, [data, onEmpty]);

  async function pay(path: string, key: string, body?: Record<string, unknown>) {
    setBusy(key);
    const r = await api<{ paid: string; left?: string | null; count?: number }>(path, { method: 'POST', body: body ?? {} });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.data.left ? t('due.paidPart', { paid: r.data.paid, left: r.data.left }) : t('due.paid', { paid: r.data.paid }));
    bump();
  }

  if (!data) return <Skeleton className="h-40 w-full" />;
  const cash = D(data.cash[vault]);
  const total = data.rows.reduce((s, r) => s.plus(D(r.remaining)), D(0));
  const name = t(`vault.${vault}`);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure label={t('due.cash', { vault: name })} value={fmtMoney(cash, vault)} />
        <Figure label={t('due.total')} value={fmtMoney(total, vault)} tone={total.gt(0) ? 'danger' : undefined} />
        <Figure label={t('due.net')} value={fmtMoney(cash.minus(total), vault)} tone={cash.minus(total).isNegative() ? 'danger' : 'success'} />
      </div>

      {!data.rows.length ? (
        <p className="flex items-center justify-center gap-2 rounded-ctl bg-success-tint px-4 py-6 text-body font-semibold text-success-ink">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          {t('due.none', { vault: name })}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-meta text-muted">{cash.gt(0) ? (cash.gte(total) ? t('due.canPayAll') : t('due.canPaySome', { cash: fmtMoney(cash, vault) })) : t('due.noCashYet', { vault: name })}</p>
            <Button onClick={() => pay('/api/vault/dues/pay-all', 'all', { vault })} busy={busy === 'all'} disabled={!cash.gt(0)} icon={<Banknote className="h-4 w-4" aria-hidden="true" />}>
              {t('due.payAll')}
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-line-soft rounded-ctl border border-line-soft md:hidden">
            {data.rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <button type="button" onClick={() => panel.open(r.txn.id)} className="num font-semibold text-brand-ink hover:underline">
                    {r.txn.number}
                  </button>
                  <span className="block text-caption text-muted">
                    {t(`kind.${r.txn.kind}` as DictKey)} · <span className="num">{fmtDate(r.txn.date)}</span>
                  </span>
                  {r.txn.party ? <span className="bidi block truncate text-caption text-muted">{r.txn.party}</span> : null}
                  <span className="num mt-1 block text-body font-bold text-danger-ink">{fmtMoney(r.remaining, vault)}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => pay(`/api/vault/dues/${r.id}`, r.id)} busy={busy === r.id} disabled={!cash.gt(0)}>
                  {cash.gte(D(r.remaining)) ? t('due.pay') : t('due.payPart')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="scroll-thin hidden overflow-x-auto rounded-ctl border border-line-soft md:block">
            <table className="w-full min-w-[760px] text-meta">
              <thead>
                <tr className="border-b border-line-soft bg-surface-2 text-caption text-muted">
                  <th scope="col" className="py-2.5 ps-4 pe-3 text-start font-semibold">{t('common.number')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.date')}</th>
                  <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t('common.party')}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t('due.docTotal')}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t('due.paidSoFar')}</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-semibold">{t('due.remaining')}</th>
                  <th scope="col" className="py-2.5 ps-3 pe-4 text-end font-semibold"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const paidSoFar = D(r.paid);
                  return (
                    <tr key={r.id} className="border-b border-line-soft last:border-0">
                      <td className="py-3 ps-4 pe-3">
                        <button type="button" onClick={() => panel.open(r.txn.id)} className="num block font-semibold text-brand-ink hover:underline">
                          {r.txn.number}
                        </button>
                        <span className="block text-caption text-muted">{t(`kind.${r.txn.kind}` as DictKey)}</span>
                      </td>
                      <td className="num px-3 py-3 text-muted">{fmtDate(r.txn.date)}</td>
                      <td className="px-3 py-3">
                        <span className="bidi block max-w-[200px] truncate text-ink">{r.txn.party || '—'}</span>
                        {r.txn.notes ? <span className="bidi block max-w-[200px] truncate text-caption text-muted">{r.txn.notes}</span> : null}
                      </td>
                      <td className="num px-3 py-3 text-end text-muted">{fmtMoney(r.txn.total, r.txn.currency as Cur)}</td>
                      <td className="num px-3 py-3 text-end text-muted">{paidSoFar.gt(0) ? fmtMoney(paidSoFar, vault) : '—'}</td>
                      <td className="num px-3 py-3 text-end font-bold text-danger-ink">{fmtMoney(r.remaining, vault)}</td>
                      <td className="py-3 ps-3 pe-4 text-end">
                        <Button size="sm" variant="secondary" onClick={() => pay(`/api/vault/dues/${r.id}`, r.id)} busy={busy === r.id} disabled={!cash.gt(0)}>
                          {cash.gte(D(r.remaining)) ? t('due.pay') : t('due.payPart')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {onEmpty ? (
        <p className="text-meta text-muted">
          {t('due.laterHint')}{' '}
          <Link href="/vault/dues" className="font-semibold text-brand-ink hover:underline" onClick={onEmpty}>
            {t('due.openPage')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-ctl border border-line-soft bg-surface-2 px-4 py-3">
      <p className="text-caption text-muted">{label}</p>
      <p className={`num mt-1 text-lead font-bold ${tone === 'danger' ? 'text-danger-ink' : tone === 'success' ? 'text-success-ink' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

