import { route, body } from '@/lib/server/api';
import { saveType } from '@/lib/server/catalog';

/** New aluminum type — from Settings, or inline while recording a purchase. */
export const POST = route({ pages: ['settings', 'beneficiaries'] }, async ({ req, user }) => {
  const r = await saveType(await body<{ name?: string }>(req), user);
  return { id: r.id, name: r.name };
});
