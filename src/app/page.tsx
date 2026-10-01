import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser, LANG_COOKIE } from '@/lib/server/auth';
import { getCompany } from '@/lib/server/common';
import { firstAllowedHref } from '@/lib/permissions';
import { parseLang } from '@/lib/i18n';
import { Landing, type LandingData } from './_landing/Landing';
import './_landing/landing.css';

export const dynamic = 'force-dynamic';

const DEFAULTS: LandingData = { name: 'ALU FACTORY', logo: null, address: '', phones: [], footerNote: '', types: [] };

/** Public details for visitors. Contact info comes from Settings → Company; the page still renders if the database is down. */
async function loadData(): Promise<LandingData> {
  try {
    const [company, types] = await Promise.all([
      getCompany(),
      prisma.aluminumType.findMany({ where: { isDemo: false }, orderBy: { name: 'asc' }, select: { name: true }, take: 24 }),
    ]);
    return {
      name: company.name.trim() || DEFAULTS.name,
      logo: company.logo,
      address: company.address.trim(),
      phones: company.phones
        .split(/[,;\n|/]+/)
        .map((p) => p.trim())
        .filter((p) => /\d{6,}/.test(p.replace(/\D/g, ''))),
      footerNote: company.footerNote.trim(),
      types: types.map((t) => t.name),
    };
  } catch {
    return DEFAULTS;
  }
}

export const metadata: Metadata = {
  title: { absolute: 'ALU FACTORY' },
  description: 'Raw aluminum and finished products sold by the kilogram. Pay in US dollars or Iraqi dinars.',
};

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(firstAllowedHref(user));
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  return <Landing lang={lang} data={await loadData()} />;
}
