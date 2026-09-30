import { route } from '@/lib/server/api';
import { txnDetail } from '@/lib/server/q/history';
import { deleteTxn } from '@/lib/server/txns';
import { AppError, notFound } from '@/lib/server/errors';
import { canAnyPage, canPage } from '@/lib/permissions';
import { KIND_PAGE, viewPages, type Kind } from '@/lib/kinds';
import { prisma } from '@/lib/db';

type P = { id: string };

export const GET = route<P>({}, async ({ user, params }) => {
  const d = await txnDetail(params.id);
  if (!d) throw notFound();
  if (!canAnyPage(user, viewPages(d.kind as Kind))) throw new AppError(403, 'err.forbidden');
  return d;
});

export const DELETE = route<P>({ fail: 'err.delete' }, async ({ user, params }) => {
  const t = await prisma.txn.findUnique({ where: { id: params.id }, select: { kind: true } });
  if (!t) throw notFound();
  if (!canPage(user, KIND_PAGE[t.kind as Kind])) throw new AppError(403, 'err.forbidden');
  return deleteTxn(params.id, user);
});
