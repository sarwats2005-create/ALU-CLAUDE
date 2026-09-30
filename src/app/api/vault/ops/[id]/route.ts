import { route, body } from '@/lib/server/api';
import { saveVaultOp, type VaultOpInput } from '@/lib/server/txns';
import { notFound } from '@/lib/server/errors';
import { prisma } from '@/lib/db';

export const PUT = route<{ id: string }>({ pages: ['vault'], fail: 'err.update' }, async ({ req, user, params }) => {
  const t = await prisma.txn.findUnique({ where: { id: params.id }, select: { kind: true } });
  if (!t) throw notFound();
  return saveVaultOp({ ...(await body<VaultOpInput>(req)), kind: t.kind }, user, params.id);
});
