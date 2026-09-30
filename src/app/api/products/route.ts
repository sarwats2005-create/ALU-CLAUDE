import { route, body } from '@/lib/server/api';
import { saveProduct, type ProductInput } from '@/lib/server/catalog';
import { prisma } from '@/lib/db';

export const POST = route({ pages: ['settings', 'inventory', 'beneficiaries'] }, async ({ req, user }) => {
  const p = await saveProduct(await body<ProductInput>(req), user);
  return { id: p.id, name: p.name, sku: p.sku };
});

/** Product catalogue for Settings (with type, threshold and whether it can still be deleted). */
export const GET = route({ pages: ['settings', 'inventory'] }, async () => {
  const rows = await prisma.product.findMany({ orderBy: { name: 'asc' }, include: { type: true, _count: { select: { lines: true, stock: true, processing: true } } } });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    typeId: p.typeId,
    typeName: p.type.name,
    lowStockKg: p.lowStockKg?.toString() ?? null,
    isDemo: p.isDemo,
    inUse: p._count.lines + p._count.stock + p._count.processing > 0,
  }));
});
