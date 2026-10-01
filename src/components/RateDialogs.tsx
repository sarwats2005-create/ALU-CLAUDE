'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { useRemote } from '@/lib/client/use-remote';
import { fmtDateTime } from '@/lib/dates';
import { D, fmtRate, rateFromDisplay, rateLine, rateToDisplay } from '@/lib/money';
import { cx } from '@/lib/cx';
import { Dialog } from './Dialog';
import { Button, Field, Input, Skeleton } from './ui';
import { useToast } from './Toast';

/** Edit the exchange rate (Owner or users with the canEditExchangeRate permission). */
export function RateEditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, rate, setRate, bump } = useApp();
  const toast = useToast();
  const [value, setValue] = useState(rateToDisplay(rate));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(rateToDisplay(rate));
      setError(undefined);
    }
  }, [open, rate]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ rate: string }>('/api/settings', { method: 'PUT', body: { exchangeRate: rateFromDisplay(value) } });
    setBusy(false);
    if (!res.ok) return setError(res.fieldErrors?.rate ?? res.error);
    setRate(res.data.rate);
    bump();
    onClose();
    toast.success(t('toast.rateUpdated', { rate: rateLine(res.data.rate) }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={t('vault.editRateTitle')}
      description={t('vault.rateHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="rate-edit-form" busy={busy}>
            {t('common.saveChanges')}
          </Button>
        </>
      }
    >
      <form id="rate-edit-form" onSubmit={save} noValidate>
        <Field label={t('vault.newRate')} htmlFor="rate-edit" error={error} required>
          <div className="flex items-center gap-2">
            <span className="num shrink-0 text-body text-muted">100 USD =</span>
            <Input id="rate-edit" numeric value={value} onChange={(e) => setValue(e.target.value)} invalid={!!error} data-autofocus />
            <span className="shrink-0 text-body text-muted">IQD</span>
          </div>
        </Field>
      </form>
    </Dialog>
  );
}

type Log = { rows: { id: number; oldRate: string; newRate: string; userName: string; createdAt: string }[] };

export function RateLogList() {
  const { t } = useApp();
  const { data } = useRemote<Log>('/api/settings/rate-log');
  if (!data) return <Skeleton className="h-24 w-full" />;
  if (!data.rows.length) return <p className="py-6 text-center text-meta text-muted">{t('vault.rateLogEmpty')}</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[480px] text-meta">
        <thead>
          <tr className="border-b border-line text-caption text-muted">
            <th scope="col" className="py-2 text-start font-semibold">{t('common.timestamp')}</th>
            <th scope="col" className="py-2 text-end font-semibold">{t('vault.oldRate')}</th>
            <th scope="col" className="py-2 text-end font-semibold">{t('vault.newRate')}</th>
            <th scope="col" className="py-2 ps-4 text-start font-semibold">{t('common.user')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const up = D(r.newRate).gt(D(r.oldRate));
            return (
              <tr key={r.id} className="border-b border-line-soft last:border-0">
                <td className="num py-2.5 text-muted">{fmtDateTime(r.createdAt)}</td>
                <td className="num py-2.5 text-end text-muted">{fmtRate(r.oldRate)}</td>
                <td className={cx('num py-2.5 text-end font-semibold', up ? 'text-success-ink' : 'text-danger-ink')}>
                  {up ? '▲' : '▼'} {fmtRate(r.newRate)}
                </td>
                <td className="bidi py-2.5 ps-4 text-ink">{r.userName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RateLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  return (
    <Dialog open={open} onClose={onClose} title={t('vault.rateHistory')} size="md">
      {open ? <RateLogList /> : null}
    </Dialog>
  );
}
