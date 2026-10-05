import { route, body } from '@/lib/server/api';
import { revertProcessing } from '@/lib/server/txns';
import { checkMasterPin } from '@/lib/server/backup';

/** Revert a processing run to raw stock (finished kg + loss back to raw). Needs Inventory access and the master PIN. */
export const POST = route<{ id: string }>({ pages: ['inventory'], fail: 'err.save' }, async ({ req, user, params }) => {
  await checkMasterPin(user, (await body<{ pin?: unknown }>(req)).pin, { ownerOnly: false });
  return revertProcessing(params.id, user);
});
