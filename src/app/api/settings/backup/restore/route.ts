import { route, body } from '@/lib/server/api';
import { checkMasterPin, restoreBackup, snapshotFile } from '@/lib/server/backup';

/** Restore everything from an uploaded backup file or a restore point. Owner + master PIN. */
export const POST = route({ owner: true, fail: 'bk.restoreFailed' }, async ({ req, user }) => {
  const b = await body<{ pin?: unknown; file?: unknown; snapshotId?: string }>(req);
  await checkMasterPin(user, b.pin);
  if (b.snapshotId) return restoreBackup(user, await snapshotFile(b.snapshotId), 'restore point');
  return restoreBackup(user, b.file, 'file');
});
