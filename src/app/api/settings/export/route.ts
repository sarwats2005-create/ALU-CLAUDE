import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { exportAll, exportExcel } from '@/lib/server/maintenance';
import { fileName } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';
import { todayIso } from '@/lib/dates';

/** Owner-only full data export (JSON backup or Excel workbook). */
export const GET = route({ owner: true }, async ({ url, user }) => {
  const xlsx = url.searchParams.get('format') === 'xlsx';
  const name = `alu-factory-${todayIso()}`;
  await audit({ user, action: 'export', module: 'settings', reference: xlsx ? 'excel' : 'json' });
  if (xlsx)
    return new NextResponse(new Uint8Array(await exportExcel()), {
      headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': fileName(name, 'xlsx'), 'cache-control': 'no-store' },
    });
  return new NextResponse(JSON.stringify(await exportAll(), null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': fileName(name, 'json'), 'cache-control': 'no-store' },
  });
});
