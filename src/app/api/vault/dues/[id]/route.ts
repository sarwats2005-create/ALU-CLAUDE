import { route } from '@/lib/server/api';
import { payDue } from '@/lib/server/dues';

/** Pay one unpaid due from its vault (in full, or as much as the vault holds). */
export const POST = route<{ id: string }>({ pages: ['vault'], fail: 'err.save' }, async ({ user, params }) => payDue(params.id, user));
