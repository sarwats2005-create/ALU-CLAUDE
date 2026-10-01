import 'server-only';
import { prisma } from '@/lib/db';
import { D, fmtKg, fmtMoney, round2 } from '@/lib/money';
import { t, type Lang } from '@/lib/i18n';
import { canPage, type PermUser } from '@/lib/permissions';
import { getSettings } from '../common';
import { vaultBalances } from './dashboard';
import { duesSummary } from '../dues';
import { allPartyEffects, fifoAging } from './parties';
import { s } from './sql';

export type Alert = {
  key: string;
  type: 'customerDue' | 'beneficiaryDue' | 'lowStock' | 'vault' | 'overdue';
  severity: 'danger' | 'warning';
  text: string;
  href: string;
  unread: boolean;
};

/** Alerts are derived live from the ledger; the key embeds the value so a changed situation re-alerts. */
export async function computeAlerts(user: PermUser & { id: string }, lang: Lang): Promise<Alert[]> {
  const st = await getSettings();
  const out: Omit<Alert, 'unread'>[] = [];

  if (st.alertCustomerDue && canPage(user, 'customers')) {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT c.id, c.name, SUM(pe."amountUsd") AS bal FROM "PartyEntry" pe JOIN "Customer" c ON c.id = pe."customerId"
      GROUP BY c.id, c.name HAVING SUM(pe."amountUsd") > ${D(st.customerDueUsd).toString()}::numeric ORDER BY bal DESC LIMIT 50`;
    for (const r of rows) {
      const bal = round2(D(s(r.bal)));
      out.push({ key: `cdue:${r.id}:${bal}`, type: 'customerDue', severity: 'danger', text: t('alerts.customerDue', lang, { name: String(r.name), x: fmtMoney(bal) }), href: `/customers/${r.id}` });
    }
  }
  if (st.alertBeneficiaryDue && canPage(user, 'beneficiaries')) {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT b.id, b.name, SUM(pe."amountUsd") AS bal FROM "PartyEntry" pe JOIN "Beneficiary" b ON b.id = pe."beneficiaryId"
      GROUP BY b.id, b.name HAVING SUM(pe."amountUsd") > ${D(st.beneficiaryDueUsd).toString()}::numeric ORDER BY bal DESC LIMIT 50`;
    for (const r of rows) {
      const bal = round2(D(s(r.bal)));
      out.push({ key: `bdue:${r.id}:${bal}`, type: 'beneficiaryDue', severity: 'warning', text: t('alerts.beneficiaryDue', lang, { name: String(r.name), x: fmtMoney(bal) }), href: `/beneficiaries/${r.id}` });
    }
  }
  if (st.alertLowStock && canPage(user, 'inventory')) {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT p.id, p.name, p.sku, SUM(se.kg) AS kg, COALESCE(p."lowStockKg", ${D(st.lowStockKg).toString()}::numeric) AS th
      FROM "Product" p JOIN "StockEntry" se ON se."productId" = p.id
      GROUP BY p.id, p.name, p.sku, p."lowStockKg"
      HAVING SUM(se.kg) <= COALESCE(p."lowStockKg", ${D(st.lowStockKg).toString()}::numeric)
      ORDER BY kg ASC LIMIT 50`;
    for (const r of rows) {
      const kg = D(s(r.kg));
      out.push({
        key: `stock:${r.id}:${kg}`,
        type: 'lowStock',
        severity: kg.lte(0) ? 'danger' : 'warning',
        text: kg.lte(0) ? t('alerts.outStock', lang, { product: `${r.name} (${r.sku})` }) : t('alerts.lowStock', lang, { product: `${r.name} (${r.sku})`, kg: fmtKg(kg) }),
        href: `/inventory?product=${r.id}`,
      });
    }
  }
  if (st.alertVault && canPage(user, 'vault')) {
    const bal = await vaultBalances();
    for (const v of ['USD', 'IQD'] as const) {
      const b = bal[v];
      const min = D(v === 'USD' ? st.vaultMinUsd : st.vaultMinIqd);
      const vaultName = t(v === 'USD' ? 'vault.USD' : 'vault.IQD', lang);
      if (b.isNegative()) out.push({ key: `vault:${v}:${b}`, type: 'vault', severity: 'danger', text: t('alerts.vaultNegative', lang, { vault: vaultName, x: fmtMoney(b, v) }), href: '/vault' });
      else if (b.lt(min)) out.push({ key: `vaultmin:${v}:${b}`, type: 'vault', severity: 'warning', text: t('alerts.vaultLow', lang, { vault: vaultName, x: fmtMoney(b, v) }), href: '/vault' });
    }
  }
  // Unpaid vault dues are always shown (they are money the factory still has to pay out).
  if (canPage(user, 'vault')) {
    const dues = await duesSummary();
    for (const v of ['USD', 'IQD'] as const) {
      const d = dues[v];
      if (d.count > 0)
        out.push({
          key: `dues:${v}:${d.count}:${d.total}`,
          type: 'vault',
          severity: 'danger',
          text: t('alerts.vaultDues', lang, { vault: t(v === 'USD' ? 'vault.USD' : 'vault.IQD', lang), n: d.count, x: fmtMoney(d.total, v) }),
          href: '/vault/dues',
        });
    }
  }
  if (st.alertOverdue && canPage(user, 'customers')) {
    const parties = await allPartyEffects('customer');
    for (const p of parties) {
      const a = fifoAging(p.rows);
      if (a.total.gt(0) && a.oldestDays > st.overdueDays) {
        out.push({ key: `overdue:${p.id}:${a.oldestDays}`, type: 'overdue', severity: 'warning', text: t('alerts.overdue', lang, { name: p.name, n: a.oldestDays }), href: `/customers/${p.id}` });
      }
    }
  }

  const read = out.length
    ? await prisma.alertRead.findMany({ where: { userId: user.id, alertKey: { in: out.map((a) => a.key) } }, select: { alertKey: true } })
    : [];
  const readSet = new Set(read.map((r) => r.alertKey));
  return out.map((a) => ({ ...a, unread: !readSet.has(a.key) }));
}

export async function markAlertsRead(userId: string, keys: string[]) {
  const uniq = [...new Set(keys.filter((k) => typeof k === 'string' && k.length < 200))].slice(0, 500);
  if (!uniq.length) return;
  await prisma.alertRead.createMany({ data: uniq.map((alertKey) => ({ userId, alertKey })), skipDuplicates: true });
}
