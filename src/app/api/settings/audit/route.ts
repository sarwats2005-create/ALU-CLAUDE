import type { Prisma } from '@prisma/client';
import { route, listParams } from '@/lib/server/api';
import { prisma } from '@/lib/db';
import { isValidIsoDate, isoToDb, addDaysIso } from '@/lib/dates';

/** Audit log (owner only): who did what, when, with before/after snapshots. */
export const GET = route({ owner: true }, async ({ url }) => {
  const p = listParams(url, ['createdAt'], 'createdAt', 'desc');
  const sp = url.searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.get('module')) where.module = sp.get('module')!;
  if (sp.get('action')) where.action = sp.get('action')!;
  const from = sp.get('from');
  const to = sp.get('to');
  if (isValidIsoDate(from) || isValidIsoDate(to))
    where.createdAt = { ...(isValidIsoDate(from) ? { gte: isoToDb(from) } : {}), ...(isValidIsoDate(to) ? { lt: isoToDb(addDaysIso(to, 1)) } : {}) };
  if (p.q) where.OR = [{ reference: { contains: p.q, mode: 'insensitive' } }, { userName: { contains: p.q, mode: 'insensitive' } }];
  const [rows, total, modules] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { id: p.dir === 'asc' ? 'asc' : 'desc' }, take: p.size, skip: p.offset }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
  ]);
  return {
    total,
    modules: modules.map((m) => m.module),
    rows: rows.map((r) => ({ id: r.id, userName: r.userName, action: r.action, module: r.module, reference: r.reference, before: r.before, after: r.after, createdAt: r.createdAt.toISOString() })),
  };
});
