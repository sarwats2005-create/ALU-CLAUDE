'use client';
import { Lock } from 'lucide-react';
import { useApp } from '@/lib/client/app-context';
import { useRemote } from '@/lib/client/use-remote';
import { cx } from '@/lib/cx';

/**
 * The product's code (SKU), shown instead of a field to fill in. New products get the next code from a running
 * number when they are saved (ALU-00001, ALU-00002, …); an existing product keeps its code for good.
 * Shows a live preview of how the product will appear in lists and on invoices.
 */
export function ProductCode({ sku, name, typeName, className }: { sku?: string | null; name: string; typeName?: string; className?: string }) {
  const { t } = useApp();
  const isNew = !sku;
  const next = useRemote<{ sku: string }>(isNew ? '/api/products/next-sku' : null);
  const code = sku ?? next.data?.sku ?? '…';
  return (
    <div className={cx('flex items-start gap-3 rounded-card bg-surface-2 p-3.5', className)}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand" aria-hidden="true">
        <Lock className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta font-medium text-muted">
          {isNew ? t('sku.next') : t('sku.label')}
          <span className="num rounded-md bg-brand px-2 py-0.5 text-body font-bold tracking-wide text-on-brand" dir="ltr" aria-live="polite">
            {code}
          </span>
        </p>
        <p className="mt-1 text-caption text-muted">{isNew ? t('sku.auto') : t('sku.fixed')}</p>
        {/* How it will look in lists and on invoices */}
        <div className="mt-2.5 flex min-w-0 items-center gap-2 rounded-ctl bg-surface px-3 py-2">
          <span className="text-caption text-muted">{t('sku.preview')}</span>
          <span className="bidi min-w-0 truncate text-meta font-semibold text-ink">{name.trim() || t('sku.namePh')}</span>
          <span className="num shrink-0 rounded bg-tint px-1.5 text-caption font-semibold text-brand-ink" dir="ltr">
            {code}
          </span>
          {typeName ? <span className="bidi shrink-0 text-caption text-muted">{typeName}</span> : null}
        </div>
      </div>
    </div>
  );
}
