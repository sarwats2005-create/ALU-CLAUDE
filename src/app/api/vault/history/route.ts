import { route, listParams } from '@/lib/server/api';
import { vaultHistory } from '@/lib/server/q/dashboard';
import { personalVaultId } from '@/lib/server/scope';

export const GET = route({ pages: ['vault'] }, async ({ url, user }) => {
  const p = listParams(url, ['id', 'date', 'amount'], 'id', 'desc');
  const sp = url.searchParams;
  return vaultHistory({
    ...p,
    vault: sp.get('vault') ?? undefined,
    kind: sp.get('kind') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    ownerUserId: personalVaultId(user),
  });
});
