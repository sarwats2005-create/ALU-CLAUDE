import { route } from '@/lib/server/api';
import { peekSku } from '@/lib/server/catalog';

/** Preview of the code the next new product will get (shown in the product forms; nothing is reserved). */
export const GET = route({ pages: ['settings', 'inventory', 'beneficiaries'] }, async () => ({ sku: await peekSku() }));
