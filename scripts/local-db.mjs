// Local development Postgres (real PostgreSQL 17 binaries shipped by embedded-postgres).
// The server is started with pg_ctl, so it keeps running in the background after this script exits.
//   node scripts/local-db.mjs          start (initialising the data directory on first run)
//   node scripts/local-db.mjs stop     stop
// Env: LOCAL_PG_DIR (default .local-pg), LOCAL_PG_PORT (default 54329), LOCAL_PG_DB (default alu_factory)
// Production uses Neon: set DATABASE_URL in .env and never run this script there.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = resolve(process.env.LOCAL_PG_DIR || '.local-pg');
const port = Number(process.env.LOCAL_PG_PORT || 54329);
const dbName = process.env.LOCAL_PG_DB || 'alu_factory';
const cmd = process.argv[2] || 'start';

function binDir() {
  const pkg = {
    win32: '@embedded-postgres/windows-x64',
    darwin: process.arch === 'arm64' ? '@embedded-postgres/darwin-arm64' : '@embedded-postgres/darwin-x64',
    linux: process.arch === 'arm64' ? '@embedded-postgres/linux-arm64' : '@embedded-postgres/linux-x64',
  }[process.platform];
  return join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', ...pkg.split('/'), 'native', 'bin');
}
const pgCtl = join(binDir(), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');

const run = (args) => spawnSync(pgCtl, args, { encoding: 'utf8', windowsHide: true });
const isRunning = () => existsSync(join(dir, 'PG_VERSION')) && run(['status', '-D', dir]).status === 0;

if (cmd === 'stop') {
  if (isRunning()) run(['stop', '-D', dir, '-m', 'fast', '-w']);
  console.log('LOCAL_PG_STOPPED');
  process.exit(0);
}

const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'alu', password: 'alu', port, persistent: true, onLog: () => {} });
const fresh = !existsSync(join(dir, 'PG_VERSION'));
if (fresh) await pg.initialise();

if (!isRunning()) {
  // stdio must be ignored: the detached server would otherwise inherit our pipes and keep this script waiting.
  const r = spawnSync(pgCtl, ['start', '-D', dir, '-l', join(dir, 'server.log'), '-o', `-p ${port}`, '-w', '-t', '60'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (r.status !== 0 && !isRunning()) {
    console.error(`pg_ctl start failed — see ${join(dir, 'server.log')}`);
    process.exit(1);
  }
}

{
  const { default: pgLib } = await import('pg');
  const client = new pgLib.Client({ host: 'localhost', port, user: 'alu', password: 'alu', database: 'postgres' });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await client.end();
}
console.log(`LOCAL_PG_READY postgresql://alu:alu@localhost:${port}/${dbName}`);
process.exit(0);
