import type { Metadata } from 'next';
import { requireUser } from '@/lib/server/page';
import { getSettings } from '@/lib/server/common';
import { AboutView, type AboutLive } from './AboutView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How the app works' };

/** Every signed-in user can read the rules. Sections are filtered to the pages they can open. */
export default async function AboutPage() {
  await requireUser();
  const s = await getSettings();
  const live: AboutLive = {
    lowStockKg: s.lowStockKg.toString(),
    customerDueUsd: s.customerDueUsd.toString(),
    beneficiaryDueUsd: s.beneficiaryDueUsd.toString(),
    overdueDays: s.overdueDays,
    vaultMinUsd: s.vaultMinUsd.toString(),
    vaultMinIqd: s.vaultMinIqd.toString(),
    expenseVaultMode: s.expenseVaultMode,
    expensePin: !!s.expensePinHash,
    flags: {
      alertCustomerDue: s.alertCustomerDue,
      alertBeneficiaryDue: s.alertBeneficiaryDue,
      alertOverdue: s.alertOverdue,
      alertLowStock: s.alertLowStock,
      alertVault: s.alertVault,
    },
  };
  return <AboutView live={live} />;
}
