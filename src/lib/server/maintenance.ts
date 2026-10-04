import 'server-only';
import { prisma, withTx } from '@/lib/db';
import { dbToIso } from '@/lib/dates';
import { audit } from './audit';
import { buildBackup } from './backup';
import { conflict } from './errors';
import type { Actor } from './txns';

/** Excel workbook from the same consistent backup as the JSON (one sheet per table, logins without passwords). */
export async function exportExcel(): Promise<Buffer> {
  const { data: d } = await buildBackup();
  const data: Record<string, Record<string, unknown>[]> = {
    customers: d.customer.map((c) => ({ ...c, avatar: c.avatar ? '[picture]' : null })),
    beneficiaries: d.beneficiary,
    aluminumTypes: d.aluminumType,
    products: d.product,
    transactions: d.txn,
    transactionLines: d.txnLine,
    vaultLedger: d.vaultEntry,
    unpaidDues: d.vaultDue,
    partyLedger: d.partyEntry,
    stockLedger: d.stockEntry,
    expenseCategories: d.expenseCategory,
    recurringExpenses: d.recurringExpense,
    rateLog: d.exchangeRateLog,
    users: d.user.map(({ passwordHash: _p, ...u }) => u),
  };
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
    ['Unpaid dues', 'unpaidDues'],
    ['Stock ledger', 'stockLedger'],
    ['Expense categories', 'expenseCategories'],
    ['Recurring expenses', 'recurringExpenses'],
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
