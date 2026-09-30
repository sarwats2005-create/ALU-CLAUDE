import { route, body } from '@/lib/server/api';
import { computeAlerts, markAlertsRead } from '@/lib/server/q/alerts';

export const GET = route({}, async ({ user, lang }) => {
  const alerts = await computeAlerts(user, lang);
  return { alerts, unread: alerts.filter((a) => a.unread).length };
});

export const POST = route({}, async ({ req, user }) => {
  const b = await body<{ keys?: unknown }>(req);
  await markAlertsRead(user.id, Array.isArray(b.keys) ? (b.keys as string[]) : []);
  return { ok: true };
});
