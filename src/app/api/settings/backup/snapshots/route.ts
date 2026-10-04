import { route } from '@/lib/server/api';
import { listSnapshots, saveSnapshot } from '@/lib/server/backup';

/** Restore points kept in the database (owner only). POST = save one now. */
export const GET = route({ owner: true }, async () => ({ rows: await listSnapshots() }));
export const POST = route({ owner: true, fail: 'err.save' }, async ({ user }) => {
  const s = await saveSnapshot('manual', user.name);
  return { id: s.id, createdAt: s.createdAt.toISOString() };
});
