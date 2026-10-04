import { route, body } from '@/lib/server/api';
import { checkMasterPin, startFresh } from '@/lib/server/backup';

/** Start fresh (owner + master PIN). The current data is saved as a restore point first. */
export const POST = route({ owner: true, fail: 'bk.resetFailed' }, async ({ req, user }) => {
  await checkMasterPin(user, (await body<{ pin?: unknown }>(req)).pin);
  return startFresh(user);
});
