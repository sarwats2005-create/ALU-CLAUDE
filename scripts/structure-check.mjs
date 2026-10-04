// Keeps the folders honest. Run: npm run structure:check (the build runs it too and fails on a violation).
//
//   src/frontend → may import shared; may import backend TYPES only (import type …), never backend code.
//   src/shared   → imports nothing from frontend or backend (it runs on both sides).
//   src/backend  → never imports frontend.
//   database     → may use backend + shared (seed / demo data), never frontend.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const posix = (p) => p.split(sep).join('/');
const walk = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};
const area = (rel) =>
  rel.startsWith('src/frontend/') ? 'frontend' : rel.startsWith('src/backend/') ? 'backend' : rel.startsWith('src/shared/') ? 'shared' : rel.startsWith('database/') ? 'database' : rel.startsWith('src/app/') ? 'app' : 'other';
const FORBIDDEN = { frontend: ['backend'], shared: ['frontend', 'backend'], backend: ['frontend'], database: ['frontend'], app: [], other: [] };

const RX = /(import|export)\s+(type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;
const problems = [];
for (const abs of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'database'))]) {
  const rel = posix(relative(ROOT, abs));
  const from = area(rel);
  const text = readFileSync(abs, 'utf8');
  for (const m of text.matchAll(RX)) {
    const spec = m[3] ?? m[4];
    const typeOnly = !!m[2] || /^import\s+type\b/.test(m[0]);
    let target;
    if (spec.startsWith('@/')) target = 'src/' + spec.slice(2);
    else if (spec.startsWith('.')) target = posix(relative(ROOT, resolve(dirname(abs), spec)));
    else continue;
    const to = area(target + '/');
    if (!FORBIDDEN[from].includes(to)) continue;
    if (from === 'frontend' && to === 'backend' && typeOnly) continue; // types vanish at build time
    problems.push(`${rel}: ${from} must not import ${to} → '${spec}'`);
  }
}
if (problems.length) {
  console.error(`✗ Folder rules broken:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ Folder structure is clean (frontend / backend / shared / database).');
