import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { AppError, notFound } from '@/lib/server/errors';
import { canPage } from '@/lib/permissions';
import { statementDocument } from '@/lib/server/docs/other-docs';
import { fileName, htmlToPdf } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';

/** Account statement for a customer or beneficiary, optionally limited to a date range. */
export const GET = route<{ kind: string; id: string }>({ fail: 'err.pdf' }, async ({ user, lang, params, url }) => {
  const kind = params.kind === 'customer' ? 'customer' : params.kind === 'beneficiary' ? 'beneficiary' : null;
  if (!kind) throw notFound();
  if (!canPage(user, kind === 'customer' ? 'customers' : 'beneficiaries')) throw new AppError(403, 'err.forbidden');
  const sp = url.searchParams;
  const doc = await statementDocument(kind, params.id, lang, sp.get('from') ?? undefined, sp.get('to') ?? undefined);
  if (sp.get('format') === 'pdf') {
    const pdf = await htmlToPdf(doc.html);
    await audit({ user, action: 'export', module: kind === 'customer' ? 'customers' : 'beneficiaries', reference: `statement:${doc.name}` });
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': fileName(`statement-${doc.name}`, 'pdf'), 'cache-control': 'no-store' } });
  }
  return new NextResponse(doc.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});
