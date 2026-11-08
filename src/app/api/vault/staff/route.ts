import { route } from '@/lib/server/api';
import { staffVaults } from '@/lib/server/q/users';

/** Owner: every staff vault with its USD / IQD balance and unpaid dues. */
export const GET = route({ owner: true }, async () => staffVaults());
