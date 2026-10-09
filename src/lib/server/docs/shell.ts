import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { t, type Lang } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/dates';
import { INVOICE_DICT } from './invoice/i18n';
import { SPRITE, iconRef, scatterIcons } from './invoice/icons';

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
/** Fonts embedded as data URLs so the document renders identically offline, in print frames and in headless Chrome.
 *  Cairo for Latin text and figures (the invoice design's font), Vazirmatn for Kurdish (Cairo has no Kurdish letters). */
async function fontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache;
  const dir = join(process.cwd(), 'public', 'fonts');
  const faces: [string, string, string][] = [
    ['Cairo', 'cairo-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['Cairo', 'cairo-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
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

const imgCache: Record<string, string> = {};
async function publicImage(...p: string[]): Promise<string> {
  const key = p.join('/');
  if (imgCache[key] === undefined) {
    try {
      imgCache[key] = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public', ...p))).toString('base64')}`;
    } catch {
      imgCache[key] = '';
    }
  }
  return imgCache[key];
}

export type Company = { name: string; logo: string | null; address: string; phones: string; footerNote: string };
export type PageSize = 'A5' | 'A4' | 'A4L';


/** Printable area per size (page − margins − 2 mm safety). Height keeps signatures + footer at the page bottom. */
const PRINT_H: Record<PageSize, number> = { A5: 183, A4: 265, A4L: 181 };
const PRINT_W: Record<PageSize, number> = { A5: 128, A4: 184, A4L: 271 };
/** Purchase documents keep their own accent (emerald) so the two books never look alike. */
const ACCENTS = { blue: '#3b82f6', teal: '#10b981' } as const;
export type Accent = keyof typeof ACCENTS;

const PAGE_CSS: Record<PageSize, string> = {
  A5: '@page{size:A5 portrait;margin:10mm 10mm 13mm}',
  A4: '@page{size:A4 portrait;margin:14mm 13mm 16mm}',
  A4L: '@page{size:A4 landscape;margin:12mm 13mm 15mm}',
};

/*
 * Shrink-to-one-page. Called with the printable width/height in CSS px (the caller sizes the viewport to that
 * width first): zooms the document out until it fits one page, but never below 50% (smaller is too hard to read) — a
 * report that would need more than that prints normally across several pages instead. Table cells stop wrapping
 * while shrunk, so each row stays one line. Used by the PDF export and by in-app printing.
 */
const FIT_MIN = 0.5;
const FIT_SCRIPT = `window.__fitPage=function(W,H){var d=document.documentElement,b=document.body;
function m(){var r=b.getBoundingClientRect();return {h:r.height,w:Math.max(r.width,d.scrollWidth)};}
function ok(r){return r.h<=H+1&&r.w<=W+1;}
d.classList.add('fit');b.style.zoom='1';var s=1;
for(var i=0;i<10;i++){var r=m();if(ok(r))return s;var n=Math.min(s-0.02,s*Math.min(H/r.h,W/r.w)*0.99);if(n<${FIT_MIN}){if(s<=${FIT_MIN})break;n=${FIT_MIN};}s=n;b.style.zoom=String(s);}
if(ok(m()))return s;b.style.zoom='';d.classList.remove('fit');return 1;};`;

/** Full standalone HTML document in the invoice design: colour strip, brand header, big title, meta cards, footer. */
export async function docHtml(o: {
  lang: Lang;
  title: string;
  size: PageSize;
  company: Company;
  heading: string;
  meta: { label: string; value: string }[];
  body: string;
  deleted?: boolean;
  /** Extra element shown next to the heading (e.g. a PAID / UNPAID badge). */
  badge?: string;
  accent?: Accent;
  /** Placed at the bottom of the last page, above the footer (signatures). */
  tail?: string;
  /** Reports: shrink to fit on one page when that keeps it readable (see FIT_SCRIPT). */
  fit?: boolean;
  /** Watermark + corner icons (single-page documents only; off for long reports and statements). */
  decor?: boolean;
}): Promise<string> {
  const rtl = o.lang === 'ku';
  const small = o.size === 'A5';
  const decor = o.decor ?? !o.fit;
  const [fonts, defLogo, wm] = await Promise.all([fontCss(), publicImage('invoice', 'logo.png'), decor ? publicImage('invoice', 'watermark.png') : Promise.resolve('')]);
  const logo = o.company.logo || defLogo;
  const c = o.company;
  const pageLabel = t('doc.pageXofY', o.lang, { x: '__X__', y: '__Y__' });
  const [pre, mid, post] = (() => {
    const a = pageLabel.split('__X__');
    const b = (a[1] ?? '').split('__Y__');
    return [a[0] ?? '', b[0] ?? '', b[1] ?? ''];
  })();
  const A = ACCENTS[o.accent ?? 'blue'];
  const font = rtl ? "'Vazirmatn','Cairo'" : "'Cairo','Vazirmatn'";
  const icons = decor ? scatterIcons(o.title) : null;
  const phones = c.phones
    .split(/[,;\n|/]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' · ');
  const cards = ['#3b82f6', '#10b981', '#f59e0b', '#111827'];
  return `<!doctype html>
<html lang="${rtl ? 'ckb' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"${o.fit ? ` data-fit="${o.size}" data-fit-w="${PRINT_W[o.size]}" data-fit-h="${PRINT_H[o.size]}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<style>
${fonts}
${PAGE_CSS[o.size]}
@page{@bottom-center{content:"${esc(pre)}" counter(page) "${esc(mid)}" counter(pages) "${esc(post)}";font:600 8pt ${font},sans-serif;color:#5b6472}}
*{box-sizing:border-box}
:root{--a:${A};--ink:#111827;--navy:#111827;--muted:#5b6472;--tile:#f3f4f6;--grid:#cbd0d8;--line:#e5e7eb}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:var(--ink);font:${small ? '9pt' : '9.5pt'}/1.45 ${font},system-ui,sans-serif;background:#fff}
.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;white-space:nowrap}
.bidi{unicode-bidi:plaintext}
.page{position:relative}
.strip{display:flex;height:${small ? '5px' : '7px'};margin-bottom:${small ? '12px' : '16px'};border-radius:2px;overflow:hidden}.strip i{flex:1}
.strip i:nth-child(1){background:#3b82f6}.strip i:nth-child(2){background:#10b981}.strip i:nth-child(3){background:#f59e0b}.strip i:nth-child(4){background:#111827}
.wm{position:fixed;left:50%;top:50%;width:${small ? '300px' : '440px'};height:${small ? '300px' : '440px'};transform:translate(-50%,-50%);opacity:.07;pointer-events:none;z-index:0}
.icons{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.cn{position:absolute;width:180px;height:180px;transform:scale(${small ? '.55' : '.75'})}
.cn--tl{left:-6px;top:0;transform-origin:0 0}.cn--tr{right:-6px;top:0;transform-origin:100% 0}.cn--bl,.cn--br{display:none}
.inv__ico{position:absolute;fill:none;stroke:#6b7280;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.inv__sprite{position:absolute;width:0;height:0}
.ci{width:13px;height:13px;flex:none;fill:none;stroke:#3b82f6;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.head,.titlerow,.metas,.block,.end,h3{position:relative;z-index:1}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.brand{display:flex;gap:10px;align-items:center;min-width:0}
.brand img{width:${small ? '40px' : '52px'};height:${small ? '40px' : '52px'};object-fit:contain;flex:none}
.brand h1{margin:0;font-size:${small ? '14pt' : '17pt'};font-weight:800;letter-spacing:-.01em;line-height:1.05}
.brand p{margin:3px 0 0;color:#6b7280;font-size:${small ? '7pt' : '8pt'}}
.contact{display:flex;flex-direction:column;gap:3px;font-size:${small ? '7pt' : '8pt'};color:var(--muted)}
.contact div{display:flex;align-items:center;gap:6px}
.titlerow{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:${small ? '14px 0 10px' : '20px 0 12px'}}
.titlerow h2{margin:0;font-size:${small ? '20pt' : '26pt'};font-weight:800;letter-spacing:-.02em;line-height:1.05}
[dir=rtl] .titlerow h2{letter-spacing:0}
.metas{display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(o.meta.length, 4))},1fr);gap:${small ? '6px' : '8px'}}
.metas div{background:var(--tile);border-radius:7px;padding:${small ? '5px 8px' : '7px 11px'};border-top:3.5px solid var(--c)}
.metas small{display:block;font-size:${small ? '7pt' : '7.5pt'};font-weight:600;color:var(--muted)}
.metas b{font-size:${small ? '9pt' : '10pt'};font-weight:700}
.block{margin-top:${small ? '10px' : '14px'}}
.box{background:var(--tile);border-radius:8px;padding:${small ? '8px 10px' : '10px 13px'}}
.box .lbl{font-size:7.5pt;font-weight:600;color:var(--muted);margin:0 0 2px}
.box .val{font-weight:800;font-size:${small ? '10.5pt' : '11.5pt'}}
.row{display:flex;gap:${small ? '8px' : '10px'}}.row>*{flex:1;min-width:0}
table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.7)}
th{font-size:7.5pt;font-weight:700;color:#fff;background:var(--navy);text-align:start;padding:${small ? '5px 6px' : '6px 8px'};border:1px solid var(--navy)}
td{padding:${small ? '5px 6px' : '5px 8px'};border:1px solid var(--grid);vertical-align:top}
thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid}
.e{text-align:end}.c{text-align:center}.b{font-weight:700}.m{color:var(--muted)}.s{font-size:7.5pt}
.pos{color:#047857}.neg{color:#dc2626}
tfoot td{font-weight:800;background:var(--tile)}
.totals{margin-inline-start:auto;width:${small ? '64%' : '46%'};border-collapse:separate;border-spacing:0;background:none}
.totals td{border:0;border-bottom:1px solid var(--line);padding:5px 6px;background:none}
.totals td .s{display:block;line-height:1.35;margin-top:1px;font-weight:400}
.totals tr.grand td{background:var(--navy);color:#fff;border:0;font-weight:800;font-size:${small ? '11pt' : '12pt'};padding:9px 10px}
.totals tr.grand td:first-child{border-start-start-radius:7px;border-end-start-radius:7px;border-inline-start:6px solid #f59e0b}
.totals tr.grand td:last-child{border-start-end-radius:7px;border-end-end-radius:7px}
.totals tr.grand .neg{color:#fecaca}
.chip{display:inline-block;border-radius:4px;background:var(--tile);color:var(--muted);font-weight:700;font-size:7pt;padding:0 5px}
.note{font-size:8pt;background:var(--tile);border-radius:8px;padding:8px 11px;white-space:pre-wrap}
.sign{display:flex;gap:28px;margin-top:${small ? '26px' : '40px'}}
.sign div{flex:1;border-top:1.5px solid var(--navy);padding-top:5px;font-size:7.5pt;font-weight:600;color:var(--muted)}
.foot{margin-top:${small ? '10px' : '14px'};padding-top:7px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;font-size:7.5pt;color:var(--muted)}
.foot b{color:var(--ink)}
.stamp{position:fixed;top:38%;left:0;right:0;text-align:center;font-size:56pt;font-weight:800;color:rgba(220,38,38,.17);transform:rotate(-20deg);pointer-events:none;z-index:2}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.sum .box{border-top:3.5px solid var(--c,#3b82f6)}
.sum .box:nth-child(4n+2){--c:#10b981}.sum .box:nth-child(4n+3){--c:#f59e0b}.sum .box:nth-child(4n+4){--c:#111827}
h3{font-size:10.5pt;font-weight:800;margin:16px 0 0}
.stamp-badge{display:inline-block;border:1.5px solid;border-radius:99px;padding:3px 12px;font-size:${small ? '8pt' : '8.5pt'};font-weight:800}
.st-paid{background:#d1fae5;color:#065f46;border-color:#10b981}.st-partial{background:#fef3c7;color:#92400e;border-color:#f59e0b}.st-unpaid{background:#dbeafe;color:#1e3a8a;border-color:#3b82f6}
.pill{display:inline-block;background:var(--navy);color:#fff;border-radius:99px;padding:${small ? '3px 12px' : '4px 16px'};font-size:${small ? '10pt' : '12pt'};font-weight:700}
.tr{display:flex;align-items:center;gap:8px}
.lines col.cn{width:6%}.lines col.cs{width:13%}.lines col.ck{width:15%}.lines col.cp{width:14%}.lines col.ct{width:17%}
.pname{font-weight:700;line-height:1.3}.pmeta{margin-top:2px;font-size:7pt;color:var(--muted)}
.sumrow{display:flex;gap:${small ? '10px' : '16px'};align-items:flex-start;justify-content:space-between}
.sumrow .facts{flex:1;min-width:0;font-size:${small ? '7.5pt' : '8pt'};color:var(--muted)}
.sumrow .facts div{margin-bottom:2px}.sumrow .facts b{color:var(--ink)}
.sumrow .totals{margin:0;width:${small ? '58%' : '44%'}}
.end{margin-top:auto;padding-top:${small ? '10px' : '14px'}}
/* Print / PDF: the page is one column as tall as the printable area, so the last block sits at the bottom. */
@media print{.page{min-height:${PRINT_H[o.size]}mm;display:flex;flex-direction:column}}
/* Shrunk to one page: no forced height, no paper frame. */
.fit .page{min-height:0!important;margin:0!important;padding:0!important;max-width:none!important;box-shadow:none!important}
.fit body{background:#fff!important}
.fit td,.fit th{white-space:nowrap}
/* Screen preview: a paper sheet on desktop, full-width and stacked on phones. */
@media screen{body{background:#f3f4f6}.page{max-width:${o.size === 'A5' ? '148mm' : o.size === 'A4' ? '210mm' : '297mm'};margin:16px auto;background:#fff;padding:11mm;overflow:hidden}}
@media screen and (max-width:700px){
  body{background:#fff}
  .page{margin:0!important;padding:14px!important;max-width:none!important}
  .head{flex-direction:column}.titlerow{flex-direction:column;align-items:flex-start}.metas{grid-template-columns:1fr 1fr}
  .row,.sumrow,.sign{flex-direction:column}.sumrow .totals,.totals{width:100%!important}
  .tablewrap,section.block:has(>table){overflow-x:auto;-webkit-overflow-scrolling:touch}
}
</style>
${o.fit ? `<script>${FIT_SCRIPT}</script>` : ''}
</head>
<body>
<div class="page">
${SPRITE}
${wm ? `<img class="wm" src="${wm}" alt="">` : ''}
${icons ? `<div class="icons" aria-hidden="true">${(['tl', 'tr'] as const).map((k) => `<div class="cn cn--${k}">${icons[k]}</div>`).join('')}</div>` : ''}
${o.deleted ? `<div class="stamp">${esc(t('doc.deletedStamp', o.lang))}</div>` : ''}
<div class="strip"><i></i><i></i><i></i><i></i></div>
<header class="head">
  <div class="brand">
    ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
    <div>
      <h1 class="bidi">${esc(c.name || 'ALU FACTORY')}</h1>
      <p>${esc(INVOICE_DICT[o.lang].tagline)}</p>
    </div>
  </div>
  <div class="contact">
    ${c.address ? `<div>${iconRef('pin', 'ci')}<span class="bidi">${esc(c.address)}</span></div>` : ''}
    ${phones ? `<div>${iconRef('phone', 'ci')}${num(phones)}</div>` : ''}
    <div>${iconRef('globe', 'ci')}<span>alufactoryerp.com</span></div>
  </div>
</header>
<div class="titlerow"><h2 class="bidi">${esc(o.heading)}</h2>${o.badge ? `<div class="tr">${o.badge}</div>` : ''}</div>
${o.meta.length ? `<section class="metas">${o.meta.map((m, i) => `<div style="--c:${cards[i % cards.length]}"><small>${esc(m.label)}</small><b>${m.value}</b></div>`).join('')}</section>` : ''}
${o.body}
<div class="end">
${o.tail ?? ''}
<footer class="foot">
  <b class="bidi">${esc(c.footerNote || t('doc.thankYou', o.lang))}</b>
  <span>${esc(t('doc.generatedAt', o.lang))} ${num(fmtDateTime(new Date()))}</span>
</footer>
</div>
</div>
</body>
</html>`;
}
