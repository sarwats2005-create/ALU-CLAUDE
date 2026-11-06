import 'server-only';
import { prisma } from '@/lib/db';
import { D, round2 } from '@/lib/money';
import { dbToIso } from '@/lib/dates';
import { notFound } from '../errors';
import { vaultBalances } from './dashboard';
import { currentRate } from '../common';

/** Owner-facing activity for one staff user: personal vault balances + recent txns they own or created. */
export async function userActivity(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isOwner: true,
      active: true,
      hasPersonalVault: true,
      permissions: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!u || u.isOwner) throw notFound();

  const rate = await currentRate();
  const bal = u.hasPersonalVault ? await vaultBalances(u.id) : { USD: D(0), IQD: D(0) };
  const txns = await prisma.txn.findMany({
    where: {
      deletedAt: null,
      OR: [{ createdById: u.id }, { vaultOwnerUserId: u.id }, { fundUserId: u.id }],
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      number: true,
      kind: true,
      date: true,
      total: true,
      currency: true,
      vault: true,
      vaultAmount: true,
      label: true,
      notes: true,
      createdByName: true,
      vaultOwnerUserId: true,
      fundUserId: true,
    },
  });

  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      active: u.active,
      hasPersonalVault: u.hasPersonalVault,
      permissions: u.permissions,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    },
    vault: u.hasPersonalVault
      ? {
          USD: bal.USD.toString(),
          IQD: bal.IQD.toString(),
          totalUsd: round2(bal.USD.plus(bal.IQD.div(rate))).toString(),
        }
      : null,
    rate: rate.toString(),
    rows: txns.map((t) => ({
      id: t.id,
      number: t.number,
      kind: t.kind,
      date: dbToIso(t.date),
      total: t.total.toString(),
      currency: t.currency,
      vault: t.vault,
      vaultAmount: t.vaultAmount.toString(),
      label: t.label,
      notes: t.notes,
      createdByName: t.createdByName,
      personal: !!t.vaultOwnerUserId,
    })),
  };
}
export type UserActivity = Awaited<ReturnType<typeof userActivity>>;
