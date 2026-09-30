import { partyLookup } from '@/lib/server/party-api';

export const { GET } = partyLookup('beneficiary', ['beneficiaries', 'reports', 'inventory', 'dashboard']);
