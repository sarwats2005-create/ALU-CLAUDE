import 'server-only';
import type { Currency } from '@prisma/client';
import { prisma, withTx, type Tx } from '@/lib/db';
import { D, Dec, fmtMoney } from '@/lib/money';
import { dbToIso, isoToDb, todayIso } from '@/lib/dates';
import { AppError, conflict, notFound } from './errors';
import { lockVaults, vaultBalance, vaultMove } from './ledger';
import { audit } from './audit';
import type { Actor } from './txns';

// Unpaid vault dues: the part of a payment that the vault couldn't cover when it was recorded (the user
// confirmed "continue anyway"). Paying a due takes the money out of the vault now, as a movement on the
// original document, so deleting or editing that document undoes the payment too.

const open = { settledAt: null, txn: { deletedAt: null } } as const;

export async function listDues(vault?: Currency) {
  const rows = await prisma.vaultDue.findMany({
    where: { ...open, ...(vault ? { vault } : {}) },
    orderBy: { createdAt: 'asc' },
    include: {
      txn: {
        select: {
          id: true,
          number: true,
          kind: true,
          date: true,
          total: true,
          currency: true,
          label: true,
          notes: true,
          createdByName: true,
          customer: { select: { name: true } },
          beneficiary: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    vault: d.vault,
    amount: d.amount.toString(),
    paid: d.paid.toString(),
    remaining: D(d.amount).minus(D(d.paid)).toString(),
    createdAt: d.createdAt.toISOString(),
    txn: {
      id: d.txn.id,
      number: d.txn.number,
      kind: d.txn.kind,
      date: dbToIso(d.txn.date),
      total: d.txn.total.toString(),
      currency: d.txn.currency,
      party: d.txn.customer?.name ?? d.txn.beneficiary?.name ?? d.txn.label ?? '',
      notes: d.txn.notes,
      by: d.txn.createdByName,
    },
  }));
}
export type DueRow = Awaited<ReturnType<typeof listDues>>[number];

/** Unpaid total + count per vault (for vault cards, alerts and the "pay now" reminder). */
export async function duesSummary() {
  const rows = await prisma.vaultDue.findMany({ where: open, select: { vault: true, amount: true, paid: true } });
  const out: Record<Currency, { total: Dec; count: number }> = { USD: { total: new Dec(0), count: 0 }, IQD: { total: new Dec(0), count: 0 } };
  for (const r of rows) {
    out[r.vault].total = out[r.vault].total.plus(D(r.amount).minus(D(r.paid)));
    out[r.vault].count++;
  }
  return out;
}

/** Pay one due from its vault: all of it, or as much as the vault holds. Returns the amount paid. */
async function payOne(tx: Tx, dueId: string, actor: Actor): Promise<Dec> {
  const due = await tx.vaultDue.findUnique({ where: { id: dueId }, include: { txn: { select: { id: true, kind: true, number: true, deletedAt: true } } } });
  if (!due || due.settledAt || due.txn.deletedAt) return new Dec(0);
  const remaining = D(due.amount).minus(D(due.paid));
  const cash = await vaultBalance(tx, due.vault);
  const pay = Dec.min(remaining, cash.gt(0) ? cash : new Dec(0));
  if (!pay.gt(0)) return new Dec(0);
  const today = todayIso();
  await vaultMove(tx, { txnId: due.txnId, kind: due.txn.kind, date: isoToDb(today) }, due.vault, 'OUT', pay, false, due.id);
  const paid = D(due.paid).plus(pay);
  await tx.vaultDue.update({ where: { id: due.id }, data: { paid: paid.toString(), settledAt: paid.gte(D(due.amount)) ? new Date() : null } });
  await audit(
    { user: actor, action: 'update', module: 'vault', reference: `${due.txn.number} due paid`, before: { remaining: remaining.toString() }, after: { paid: pay.toString(), remaining: remaining.minus(pay).toString(), vault: due.vault } },
    tx,
  );
  return pay;
}

export async function payDue(dueId: string, actor: Actor) {
  return withTx(async (tx) => {
    await lockVaults(tx);
    const due = await tx.vaultDue.findUnique({ where: { id: dueId } });
    if (!due) throw notFound();
    if (due.settledAt) throw conflict('due.alreadyPaid');
    const paid = await payOne(tx, dueId, actor);
    if (!paid.gt(0)) throw new AppError(409, 'due.noCash', { vault: `@@vault.${due.vault}` });
    const left = D(due.amount).minus(D(due.paid)).minus(paid);
    return { paid: fmtMoney(paid, due.vault), left: left.gt(0) ? fmtMoney(left, due.vault) : null };
  });
}

/** Pay the oldest dues of a vault first, until they're all paid or the vault is empty. */
export async function payAllDues(vault: Currency, actor: Actor) {
  return withTx(async (tx) => {
    await lockVaults(tx);
    const dues = await tx.vaultDue.findMany({ where: { vault, ...open }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    let total = new Dec(0);
    let count = 0;
    for (const d of dues) {
      const p = await payOne(tx, d.id, actor);
      if (!p.gt(0)) break;
      total = total.plus(p);
      count++;
    }
    if (!total.gt(0)) throw new AppError(409, 'due.noCash', { vault: `@@vault.${vault}` });
    return { paid: fmtMoney(total, vault), count };
  });
}
