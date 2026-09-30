import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { AppError } from '../errors';

/** Chrome / Edge installed on this machine (CHROME_PATH wins). No browser download is ever needed. */
function findChrome(): string | null {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const pf = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] ?? '';
  const candidates =
    process.platform === 'win32'
      ? [
          join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  return candidates.find((p) => p && existsSync(p)) || null;
}

const g = globalThis as unknown as { __aluBrowser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  if (g.__aluBrowser) {
    const b = await g.__aluBrowser.catch(() => null);
    if (b?.connected) return b;
  }
  const exe = findChrome();
  if (!exe) throw new AppError(503, 'err.pdf');
  const { default: puppeteer } = await import('puppeteer-core');
  g.__aluBrowser = puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  return g.__aluBrowser;
}

/** Render one of our standalone HTML documents to PDF (page size + page X of Y come from the document's CSS). */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await browser();
  const page = await b.newPage();
  try {
    // Documents are fully self-contained (fonts and logo embedded) — block any network access.
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 60000 });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function fileName(base: string, ext: string) {
  const safe = base.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';
  return `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}.${ext}"; filename*=UTF-8''${encodeURIComponent(safe)}.${ext}`;
}
