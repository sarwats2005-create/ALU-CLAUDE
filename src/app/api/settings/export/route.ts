import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { exportExcel } from '@/lib/server/maintenance';
import { buildBackup } from '@/lib/server/backup';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { todayIso } from '@/lib/dates';

/**
 * Owner-only full data export. JSON = the complete, checksummed backup (same format as restore points; it can
 * be restored). Excel = one readable sheet per table.
 */
export const GET = route({ owner: true }, async ({ url, user }) => {
  const xlsx = url.searchParams.get('format') === 'xlsx';
  const name = `alu-factory-${todayIso()}`;
  await audit({ user, action: 'export', module: 'settings', reference: xlsx ? 'excel' : 'json' });
  if (xlsx)
    return new NextResponse(new Uint8Array(await exportExcel()), {
      headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': fileName(name, 'xlsx'), 'cache-control': 'no-store' },
    });
  return new NextResponse(JSON.stringify(await buildBackup()), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': fileName(`alu-factory-backup-${todayIso()}`, 'json'), 'cache-control': 'no-store' },
  });
});
