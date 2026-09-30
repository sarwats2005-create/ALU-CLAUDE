import { route } from '@/lib/server/api';
import { purchasesOverview } from '@/lib/server/q/purchases';

export const GET = route({ pages: ['beneficiaries', 'inventory'] }, async ({ url }) => {
  const sp = url.searchParams;
  return purchasesOverview({
    q: (sp.get('q') ?? '').trim().slice(0, 100) || undefined,
    typeId: sp.get('typeId') || undefined,
    beneficiaryId: sp.get('beneficiaryId') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
  });
});
