import { route } from '@/lib/server/api';
import { prisma } from '@/lib/db';

export const GET = route({ pages: ['beneficiaries', 'inventory', 'settings', 'reports', 'dashboard'] }, async () => {
  const rows = await prisma.aluminumType.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.name, isDemo: r.isDemo, products: r._count.products }));
});
