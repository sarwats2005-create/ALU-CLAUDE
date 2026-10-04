// Base data every installation needs: the settings row and the company profile. No aluminum types are
// pre-added: the factory creates its own (Settings, or "Add type" on the purchase form).
// Idempotent — safe to run on every deploy. Demo data is separate (npm run db:demo) and always flagged.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  await prisma.companyProfile.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'ALU FACTORY' } });
  console.log('SEED_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
