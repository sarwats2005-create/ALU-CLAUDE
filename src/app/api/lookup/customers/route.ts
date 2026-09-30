import { partyLookup } from '@/lib/server/party-api';

export const { GET } = partyLookup('customer', ['pos', 'customers', 'reports', 'dashboard']);
