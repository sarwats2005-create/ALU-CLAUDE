// Production database step, run before every start on Railway (npm run db:deploy):
//   1. prisma migrate deploy  — applies pending migrations (idempotent)
//   2. prisma/seed.ts         — settings row, company profile, default aluminum types (idempotent)
// Neon: migrations need a DIRECT (unpooled) connection. Uses DIRECT_URL when set, otherwise derives it from
// the pooled DATABASE_URL by dropping "-pooler" from the host (Neon's naming). Works locally too (reads .env).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fromDotEnv(key) {
  try {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm').exec(readFileSync(resolve('.env'), 'utf8'));
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

const pooled = process.env.DATABASE_URL || fromDotEnv('DATABASE_URL');
if (!pooled) {
  console.error('DATABASE_URL is not set. On Railway: Variables → add DATABASE_URL (Neon pooled connection string).');
  process.exit(1);
}
const direct = process.env.DIRECT_URL || fromDotEnv('DIRECT_URL') || pooled.replace(/-pooler(?=\.)/, '');

const run = (args, url) => {
  const r = spawnSync('npx', ['--no-install', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log(`[db:deploy] migrating via ${new URL(direct).host}`);
run(['prisma', 'migrate', 'deploy'], direct);
run(['tsx', 'prisma/seed.ts'], pooled);
console.log('[db:deploy] done');
