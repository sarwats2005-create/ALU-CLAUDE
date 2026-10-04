import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { snapshotFile } from '@/lib/server/backup';
import { fileName } from '@/lib/server/docs/pdf';

/** Download a restore point as a normal JSON backup file. */
export const GET = route<{ id: string }>({ owner: true }, async ({ params }) => {
  const f = await snapshotFile(params.id);
  return new NextResponse(JSON.stringify(f), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': fileName(`alu-factory-backup-${f.exportedAt.slice(0, 10)}`, 'json'), 'cache-control': 'no-store' },
  });
});
