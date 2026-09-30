import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { t, type Lang } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/dates';

// One HTML document per business record, used for preview, print and PDF alike — so all three match.

export const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Numbers/amounts stay LTR and tabular inside RTL documents. */
export const num = (v: unknown) => `<span class="n">${esc(v)}</span>`;

let fontCssCache: string | null = null;
/** Fonts embedded as data URLs so the document renders identically offline, in print frames and in headless Chrome. */
async function fontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache;
  const dir = join(process.cwd(), 'public', 'fonts');
  const faces: [string, string, string][] = [
    ['Inter', 'inter-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['Inter', 'inter-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+A720-A7FF'],
    ['Vazirmatn', 'vazirmatn-arabic.woff2', 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'],
    ['Vazirmatn', 'vazirmatn-latin.woff2', 'U+0000-00FF,U+2000-206F,U+2212'],
  ];
  const parts = await Promise.all(
    faces.map(async ([fam, file, range]) => {
      try {
        const b64 = (await readFile(join(dir, file))).toString('base64');
        return `@font-face{font-family:'${fam}';font-weight:100 900;font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range};}`;
      } catch {
        return '';
      }
    }),
  );
  fontCssCache = parts.join('\n');
  return fontCssCache;
}

let logoCache: string | null = null;
async function defaultLogo(): Promise<string> {
  if (logoCache) return logoCache;
  try {
    logoCache = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public', 'app-icon.png'))).toString('base64')}`;
  } catch {
    logoCache = '';
  }
  return logoCache;
}

export type Company = { name: string; logo: string | null; address: string; phones: string; footerNote: string };
export type PageSize = 'A5' | 'A4' | 'A4L';

const PAGE_CSS: Record<PageSize, string> = {
  A5: '@page{size:A5 portrait;margin:11mm 10mm 14mm}',
  A4: '@page{size:A4 portrait;margin:14mm 13mm 16mm}',
  A4L: '@page{size:A4 landscape;margin:12mm 13mm 15mm}',
};

/** Full standalone HTML document with company header, footer note and page X of Y. */
export async function docHtml(o: {
  lang: Lang;
  title: string;
  size: PageSize;
  company: Company;
  heading: string;
  meta: { label: string; value: string }[];
  body: string;
  deleted?: boolean;
}): Promise<string> {
  const rtl = o.lang === 'ku';
  const [fonts, logo] = await Promise.all([fontCss(), o.company.logo ? Promise.resolve(o.company.logo) : defaultLogo()]);
  const c = o.company;
  const pageLabel = t('doc.pageXofY', o.lang, { x: '__X__', y: '__Y__' });
  const [pre, mid, post] = (() => {
    const a = pageLabel.split('__X__');
    const b = (a[1] ?? '').split('__Y__');
    return [a[0] ?? '', b[0] ?? '', b[1] ?? ''];
  })();
  const small = o.size === 'A5';
  return `<!doctype html>
<html lang="${rtl ? 'ckb' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<style>
${fonts}
${PAGE_CSS[o.size]}
@page{@bottom-center{content:"${esc(pre)}" counter(page) "${esc(mid)}" counter(pages) "${esc(post)}";font:500 8pt ${rtl ? "'Vazirmatn','Inter'" : "'Inter','Vazirmatn'"},sans-serif;color:#6b7280}}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:#1a1f36;font:${small ? '9pt' : '9.5pt'}/1.45 ${rtl ? "'Vazirmatn','Inter'" : "'Inter','Vazirmatn'"},system-ui,sans-serif;background:#fff}
.n{direction:ltr;unicode-bidi:isolate;font-family:'Inter','Vazirmatn',sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
.bidi{unicode-bidi:plaintext}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:${small ? '9px' : '12px'};border-bottom:2.5px solid #1b5db1}
.brand{display:flex;gap:10px;align-items:center;min-width:0}
.brand img{width:${small ? '38px' : '46px'};height:${small ? '38px' : '46px'};border-radius:22%;object-fit:contain}
.brand h1{margin:0;font-size:${small ? '12.5pt' : '15pt'};font-weight:800;letter-spacing:.02em;color:#143f7a}
.brand p{margin:1px 0 0;color:#6b7280;font-size:${small ? '7.5pt' : '8pt'}}
.title{text-align:end}
.title h2{margin:0;font-size:${small ? '12pt' : '14pt'};font-weight:800;color:#1b5db1}
.title dl{margin:4px 0 0;display:grid;grid-template-columns:auto auto;gap:1px 10px;justify-content:end;font-size:${small ? '8pt' : '8.5pt'}}
.title dt{color:#6b7280}.title dd{margin:0;font-weight:600}
.block{margin-top:${small ? '10px' : '14px'}}
.box{border:1px solid #d8e6f7;border-radius:6px;padding:${small ? '7px 9px' : '9px 12px'}}
.box .lbl{font-size:7.5pt;color:#6b7280;text-transform:none;margin:0 0 2px}
.box .val{font-weight:700;font-size:${small ? '10pt' : '10.5pt'}}
.row{display:flex;gap:10px}.row>*{flex:1;min-width:0}
table{width:100%;border-collapse:collapse}
th{font-size:7.5pt;font-weight:700;color:#143f7a;background:#e8f0fb;text-align:start;padding:${small ? '5px 6px' : '6px 8px'};border-bottom:1px solid #d0e1f9}
td{padding:${small ? '5px 6px' : '5.5px 8px'};border-bottom:1px solid #e8eef7;vertical-align:top}
tbody tr:nth-child(even) td{background:#f8fbff}
thead{display:table-header-group}tr{break-inside:avoid}
.e{text-align:end}.c{text-align:center}.b{font-weight:700}.m{color:#6b7280}.s{font-size:7.5pt}
.pos{color:#1a7a3c}.neg{color:#c5221f}
tfoot td{font-weight:800;border-top:1.5px solid #1b5db1;border-bottom:0;background:#f4f8ff}
.totals{margin-${rtl ? 'right' : 'left'}:auto;width:${small ? '62%' : '46%'};border-collapse:collapse}
.totals td{border:0;padding:3px 6px;background:none!important}
.totals tr.grand td{border-top:1.5px solid #1b5db1;font-weight:800;font-size:${small ? '10.5pt' : '11pt'};padding-top:6px}
.chip{display:inline-block;border-radius:4px;background:#e8f0fb;color:#1b5db1;font-weight:700;font-size:7pt;padding:0 4px}
.note{font-size:8pt;color:#1a1f36;background:#f4f8ff;border-radius:6px;padding:6px 9px;white-space:pre-wrap}
.sign{display:flex;gap:28px;margin-top:${small ? '26px' : '36px'}}
.sign div{flex:1;border-top:1px solid #9aa6ba;padding-top:4px;font-size:7.5pt;color:#6b7280;text-align:center}
.foot{margin-top:${small ? '12px' : '16px'};padding-top:6px;border-top:1px solid #e8eef7;display:flex;justify-content:space-between;gap:12px;font-size:7pt;color:#6b7280}
.stamp{position:fixed;top:38%;left:0;right:0;text-align:center;font-size:52pt;font-weight:900;color:rgba(217,48,37,.16);transform:rotate(-18deg);letter-spacing:.08em;pointer-events:none}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.sum .box .val{font-size:11pt}
h3{font-size:10pt;margin:14px 0 6px;color:#143f7a}
@media screen{body{background:#eef2f7}.page{max-width:${o.size === 'A5' ? '148mm' : o.size === 'A4' ? '210mm' : '297mm'};margin:16px auto;background:#fff;padding:12mm;box-shadow:0 2px 14px rgba(16,24,40,.12)}}
</style>
</head>
<body>
<div class="page">
${o.deleted ? `<div class="stamp">${esc(t('doc.deletedStamp', o.lang))}</div>` : ''}
<header class="head">
  <div class="brand">
    ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
    <div>
      <h1 class="bidi">${esc(c.name || 'ALU FACTORY')}</h1>
      ${c.address ? `<p class="bidi">${esc(c.address)}</p>` : ''}
      ${c.phones ? `<p>${num(c.phones)}</p>` : ''}
    </div>
  </div>
  <div class="title">
    <h2>${esc(o.heading)}</h2>
    <dl>${o.meta.map((m) => `<dt>${esc(m.label)}</dt><dd>${m.value}</dd>`).join('')}</dl>
  </div>
</header>
${o.body}
<footer class="foot">
  <span class="bidi">${esc(c.footerNote || t('doc.thankYou', o.lang))}</span>
  <span>${esc(t('doc.generatedAt', o.lang))} ${num(fmtDateTime(new Date()))}</span>
</footer>
</div>
</body>
</html>`;
}
