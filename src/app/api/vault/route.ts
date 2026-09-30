import { route } from '@/lib/server/api';
import { vaultOverview } from '@/lib/server/q/dashboard';

export const GET = route({ pages: ['vault'] }, async () => vaultOverview());
