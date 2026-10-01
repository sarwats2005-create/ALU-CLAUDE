'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { Card, PageHeader } from '@/components/ui';
import { DuesTable } from '@/components/MoneyGuard';

/** Vault → Unpaid dues: every payment the vaults couldn't fully cover, per vault, with Pay / Pay all. */
export function DuesView() {
  const { t } = useApp();
  return (
    <div className="min-w-0">
      <PageHeader
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
      </div>
    </div>
  );
}
