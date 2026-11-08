import { route } from '@/lib/server/api';
import { seesAll } from '@/lib/permissions';
import { purchasesOverview } from '@/lib/server/q/purchases';

export const GET = route({ pages: ['beneficiaries', 'inventory'] }, async ({ url, user }) => {
  const sp = url.searchParams;
  return purchasesOverview({
    q: (sp.get('q') ?? '').trim().slice(0, 100) || undefined,
    typeId: sp.get('typeId') || undefined,
    beneficiaryId: sp.get('beneficiaryId') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    // Staff see only their own purchases, unless the owner lets them see everyone's supplier activity.
    createdById: seesAll(user, 'beneficiaries') ? undefined : user.id,
  });
});
