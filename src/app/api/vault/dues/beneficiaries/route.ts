import { route } from '@/lib/server/api';
import { owedBeneficiaries } from '@/lib/server/q/parties';

/** Beneficiary dues for Vault → Unpaid dues: every beneficiary the factory still owes, largest first. */
export const GET = route({ pages: ['beneficiaries'] }, async () => {
  return { rows: await owedBeneficiaries() };
});
