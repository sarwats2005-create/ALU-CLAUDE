import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { getSessionUser, LANG_COOKIE } from '@/lib/server/auth';
import { dirOf, parseLang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: { default: 'ALU FACTORY', template: '%s · ALU FACTORY' },
  description: 'Aluminum factory operations: purchases, inventory, sales, vaults and reports.',
  applicationName: 'ALU FACTORY',
  appleWebApp: { title: 'ALU FACTORY', capable: true, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1726' },
  ],
};

// Applies the saved theme before first paint ("system" follows the OS setting).
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )alu_theme=([^;]+)/);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await getSessionUser();
  const lang = user?.lang ?? parseLang(jar.get(LANG_COOKIE)?.value);
  const theme = jar.get('alu_theme')?.value;
  return (
    <html lang={lang === 'ku' ? 'ckb' : 'en'} dir={dirOf(lang)} className={theme === 'dark' ? 'dark' : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        {lang === 'ku' ? <link rel="preload" href="/fonts/vazirmatn-arabic.woff2" as="font" type="font/woff2" crossOrigin="" /> : null}
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link rel="apple-touch-icon" href="/app-icon.png" />
      </head>
      <body className="min-h-dvh bg-bg text-ink">{children}</body>
    </html>
  );
}
