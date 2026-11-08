'use client';
import { CalendarClock as PageIcon } from 'lucide-react';
import { HeroSafe } from '@/components/hero-art';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { OwedBeneficiary } from '@/lib/server/q/parties';
import { useApp } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { D, fmtMoney } from '@/lib/money';
import { Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { DuesTable } from '@/components/MoneyGuard';
import { PaymentDialog } from '@/components/PaymentDialog';

/**
 * Vault → Unpaid dues: every payment the vaults couldn't fully cover, per vault, with Pay / Pay all,
 * then the beneficiary dues (what the factory still owes each beneficiary).
 */
export function DuesView() {
  const { t, can } = useApp();
  return (
    <div className="min-w-0">
      <PageHeader icon={<PageIcon aria-hidden="true" />} art={<HeroSafe />}
        title={t('due.title')}
        subtitle={t('due.subtitle')}
        back={
          <Link href="/vault" className="inline-flex items-center gap-1 text-meta font-semibold text-brand-ink hover:underline">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t('vault.title')}
          </Link>
        }
      />
      <div className="flex flex-col gap-5">
        {(['USD', 'IQD'] as const).map((v) => (
          <Card key={v} className="min-w-0 p-4 md:p-6" aria-labelledby={`dues-${v}`}>
            <h2 id={`dues-${v}`} className="mb-4 text-title font-semibold text-ink">
              {t(`vault.${v}`)}
            </h2>
            <DuesTable vault={v} />
          </Card>
        ))}
        {can('beneficiaries') ? <BeneficiaryDues /> : null}
      </div>
    </div>
  );
}

/** What the factory owes each beneficiary. Pay opens the normal beneficiary payment (from the user's vault). */
function BeneficiaryDues() {
  const { t, dataVersion } = useApp();
  const [rows, setRows] = useState<OwedBeneficiary[] | null>(null);
  const [paying, setPaying] = useState<OwedBeneficiary | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ rows: OwedBeneficiary[] }>('/api/vault/dues/beneficiaries');
    if (r.ok) setRows(r.data.rows);
  }, []);
  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const total = (rows ?? []).reduce((s, r) => s.plus(D(r.balance)), D(0));

  return (
    <Card className="min-w-0 p-4 md:p-6" aria-labelledby="dues-beneficiaries">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dues-beneficiaries" className="text-title font-semibold text-ink">
          {t('due.benTitle')}
        </h2>
        {rows?.length ? (
          <p className="text-meta text-muted">
            {t('due.benTotal')}: <span className="num font-bold text-danger-ink">{fmtMoney(total)}</span>
          </p>
        ) : null}
      </div>
      <p className="mb-4 text-meta text-muted">{t('due.benHint')}</p>

      {!rows ? (
        <Skeleton className="h-32 w-full" />
      ) : !rows.length ? (
        <p className="flex items-center justify-center gap-2 rounded-ctl bg-success-tint px-4 py-6 text-body font-semibold text-success-ink">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          {t('due.benNone')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-surface rounded-ctl bg-surface-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <Link href={`/beneficiaries/${r.id}`} className="bidi block truncate font-semibold text-brand-ink hover:underline">
                  {r.name}
                </Link>
                {r.phone ? <span className="num block text-caption text-muted">{r.phone}</span> : null}
                <span className="num mt-1 block text-body font-bold text-danger-ink">{fmtMoney(r.balance)}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => setPaying(r)}>
                {t('due.pay')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {paying ? <PaymentDialog open onClose={() => setPaying(null)} kind="BENEFICIARY_PAYMENT" party={{ id: paying.id, name: paying.name }} balance={paying.balance} /> : null}
    </Card>
  );
}
