import { route } from '@/lib/server/api';
import { demoCount, removeDemo } from '@/lib/server/maintenance';

export const GET = route({ owner: true }, async () => demoCount());
export const DELETE = route({ owner: true }, async ({ user }) => removeDemo(user));
