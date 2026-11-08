import { route, body } from '@/lib/server/api';
import { ackNotifications, openNotifications } from '@/lib/server/q/notifications';

/** Owner: staff activity waiting to be acknowledged. */
export const GET = route({ owner: true }, async ({ user }) => openNotifications(user.id));

/** Owner: "I get it" — body { ids: number[] } or { all: true }. */
export const POST = route({ owner: true }, async ({ req, user }) => {
  const b = await body<{ ids?: unknown; all?: unknown }>(req);
  if (b.all === true) return ackNotifications(user.id, 'all');
  return ackNotifications(user.id, Array.isArray(b.ids) ? b.ids.map(Number) : []);
});
