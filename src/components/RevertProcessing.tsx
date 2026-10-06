'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, Undo2 } from 'lucide-react';
import type { TxnDetail } from '@/lib/server/q/history';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { D, fmtKg, fmtMoney } from '@/lib/money';
import { Dialog } from './Dialog';
import { Button, Field, Input, Skeleton } from './ui';
import { useToast } from './Toast';

/**
 * "Revert to raw" for a processing run (PRC): the finished kg go back to raw stock and the kg lost in processing
 * come back too, at the raw cost they had. Needs the master PIN. The server refuses when part of the finished
 * kg was already sold or processed again.
 */
export function RevertProcessingDialog({ txnId, onClose, onDone }: { txnId: string | null; onClose: () => void; onDone?: () => void }) {
  const { t, bump } = useApp();
  const toast = useToast();
  const [d, setD] = useState<TxnDetail | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setD(null);
    setPin('');
    setErr(null);
    if (txnId) void api<TxnDetail>(`/api/txns/${txnId}`).then((r) => r.ok && setD(r.data));
  }, [txnId]);

  async function go(e: FormEvent) {
    e.preventDefault();
    if (!d) return;
    if (!pin) return setErr(t('bk.pinNeeded'));
    setBusy(true);
    const r = await api(`/api/processing/${d.id}/revert`, { method: 'POST', body: { pin } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(t('prc.revertDone', { number: d.number }));
    window.dispatchEvent(new CustomEvent('alu:txn-deleted', { detail: { id: d.id } }));
    bump();
    onDone?.();
    onClose();
  }

  const row = (label: string, value: string, tone?: 'neg' | 'pos', strong?: boolean) => (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className={`num text-body ${strong ? 'font-bold' : 'font-semibold'} ${tone === 'neg' ? 'text-danger-ink' : tone === 'pos' ? 'text-success-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  );

  return (
    <Dialog
      open={!!txnId}
      onClose={onClose}
      title={d ? t('prc.revertTitle', { number: d.number }) : t('prc.revert')}
      description={d?.product ? `${d.product.name} · ${d.product.sku}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="revert-form" busy={busy} disabled={!d} icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}>
            {t('prc.revertConfirm')}
          </Button>
        </>
      }
    >
      {!d ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <form id="revert-form" onSubmit={go} noValidate className="flex flex-col gap-4">
          {/* What moves, in the order it happens: finished out, loss back, raw in. */}
          <dl className="overflow-hidden rounded-card bg-surface-2">
            {row(t('prc.revertFinished'), `− ${fmtKg(d.outputKg ?? 0)}`, 'neg')}
            {row(t('prc.revertLoss'), `+ ${fmtKg(d.lossKg ?? 0)}`, 'pos')}
            <div className="flex justify-center bg-surface-2 py-1 text-muted" aria-hidden="true">
              <ArrowDown className="h-4 w-4" />
            </div>
            <div className="bg-tint">{row(t('prc.revertRaw'), `+ ${fmtKg(d.inputKg ?? 0)}`, 'pos', true)}</div>
            {row(t('prc.revertCost'), fmtMoney(D(d.cogsUsd).toDecimalPlaces(2)))}
          </dl>
          <p className="text-caption text-muted">{t('prc.revertNote')}</p>
          <Field label={t('bk.masterPin')} htmlFor="revert-pin" error={err ?? undefined} required>
            <Input
              id="revert-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(e) => (setPin(e.target.value.replace(/\D/g, '')), setErr(null))}
              invalid={!!err}
              className="num tracking-[0.4em]"
              autoFocus
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
