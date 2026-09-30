import { route, body, listParams } from '@/lib/server/api';
import { savePurchase, type PurchaseInput } from '@/lib/server/txns';
import { HISTORY_SORT, listHistory } from '@/lib/server/q/history';

/** Purchases list (for the overview tab) — same row shape as the history list. */
export const GET = route({ pages: ['beneficiaries', 'inventory'] }, async ({ url }) => {
  const p = listParams(url, HISTORY_SORT, 'date', 'desc');
  const sp = url.searchParams;
  return listHistory(
    { q: p.q, kind: 'PURCHASE', beneficiaryId: sp.get('beneficiaryId') ?? undefined, typeId: sp.get('typeId') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined },
    p,
  );
});

export const POST = route({ pages: ['beneficiaries'], fail: 'err.save' }, async ({ req, user }) => savePurchase(await body<PurchaseInput>(req), user));
