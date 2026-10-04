// One-time project restructure: splits the code into frontend / backend / shared / database folders.
//
//   node scripts/restructure.mjs           → moves the files and fixes every import
//   node scripts/restructure.mjs --dry     → only prints what would move
//
// Safe to run once: it stops if the new layout already exists. Nothing is deleted — files are only moved
// (renamed), so the change is easy to review with `git status` and to undo with git.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const P = (...a) => join(ROOT, ...a);
const posix = (p) => p.split(sep).join('/');
const rel = (abs) => posix(relative(ROOT, abs));

if (existsSync(P('src/backend')) || existsSync(P('database'))) {
  console.log('Already restructured (src/backend or database exists). Nothing to do.');
  process.exit(0);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ─── 1. Where every file goes ──────────────────────────────────────────────────────────────────────
// Next.js keeps routing in src/app; only its special files stay there (page, layout, loading, route, icon…).
const SPECIAL = /^(page|layout|loading|route|error|not-found|template|default)\.(tsx|ts)$|^icon\.(png|ico|svg)$|^favicon\.ico$/;

function target(r) {
  const m = (from, to) => (r === from || r.startsWith(from + '/') ? to + r.slice(from.length) : null);
  return (
    m('src/lib/server/q', 'src/backend/queries') ??
    m('src/lib/server', 'src/backend') ??
    m('src/lib/db.ts', 'src/backend/db.ts') ??
    m('src/lib/client', 'src/frontend/lib') ??
    m('src/lib/i18n', 'src/shared/i18n') ??
    (r.startsWith('src/lib/') ? 'src/shared/' + r.slice('src/lib/'.length) : null) ??
    m('src/components', 'src/frontend/components') ??
    m('src/app/_landing', 'src/frontend/views/landing') ??
    m('src/app/globals.css', 'src/frontend/styles/globals.css') ??
    (r.startsWith('src/app/(app)/') && !SPECIAL.test(r.split('/').pop()) ? 'src/frontend/views/' + r.slice('src/app/(app)/'.length) : null) ??
    (r.startsWith('src/app/login/') && !SPECIAL.test(r.split('/').pop()) ? 'src/frontend/views/login/' + r.slice('src/app/login/'.length) : null) ??
    m('prisma', 'database') ??
    r
  );
}

const files = [...walk(P('src')), ...walk(P('prisma')), ...walk(P('tests')), ...walk(P('scripts'))].map(rel);
const moves = new Map(files.map((f) => [f, target(f)]));
const moved = [...moves].filter(([a, b]) => a !== b);
console.log(`${moved.length} files move.`);
if (DRY) {
  for (const [a, b] of moved) console.log(`  ${a}  →  ${b}`);
  process.exit(0);
}

// ─── 2. Rewrite imports (resolved against the OLD layout, written for the NEW one) ──────────────────
const oldSet = new Set(files);
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '.css', '.json', '/index.ts', '/index.tsx'];
function resolveOld(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('.')) base = posix(join(dirname(fromFile), spec));
  else return null;
  for (const e of EXTS) if (oldSet.has(base + e)) return { file: base + e, ext: e };
  return null;
}
function newSpec(fromNew, spec, hit) {
  const toNew = moves.get(hit.file);
  // Keep the original style: "@/…" stays an alias, "./…" stays relative. Keep an extension only if one was written.
  const strip = (p) => (hit.ext === '' ? p : p.slice(0, -hit.ext.length));
  if (spec.startsWith('@/') && toNew.startsWith('src/')) return strip('@/' + toNew.slice(4));
  let r = posix(relative(dirname(fromNew), toNew));
  if (!r.startsWith('.')) r = './' + r;
  // A relative path that changed and now climbs out of its folder reads better as an alias ("@/frontend/views/pos/PosView").
  if (strip(r) !== spec && r.startsWith('../') && toNew.startsWith('src/') && fromNew.startsWith('src/')) return strip('@/' + toNew.slice(4));
  return strip(r);
}
const RX = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\2/g;
const CODE = /\.(ts|tsx|mjs|js)$/;
let changedImports = 0;
const contents = new Map();
for (const f of files) {
  if (!CODE.test(f) || f === 'scripts/restructure.mjs') continue;
  const src = readFileSync(P(f), 'utf8');
  const out = src.replace(RX, (all, pre, q, spec) => {
    const hit = resolveOld(f, spec);
    if (!hit) return all;
    const ns = newSpec(moves.get(f), spec, hit);
    if (ns === spec) return all;
    changedImports++;
    return `${pre}${q}${ns}${q}`;
  });
  if (out !== src) contents.set(f, out);
}

// ─── 3. Move files, write rewritten content ────────────────────────────────────────────────────────
for (const [a, b] of moved) {
  mkdirSync(dirname(P(b)), { recursive: true });
  renameSync(P(a), P(b));
}
for (const [f, text] of contents) writeFileSync(P(moves.get(f)), text);
// Remove folders left empty.
function prune(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const n of readdirSync(dir)) prune(join(dir, n));
  if (!readdirSync(dir).length) rmdirSync(dir);
}
['src/lib', 'src/components', 'src/app', 'prisma'].forEach((d) => prune(P(d)));

// ─── 4. Config files that name paths ───────────────────────────────────────────────────────────────
const edit = (file, fn) => {
  if (!existsSync(P(file))) return;
  const s = readFileSync(P(file), 'utf8');
  const t = fn(s);
  if (t !== s) writeFileSync(P(file), t);
};
const pathsIn = (s) => {
  for (const [a, b] of moved) s = s.split(`'${a}'`).join(`'${b}'`).split(`"${a}"`).join(`"${b}"`).split(` ${a} `).join(` ${b} `);
  return s;
};
edit('package.json', (s) => {
  const j = JSON.parse(s);
  for (const k of Object.keys(j.scripts)) j.scripts[k] = j.scripts[k].replace(/\bprisma\/(seed|demo)\.ts/g, 'database/$1.ts');
  j.prisma = { ...(j.prisma ?? {}), schema: 'database/schema.prisma', seed: 'tsx database/seed.ts' };
  j.scripts['structure:check'] = 'node scripts/structure-check.mjs';
  if (!j.scripts.build.includes('structure-check')) j.scripts.build = 'node scripts/structure-check.mjs && ' + j.scripts.build;
  return JSON.stringify(j, null, 2) + '\n';
});
edit('tsconfig.json', (s) => s.replace('"prisma/**/*.ts"', '"database/**/*.ts"'));
edit('scripts/migrate.mjs', (s) => s.replace(/prisma\/seed\.ts/g, 'database/seed.ts'));
edit('scripts/rules.mjs', pathsIn);
edit('scripts/rules.mjs', (s) => s.replace("const ABOUT = 'src/lib/about.ts';", "const ABOUT = 'src/shared/about.ts';"));
edit('CLAUDE.md', (s) => s.replace(/src\/lib\/rules\.ts/g, 'src/shared/rules.ts').replace(/src\/lib\/about\.ts/g, 'src/shared/about.ts'));
edit('src/shared/rules.ts', (s) => s.replace(/src\/lib\/about\.ts/g, 'src/shared/about.ts'));
edit('src/shared/about.ts', (s) => s.replace(/src\/lib\/rules\.ts/g, 'src/shared/rules.ts'));

// The rule fingerprints: same rules, new paths and rewritten imports → record them again.
spawnSync(process.execPath, [P('scripts/rules.mjs'), 'sync', '--no-rule-change'], { stdio: 'inherit', cwd: ROOT });

console.log(`Done: ${moved.length} files moved, ${changedImports} imports updated.`);
console.log('Next: npm run typecheck && npm run build');
