import { route } from '@/lib/server/api';
import { moneyPosition, vaultOverview } from '@/lib/server/q/dashboard';
import { personalVaultId } from '@/lib/server/scope';

/** Vault cards. Staff: their own vault. Owner: the main vault plus the money position (debts on both sides). */
export const GET = route({ pages: ['vault'] }, async ({ user }) => {
  const overview = await vaultOverview(personalVaultId(user));
  return user.isOwner ? { ...overview, position: await moneyPosition() } : { ...overview, position: null };
});
