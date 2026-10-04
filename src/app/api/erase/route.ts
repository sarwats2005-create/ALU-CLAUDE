import { route, body } from '@/lib/server/api';
import { enterErase, exitErase, eraseActive, eraseSummary } from '@/lib/server/erase';

/** Owner erase mode: status (GET), enter with the PIN or leave (POST {action}). */
export const GET = route({ owner: true }, async ({ user }) => ({
  until: eraseActive(user) ? user.eraseUntil!.toISOString() : null,
  ...(eraseActive(user) ? await eraseSummary() : { voided: 0 }),
}));

export const POST = route({ owner: true }, async ({ req, user }) => {
  const b = await body<{ action?: string; pin?: unknown }>(req);
  return b.action === 'enter' ? enterErase(user, b.pin) : exitErase();
});
