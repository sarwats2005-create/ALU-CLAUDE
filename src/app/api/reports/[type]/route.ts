import { NextResponse } from 'next/server';
import { route } from '@/lib/server/api';
import { notFound } from '@/lib/server/errors';
import { isReportType } from '@/lib/reports-meta';
import { runReport } from '@/lib/server/q/reports';
import { reportCsv, reportDocument } from '@/lib/server/docs/other-docs';
import { fileName, htmlToPdf } from '@/lib/server/docs/pdf';
import { audit } from '@/lib/server/audit';

/** Report data as JSON (screen), CSV, printable HTML or PDF — all from the same ReportData. */
export const GET = route<{ type: string }>({ pages: ['reports'], fail: 'err.generic' }, async ({ user, lang, params, url }) => {
  if (!isReportType(params.type)) throw notFound();
  const sp = url.searchParams;
  const get = (k: string) => sp.get(k) || undefined;
  const data = await runReport(params.type, {
    from: get('from'),
    to: get('to'),
    customerId: get('customerId'),
    beneficiaryId: get('beneficiaryId'),
    productId: get('productId'),
    typeId: get('typeId'),
    currency: get('currency'),
  });
  const format = sp.get('format') ?? 'json';
  const base = `${params.type}-${data.from}-${data.to}`;
  if (format === 'csv') {
    await audit({ user, action: 'export', module: 'reports', reference: `${params.type}.csv` });
    return new NextResponse(reportCsv(data, lang), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': fileName(base, 'csv'), 'cache-control': 'no-store' } });
  }
  if (format === 'html' || format === 'pdf') {
    const doc = await reportDocument(data, lang);
    if (format === 'html') return new NextResponse(doc.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    const pdf = await htmlToPdf(doc.html);
    await audit({ user, action: 'export', module: 'reports', reference: `${params.type}.pdf` });
    return new NextResponse(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': fileName(base, 'pdf'), 'cache-control': 'no-store' } });
  }
  return data;
});
