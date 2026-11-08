import 'server-only';
import type { Tx } from '@/lib/db';
import { D, fmtKg, fmtMoney } from '@/lib/money';

/** Who did it. `isOwner === false` marks a staff user; anything else (owner, system, demo) is not notified. */
export type NotifyActor = { id: string; name: string; isOwner?: boolean };
export type NotifyAction = 'create' | 'update' | 'delete';

/**
 * Tell the owner that a staff user created, edited or deleted a document. Written in the same transaction as
 * the change, so a notification exists exactly when the change was saved. Cleared by the owner ("I get it").
 */
export async function notifyOwner(tx: Tx, actor: NotifyActor | null | undefined, txnId: string, action: NotifyAction) {
  if (!actor || actor.isOwner !== false) return;
  const t = await tx.txn.findUnique({
    where: { id: txnId },
    select: {
      number: true,
      kind: true,
      total: true,
      currency: true,
      label: true,
      outputKg: true,
      inputKg: true,
      customer: { select: { name: true } },
      beneficiary: { select: { name: true } },
    },
  });
  if (!t) return;
  const owners = await tx.user.findMany({ where: { isOwner: true }, select: { id: true } });
  if (!owners.length) return;
  const total = D(t.total);
  const totalText = total.gt(0) ? fmtMoney(total, t.currency) : t.inputKg && D(t.inputKg).gt(0) ? fmtKg(D(t.inputKg)) : '';
  const summary = (t.customer?.name ?? t.beneficiary?.name ?? t.label ?? '').slice(0, 160);
  await tx.notification.createMany({
    data: owners.map((o) => ({
      userId: o.id,
      action,
      txnId,
      number: t.number,
      kind: t.kind,
      actorId: actor.id,
      actorName: actor.name,
      summary,
      totalText,
    })),
  });
}
