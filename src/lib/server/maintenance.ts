import 'server-only';
import { prisma, withTx } from '@/lib/db';
import { dbToIso } from '@/lib/dates';
import { audit, jsonSafe } from './audit';
import { conflict } from './errors';
import type { Actor } from './txns';

/** Complete copy of every business record (users without password hashes; sessions excluded). */
export async function exportAll() {
  const [company, settings, rateLog, types, products, customers, beneficiaries, txns, lines, vault, party, stock, counters, users, auditLog] = await Promise.all([
    prisma.companyProfile.findMany(),
    prisma.appSettings.findMany(),
    prisma.exchangeRateLog.findMany({ orderBy: { id: 'asc' } }),
    prisma.aluminumType.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.findMany({ orderBy: { sku: 'asc' } }),
    prisma.customer.findMany({ orderBy: { name: 'asc' } }),
    prisma.beneficiary.findMany({ orderBy: { name: 'asc' } }),
    prisma.txn.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.txnLine.findMany({ orderBy: [{ txnId: 'asc' }, { position: 'asc' }] }),
    prisma.vaultEntry.findMany({ orderBy: { id: 'asc' } }),
    prisma.partyEntry.findMany({ orderBy: { id: 'asc' } }),
    prisma.stockEntry.findMany({ orderBy: { id: 'asc' } }),
    prisma.counter.findMany(),
    prisma.user.findMany({ select: { id: true, email: true, name: true, isOwner: true, active: true, lang: true, permissions: true, lastLoginAt: true, createdAt: true } }),
    prisma.auditLog.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return jsonSafe({
    app: 'ALU FACTORY',
    exportedAt: new Date().toISOString(),
    version: 1,
    company,
    settings,
    rateLog,
    aluminumTypes: types,
    products,
    customers: customers.map((c) => ({ ...c, avatar: c.avatar ? '[image]' : null })),
    beneficiaries,
    transactions: txns,
    transactionLines: lines,
    vaultLedger: vault,
    partyLedger: party,
    stockLedger: stock,
    counters,
    users,
    auditLog,
  }) as Record<string, unknown>;
}

/** Excel workbook: one sheet per table, header row bold and frozen. */
export async function exportExcel(): Promise<Buffer> {
  const data = await exportAll();
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ALU FACTORY';
  wb.created = new Date();
  const sheets: [string, string][] = [
    ['Customers', 'customers'],
    ['Beneficiaries', 'beneficiaries'],
    ['Aluminum types', 'aluminumTypes'],
    ['Products', 'products'],
    ['Transactions', 'transactions'],
    ['Transaction lines', 'transactionLines'],
    ['Vault ledger', 'vaultLedger'],
    ['Party ledger', 'partyLedger'],
    ['Stock ledger', 'stockLedger'],
    ['Rate log', 'rateLog'],
    ['Users', 'users'],
  ];
  for (const [name, key] of sheets) {
    const rows = (data[key] as Record<string, unknown>[]) ?? [];
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const cols = rows.length ? Object.keys(rows[0]) : ['(empty)'];
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c, typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]])));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function demoCount() {
  const [txns, customers, beneficiaries, products, types] = await Promise.all([
    prisma.txn.count({ where: { isDemo: true } }),
    prisma.customer.count({ where: { isDemo: true } }),
    prisma.beneficiary.count({ where: { isDemo: true } }),
    prisma.product.count({ where: { isDemo: true } }),
    prisma.aluminumType.count({ where: { isDemo: true } }),
  ]);
  return { total: txns + customers + beneficiaries + products + types, txns, customers, beneficiaries, products, types };
}

/**
 * Remove every demo record. Refused when a real (non-demo) transaction uses a demo customer,
 * beneficiary or product — removing those would break real history. Vault running balances are
 * recomputed afterwards so real entries stay consistent.
 */
export async function removeDemo(actor: Actor) {
  return withTx(async (tx) => {
    const touchesDemo = [{ customer: { isDemo: true } }, { beneficiary: { isDemo: true } }, { product: { isDemo: true } }, { lines: { some: { product: { isDemo: true } } } }];
    const realOnDemo = await tx.txn.count({ where: { isDemo: false, deletedAt: null, OR: touchesDemo } });
    if (realOnDemo > 0) throw conflict('set.demoInUse', { n: realOnDemo });
    // Demo documents, plus deleted (tombstoned) real documents that pointed at demo records: their effects
    // are already reversed, their snapshot is in the audit log, and their numbers are never reused.
    const ids = (await tx.txn.findMany({ where: { OR: [{ isDemo: true }, { isDemo: false, deletedAt: { not: null }, OR: touchesDemo }] }, select: { id: true } })).map((x) => x.id);
    const counts = await demoCountTx(tx);
    await tx.vaultEntry.deleteMany({ where: { txnId: { in: ids } } });
    await tx.partyEntry.deleteMany({ where: { txnId: { in: ids } } });
    await tx.stockEntry.deleteMany({ where: { txnId: { in: ids } } });
    await tx.txnLine.deleteMany({ where: { txnId: { in: ids } } });
    await tx.txn.deleteMany({ where: { id: { in: ids } } });
    await tx.customer.deleteMany({ where: { isDemo: true } });
    await tx.beneficiary.deleteMany({ where: { isDemo: true } });
    await tx.product.deleteMany({ where: { isDemo: true, lines: { none: {} }, stock: { none: {} }, processing: { none: {} } } });
    await tx.aluminumType.deleteMany({ where: { isDemo: true, products: { none: {} } } });
    // Recompute each vault's running balance over the remaining (real) entries.
    await tx.$executeRaw`
      UPDATE "VaultEntry" v SET "balanceAfter" = x.run
      FROM (SELECT id, SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) OVER (PARTITION BY vault ORDER BY id) AS run FROM "VaultEntry") x
      WHERE v.id = x.id`;
    await audit({ user: actor, action: 'delete', module: 'settings', reference: 'demo data', before: counts }, tx);
    return counts;
  });
}

async function demoCountTx(tx: Parameters<Parameters<typeof withTx>[0]>[0]) {
  const [txns, customers, beneficiaries, products] = await Promise.all([
    tx.txn.count({ where: { isDemo: true } }),
    tx.customer.count({ where: { isDemo: true } }),
    tx.beneficiary.count({ where: { isDemo: true } }),
    tx.product.count({ where: { isDemo: true } }),
  ]);
  return { txns, customers, beneficiaries, products, at: dbToIso(new Date()) };
}
