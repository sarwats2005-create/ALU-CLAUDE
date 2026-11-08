import { route, body } from '@/lib/server/api';
import { collectStaffVault, type FundStaffInput } from '@/lib/server/txns';

/** Owner takes money back from a staff vault into the main vault. */
export const POST = route({ owner: true, fail: 'err.save' }, async ({ req, user }) => collectStaffVault(await body<FundStaffInput>(req), user));
