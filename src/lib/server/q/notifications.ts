import 'server-only';
import { prisma } from '@/lib/db';

/** The owner's open notifications (staff activity not yet acknowledged), newest first. */
export async function openNotifications(userId: string, limit = 50) {
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({ where: { userId, ackAt: null }, orderBy: { id: 'desc' }, take: limit }),
    prisma.notification.count({ where: { userId, ackAt: null } }),
  ]);
  return {
    total,
    rows: rows.map((n) => ({
      id: n.id,
      action: n.action as 'create' | 'update' | 'delete',
      txnId: n.txnId,
      number: n.number,
      kind: n.kind,
      actorName: n.actorName,
      summary: n.summary,
      totalText: n.totalText,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}
export type NotificationRow = Awaited<ReturnType<typeof openNotifications>>['rows'][number];

/** "I get it": acknowledge some notifications, or all of them. Only the recipient's own rows are touched. */
export async function ackNotifications(userId: string, ids: number[] | 'all') {
  const where = ids === 'all' ? { userId, ackAt: null } : { userId, ackAt: null, id: { in: ids.filter((x) => Number.isInteger(x)).slice(0, 500) } };
  const r = await prisma.notification.updateMany({ where, data: { ackAt: new Date() } });
  return { acked: r.count };
}
