import { route, body } from '@/lib/server/api';
import { saveVaultOp, type VaultOpInput } from '@/lib/server/txns';

export const POST = route({ pages: ['vault'], fail: 'err.save' }, async ({ req, user }) => saveVaultOp(await body<VaultOpInput>(req), user));
