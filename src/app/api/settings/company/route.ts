import { route, body } from '@/lib/server/api';
import { getCompany } from '@/lib/server/common';
import { updateCompany, type CompanyInput } from '@/lib/server/catalog';

// Owner only: these details are printed on every document and shown on the public website.
export const GET = route({ owner: true }, async () => {
  const c = await getCompany();
  return { name: c.name, logo: c.logo, address: c.address, phones: c.phones, footerNote: c.footerNote };
});

export const PUT = route({ owner: true }, async ({ req, user }) => {
  const c = await updateCompany(await body<CompanyInput>(req), user);
  return { name: c.name, logo: c.logo, address: c.address, phones: c.phones, footerNote: c.footerNote };
});
