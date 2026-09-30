import { route, body } from '@/lib/server/api';
import { getCompany } from '@/lib/server/common';
import { updateCompany, type CompanyInput } from '@/lib/server/catalog';

export const GET = route({ pages: ['settings'] }, async () => {
  const c = await getCompany();
  return { name: c.name, logo: c.logo, address: c.address, phones: c.phones, footerNote: c.footerNote };
});

export const PUT = route({ pages: ['settings'] }, async ({ req, user }) => {
  const c = await updateCompany(await body<CompanyInput>(req), user);
  return { name: c.name, logo: c.logo, address: c.address, phones: c.phones, footerNote: c.footerNote };
});
