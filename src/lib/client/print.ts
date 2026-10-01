'use client';
// Printing uses the exact same HTML document as Preview and PDF: it is fetched from the server,
// written into a hidden iframe (standalone print document) and printed from there.

import { track } from './busy';

export function printDocument(url: string): Promise<{ ok: boolean; error?: string }> {
  return track(printDoc(url));
}

async function printDoc(url: string): Promise<{ ok: boolean; error?: string }> {
  let html: string;
  try {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, error: j?.error };
    }
    html = await res.text();
  } catch {
    return { ok: false };
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);
  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  return new Promise((resolve) => {
    frame.onload = async () => {
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        return resolve({ ok: false });
      }
      try {
        await (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
        await Promise.all(
          [...win.document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))),
        );
      } catch {}
      win.focus();
      win.addEventListener('afterprint', cleanup, { once: true });
      win.print();
      window.setTimeout(cleanup, 60000);
      resolve({ ok: true });
    };
    frame.srcdoc = html;
  });
}

/** Trigger a file download from a same-origin URL (PDF / CSV / Excel / JSON). */
export function downloadFile(url: string, fallbackName: string): Promise<{ ok: boolean; error?: string }> {
  return track(download(url, fallbackName));
}

async function download(url: string, fallbackName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, error: j?.error };
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 5000);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
