import { route, body } from '@/lib/server/api';
import { payAllDues } from '@/lib/server/dues';
import { asCurrency } from '@/lib/server/common';
import { fieldError } from '@/lib/server/errors';
import { personalVaultId } from '@/lib/server/scope';

/** Pay a vault's unpaid dues, oldest first, as far as its cash goes. */
export const POST = route({ pages: ['vault'], fail: 'err.save' }, async ({ req, user }) => {
  const vault = asCurrency((await body<{ vault?: string }>(req)).vault);
  if (!vault) throw fieldError('vault', 'v.required');
  return payAllDues(vault, user, personalVaultId(user));
});
