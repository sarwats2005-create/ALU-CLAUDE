import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { prisma } from '@/lib/db';
import { AppError, notFound } from '@/lib/server/errors';
import { canAnyPage } from '@/lib/permissions';
import { viewPages, type Kind } from '@/lib/kinds';
import { txnDocument } from '@/lib/server/docs/txn-doc';
import { fileName, htmlToPdf } from '@/lib/server/docs/pdf';

/** Invoice / receipt / voucher as HTML (preview + print) or PDF — the same document either way. */
export const GET = route<{ id: string }>({ fail: 'err.pdf' }, async ({ user, lang, params, url }) => {
  const t = await prisma.txn.findUnique({ where: { id: params.id }, select: { kind: true } });
  if (!t) throw notFound();
  if (!canAnyPage(user, viewPages(t.kind as Kind))) throw new AppError(403, 'err.forbidden');
  const doc = await txnDocument(params.id, lang);
  if (url.searchParams.get('format') === 'pdf') {
    const pdf = await htmlToPdf(doc.html);
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': fileName(doc.number, 'pdf'), 'cache-control': 'no-store' } });
  }
  return new NextResponse(doc.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});
