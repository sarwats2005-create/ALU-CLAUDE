import { route, body } from '@/lib/server/api';
import { savePayment, type PaymentInput } from '@/lib/server/txns';
import { AppError, notFound } from '@/lib/server/errors';
import { canPage } from '@/lib/permissions';
import { prisma } from '@/lib/db';

export const PUT = route<{ id: string }>({ pages: ['customers', 'beneficiaries'], fail: 'err.update' }, async ({ req, user, params }) => {
  const t = await prisma.txn.findUnique({ where: { id: params.id }, select: { kind: true } });
  if (!t) throw notFound();
  if (!canPage(user, t.kind.startsWith('CUSTOMER') ? 'customers' : 'beneficiaries')) throw new AppError(403, 'err.forbidden');
  const b = await body<PaymentInput>(req);
  return savePayment({ ...b, kind: t.kind }, user, params.id);
});
