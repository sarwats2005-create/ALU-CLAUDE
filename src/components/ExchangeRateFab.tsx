'use client';
// Protected file (owner request): the only permission check here is `canEditExchangeRate`.
import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, Pencil } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { fmtRate, rateFromDisplay, rateLine, rateToDisplay } from '@/lib/money';
import { Dialog } from './Dialog';
import { Button, Field, Input } from './ui';
import { useToast } from './Toast';

export function ExchangeRateFab() {
  const { t, rate, setRate, canDo, bump } = useApp();
  const toast = useToast();
  const canEdit = canDo('canEditExchangeRate');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(rate);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  function openDialog() {
    setValue(rateToDisplay(rate));
    setError(undefined);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await api<{ rate: string }>('/api/settings', { method: 'PUT', body: { exchangeRate: rateFromDisplay(value) } });
    setBusy(false);
    if (!res.ok) {
      setError(res.fieldErrors?.rate ?? res.error);
      return;
    }
    setRate(res.data.rate);
    bump();
    setOpen(false);
    toast.success(t('toast.rateUpdated', { rate: rateLine(res.data.rate) }));
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={`${t('vault.editRateTitle')}: ${t('vault.rateLine', { rate: fmtRate(rate) })}`}
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] end-4 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface ps-3 pe-4 text-meta font-semibold text-ink shadow-pop transition-colors hover:bg-surface-2 md:bottom-6 md:end-6"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-on-brand">
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="num">{rateLine(rate)}</span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('vault.editRateTitle')} description={t('vault.rateHint')} size="sm">
        <form id="rate-form" onSubmit={save} noValidate className="flex flex-col gap-4">
          <div className="rounded-ctl bg-tint px-4 py-3">
            <p className="text-caption text-muted">{t('set.rateCurrent')}</p>
            <p className="num mt-0.5 text-heading font-bold text-ink">{rateLine(rate)}</p>
          </div>
          {canEdit ? (
            <Field label={t('vault.newRate')} htmlFor="fab-rate" error={error} required>
              <div className="flex items-center gap-2">
                <span className="num shrink-0 text-body text-muted">100 USD =</span>
                <Input id="fab-rate" numeric value={value} onChange={(e) => setValue(e.target.value)} invalid={!!error} />
                <span className="shrink-0 text-body text-muted">IQD</span>
              </div>
            </Field>
          ) : null}
        </form>
        {canEdit ? (
          <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="rate-form" busy={busy} icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
              {t('common.saveChanges')}
            </Button>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
