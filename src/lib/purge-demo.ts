import type { Prisma } from '@prisma/client';

/**
 * Deletes every row flagged `isDemo` (and related ledger lines). Safe to run on deploy;
 * refuses when a live transaction still references demo parties or products.
 */
export async function purgeDemoTx(tx: Prisma.TransactionClient) {
  const touchesDemo = [
    { customer: { isDemo: true } },
    { beneficiary: { isDemo: true } },
    { product: { isDemo: true } },
    { lines: { some: { product: { isDemo: true } } } },
  ];
  const realOnDemo = await tx.txn.count({ where: { isDemo: false, deletedAt: null, OR: touchesDemo } });
  if (realOnDemo > 0) {
    throw new Error(`Cannot purge demo data: ${realOnDemo} real transaction(s) still reference demo records.`);
  }
  const ids = (
    await tx.txn.findMany({
      where: { OR: [{ isDemo: true }, { isDemo: false, deletedAt: { not: null }, OR: touchesDemo }] },
      select: { id: true },
    })
  ).map((x) => x.id);
  await tx.vaultEntry.deleteMany({ where: { txnId: { in: ids } } });
  await tx.partyEntry.deleteMany({ where: { txnId: { in: ids } } });
  await tx.stockEntry.deleteMany({ where: { txnId: { in: ids } } });
  await tx.txnLine.deleteMany({ where: { txnId: { in: ids } } });
  await tx.txn.deleteMany({ where: { id: { in: ids } } });
  await tx.customer.deleteMany({ where: { isDemo: true } });
  await tx.beneficiary.deleteMany({ where: { isDemo: true } });
  await tx.product.deleteMany({ where: { isDemo: true, lines: { none: {} }, stock: { none: {} }, processing: { none: {} } } });
  await tx.aluminumType.deleteMany({ where: { isDemo: true, products: { none: {} } } });
  await tx.$executeRaw`
    UPDATE "VaultEntry" v SET "balanceAfter" = x.run
    FROM (SELECT id, SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) OVER (PARTITION BY vault ORDER BY id) AS run FROM "VaultEntry") x
    WHERE v.id = x.id`;
}
