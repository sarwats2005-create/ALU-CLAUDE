import { route, body } from '@/lib/server/api';
import { savePayment, type PaymentInput } from '@/lib/server/txns';
import { AppError } from '@/lib/server/errors';
import { canPage } from '@/lib/permissions';

/** Customer payments/refunds need Customers access; beneficiary payments/refunds need Beneficiaries access. */
export const POST = route({ pages: ['customers', 'beneficiaries'], fail: 'err.save' }, async ({ req, user }) => {
  const b = await body<PaymentInput>(req);
  const page = String(b.kind ?? '').startsWith('CUSTOMER') ? 'customers' : 'beneficiaries';
  if (!canPage(user, page)) throw new AppError(403, 'err.forbidden');
  return savePayment(b, user);
});
