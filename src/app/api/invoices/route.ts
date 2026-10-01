import type { TxnKind } from '@prisma/client';
import { route, listParams } from '@/lib/server/api';
import { HISTORY_SORT, listHistory } from '@/lib/server/q/history';
import { EDIT_WINDOW_MS } from '@/lib/lock';

/**
 * Sale and purchase invoices for the Invoices page. Filters: type=sale|purchase, lock=open|locked
 * (inside / past the 24-hour edit window), from/to dates, search. Each row carries createdAt so the
 * page can show the edit countdown; the server enforces the lock on every edit and delete regardless.
 */
export const GET = route({ pages: ['invoices'] }, async ({ url }) => {
  const p = listParams(url, HISTORY_SORT, 'created', 'desc');
  const sp = url.searchParams;
  const type = sp.get('type');
  const kinds: TxnKind[] = type === 'sale' ? ['SALE'] : type === 'purchase' ? ['PURCHASE'] : ['SALE', 'PURCHASE'];
  const lock = sp.get('lock');
  const cutoff = new Date(Date.now() - EDIT_WINDOW_MS);
  return listHistory(
    {
      q: p.q,
      kinds,
      currency: sp.get('currency') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      ...(lock === 'open' ? { createdFrom: cutoff } : lock === 'locked' ? { createdBefore: cutoff } : {}),
    },
    p,
  );
});
