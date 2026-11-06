import { route, body } from '@/lib/server/api';
import { saveVaultOp, type VaultOpInput } from '@/lib/server/txns';
import { notFound } from '@/lib/server/errors';
import { prisma } from '@/lib/db';
import { personalVaultId } from '@/lib/server/scope';

export const PUT = route<{ id: string }>({ pages: ['vault'], fail: 'err.update' }, async ({ req, user, params }) => {
  const t = await prisma.txn.findUnique({ where: { id: params.id }, select: { kind: true, vaultOwnerUserId: true } });
  if (!t) throw notFound();
  const mine = personalVaultId(user);
  // Staff may only edit their own personal-vault ops; owner edits main (null) or any when opening a staff op.
  if (mine && t.vaultOwnerUserId !== mine) throw notFound();
  if (!user.isOwner && !mine) throw notFound();
  const walletOwnerId = user.isOwner ? (t.vaultOwnerUserId ?? null) : mine;
  return saveVaultOp({ ...(await body<VaultOpInput>(req)), kind: t.kind }, user, params.id, { walletOwnerId });
});
