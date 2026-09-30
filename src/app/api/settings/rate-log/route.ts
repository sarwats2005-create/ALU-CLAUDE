import { prisma } from '@/lib/db';
import { route } from '@/lib/server/api';

/** Rate change log (old, new, user, timestamp) — visible to anyone who can see the vault or settings. */
export const GET = route({ pages: ['vault', 'settings'] }, async () => {
  const rows = await prisma.exchangeRateLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  return {
    rows: rows.map((r) => ({ id: r.id, oldRate: r.oldRate.toString(), newRate: r.newRate.toString(), userName: r.userName, createdAt: r.createdAt.toISOString() })),
  };
});
