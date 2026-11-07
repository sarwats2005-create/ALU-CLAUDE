import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import '@/app/globals.css';
import { getSessionUser, LANG_COOKIE } from '@/lib/server/auth';
import { dirOf, parseLang } from '@/lib/i18n';
import { GlobalLoader } from '@/components/Loader';
import { ThemeProvider } from '@/components/ThemeProvider';
import { THEME_INIT_SCRIPT } from '@/lib/client/theme';

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
    { media: '(prefers-color-scheme: light)', color: '#1b5db1' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1018' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await getSessionUser();
  const lang = user?.lang ?? parseLang(jar.get(LANG_COOKIE)?.value);
  return (
    <html lang={lang === 'ku' ? 'ckb' : 'en'} dir={dirOf(lang)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        {lang === 'ku' ? <link rel="preload" href="/fonts/vazirmatn-arabic.woff2" as="font" type="font/woff2" crossOrigin="" /> : null}
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link rel="apple-touch-icon" href="/app-icon.png" />
      </head>
      <body className="min-h-dvh bg-bg text-ink">
        <ThemeProvider>
          {children}
          <GlobalLoader />
        </ThemeProvider>
      </body>
    </html>
  );
}
