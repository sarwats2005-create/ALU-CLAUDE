import { route, body } from '@/lib/server/api';
import { saveVaultOp, type VaultOpInput } from '@/lib/server/txns';
import { personalVaultId } from '@/lib/server/scope';

export const POST = route({ pages: ['vault'], fail: 'err.save' }, async ({ req, user }) => {
  const input = await body<VaultOpInput>(req);
  return saveVaultOp(input, user, undefined, { walletOwnerId: personalVaultId(user) });
});
