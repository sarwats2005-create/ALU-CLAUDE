import 'server-only';
import { prisma } from '@/lib/db';
import { D, round2 } from '@/lib/money';
import { dbToIso } from '@/lib/dates';
import { notFound } from '../errors';
import { vaultBalances } from './dashboard';
import { currentRate } from '../common';
import { duesSummary } from '../dues';

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
      archivedAt: true,
      permissions: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!u || u.isOwner) throw notFound();

  const rate = await currentRate();
  const bal = await vaultBalances(u.id);
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
      archivedAt: u.archivedAt?.toISOString() ?? null,
      permissions: u.permissions,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    },
    vault: {
      USD: bal.USD.toString(),
      IQD: bal.IQD.toString(),
      totalUsd: round2(bal.USD.plus(bal.IQD.div(rate))).toString(),
    },
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

/** Owner: every staff vault (active staff first, then archived) with balances, unpaid dues and USD total. */
export async function staffVaults() {
  const rate = await currentRate();
  const users = await prisma.user.findMany({
    where: { isOwner: false },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    select: { id: true, name: true, email: true, archivedAt: true },
  });
  const out = [];
  for (const u of users) {
    const [bal, dues] = await Promise.all([vaultBalances(u.id), duesSummary(u.id)]);
    out.push({
      id: u.id,
      name: u.name,
      email: u.email,
      archived: !!u.archivedAt,
      USD: bal.USD.toString(),
      IQD: bal.IQD.toString(),
      duesUsd: dues.USD.total.toString(),
      duesIqd: dues.IQD.total.toString(),
      totalUsd: round2(bal.USD.plus(bal.IQD.div(rate))).toString(),
    });
  }
  return { rate: rate.toString(), users: out };
}
export type StaffVaults = Awaited<ReturnType<typeof staffVaults>>;
