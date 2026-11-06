import { route } from '@/lib/server/api';
import { vaultOverview } from '@/lib/server/q/dashboard';
import { personalVaultId } from '@/lib/server/scope';

export const GET = route({ pages: ['vault'] }, async ({ user }) => vaultOverview(personalVaultId(user)));
