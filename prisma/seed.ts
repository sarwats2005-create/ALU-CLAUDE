// Base data every installation needs: settings, company profile and the default aluminum types.
// Idempotent — safe to run on every deploy. Demo data is separate (npm run db:demo) and always flagged.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await prisma.companyProfile.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'ALU FACTORY' } });
  for (const name of ['6061', '6063', 'Mixed', 'Scrap', 'Extrusion']) {
    const exists = await prisma.aluminumType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (!exists) await prisma.aluminumType.create({ data: { name } });
  }
  console.log('SEED_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
