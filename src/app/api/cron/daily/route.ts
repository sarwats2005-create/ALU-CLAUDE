import { NextResponse, type NextRequest } from 'next/server';
import { ensureDailySnapshot } from '@/lib/server/backup';
import { runRecurringExpenses } from '@/lib/server/expenses';

/**
 * Optional 24/7 trigger for a scheduler (e.g. a Railway cron service running
 * `curl -H "Authorization: Bearer $CRON_SECRET" https://alufactoryerp.com/api/cron/daily`).
 * Takes the daily restore point and posts due recurring expenses even when nobody opens the app.
 * Disabled unless CRON_SECRET is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const snapshot = await ensureDailySnapshot();
  const expenses = await runRecurringExpenses();
  return NextResponse.json({ ok: true, snapshot, expenses });
}
