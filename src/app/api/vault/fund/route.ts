import { route, body } from '@/lib/server/api';
import { fundStaffVault, type FundStaffInput } from '@/lib/server/txns';

/** Owner moves cash from the main vault into a staff personal vault. */
export const POST = route({ owner: true, pages: ['vault'], fail: 'err.save' }, async ({ req, user }) =>
  fundStaffVault(await body<FundStaffInput>(req), user),
);
