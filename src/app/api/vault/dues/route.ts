import { route } from '@/lib/server/api';
import { listDues } from '@/lib/server/dues';
import { vaultBalances } from '@/lib/server/q/dashboard';
import { asCurrency } from '@/lib/server/common';
import { personalVaultId } from '@/lib/server/scope';

/** Unpaid vault dues (optionally for one vault), with the cash each vault holds right now. */
export const GET = route({ pages: ['vault'] }, async ({ url, user }) => {
  const ownerUserId = personalVaultId(user);
  const vault = asCurrency(url.searchParams.get('vault')) ?? undefined;
  const [rows, cash] = await Promise.all([listDues(vault, ownerUserId), vaultBalances(ownerUserId)]);
  return { rows, cash: { USD: cash.USD.toString(), IQD: cash.IQD.toString() } };
});
