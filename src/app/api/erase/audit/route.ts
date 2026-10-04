import { route, body } from '@/lib/server/api';
import { eraseAudit } from '@/lib/server/erase';

/** Erase audit-log lines by id (erase mode only). */
export const POST = route({ owner: true, fail: 'err.delete' }, async ({ req, user }) => eraseAudit(user, (await body<{ ids?: unknown }>(req)).ids));
