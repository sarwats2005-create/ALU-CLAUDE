import { NextResponse } from 'next/server';
import { destroySession, getSessionUser } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';

export async function POST() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ user: { id: user.id, name: user.name }, action: 'logout', module: 'auth', reference: user.email });
  return NextResponse.json({ ok: true });
}
