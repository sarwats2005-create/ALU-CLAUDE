import { route, listParams } from '@/lib/server/api';
import { vaultHistory } from '@/lib/server/q/dashboard';

export const GET = route({ pages: ['vault'] }, async ({ url }) => {
  const p = listParams(url, ['id', 'date', 'amount'], 'id', 'desc');
  const sp = url.searchParams;
  return vaultHistory({ ...p, vault: sp.get('vault') ?? undefined, kind: sp.get('kind') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
});
