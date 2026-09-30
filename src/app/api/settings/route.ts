import { route, body } from '@/lib/server/api';
import { getCompany, getSettings } from '@/lib/server/common';
import { updateRate } from '@/lib/server/catalog';
import { D } from '@/lib/money';
import { canAction } from '@/lib/permissions';
import { AppError } from '@/lib/server/errors';

/** Current exchange rate + company name — every signed-in user needs these for conversions and documents. */
export const GET = route({}, async ({ user }) => {
  const [s, c] = await Promise.all([getSettings(), getCompany()]);
  return {
    exchangeRate: D(s.exchangeRate).toString(),
    company: c.name,
    canEditExchangeRate: canAction(user, 'canEditExchangeRate'),
  };
});

/** Exchange-rate edit: Owner, or any user holding the canEditExchangeRate permission. */
export const PUT = route({ fail: 'err.generic' }, async ({ req, user }) => {
  if (!canAction(user, 'canEditExchangeRate')) throw new AppError(403, 'err.forbidden');
  const b = await body<{ exchangeRate?: unknown }>(req);
  return updateRate(b.exchangeRate, user);
});
