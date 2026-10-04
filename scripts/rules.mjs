// Keeps the About page ("How the app works") in step with the code that enforces the rules.
//
//   npm run rules:check   → fails when rule code changed since the About page was last reviewed
//   npm run rules:sync    → records the current state (refused when rule code changed but
//                           src/lib/about.ts did not; pass --no-rule-change for a pure refactor)
//
// The fingerprints live in rules.lock.json (commit it). Line endings are normalised, so Windows and
// Linux checkouts give the same result.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'rules.lock.json');
const ABOUT = 'src/lib/about.ts';

/** Files that decide how money, stock, access and safety rules behave. */
const WATCH = [
  'src/lib/rules.ts',
  'src/lib/lock.ts',
  'src/lib/money.ts',
  'src/lib/conversion.ts',
  'src/lib/kinds.ts',
  'src/lib/permissions.ts',
  'src/lib/server/txns.ts',
  'src/lib/server/ledger.ts',
  'src/lib/server/dues.ts',
  'src/lib/server/expenses.ts',
  'src/lib/server/catalog.ts',
  'src/lib/server/erase.ts',
  'src/lib/server/backup.ts',
  'src/lib/server/auth.ts',
  'src/lib/server/q/alerts.ts',
  'prisma/seed.ts',
];

const hash = (rel) => {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return 'missing';
  return createHash('sha256').update(readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
};
const aboutVersion = () => readFileSync(join(ROOT, ABOUT), 'utf8').match(/ABOUT_CHANGELOG[^=]*=\s*\[\s*\{\s*version:\s*'([^']+)'/)?.[1] ?? '?';

const now = Object.fromEntries(WATCH.map((f) => [f, hash(f)]));
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { files: {}, about: '' };
const changed = [...new Set([...WATCH, ...Object.keys(lock.files)])].filter((f) => lock.files[f] !== now[f]);
const aboutChanged = lock.about !== hash(ABOUT);

const [cmd, ...flags] = process.argv.slice(2);

if (cmd === 'sync') {
  if (changed.length && !aboutChanged && !flags.includes('--no-rule-change')) {
    console.error(`✗ Rule code changed but ${ABOUT} was not updated:\n  ${changed.join('\n  ')}\n` +
      `Update the rule text and add an ABOUT_CHANGELOG entry, or run with --no-rule-change if no rule changed.`);
    process.exit(1);
  }
  writeFileSync(LOCK, JSON.stringify({ version: aboutVersion(), about: hash(ABOUT), files: now }, null, 2) + '\n');
  console.log(`✓ rules.lock.json updated (About v${aboutVersion()}, ${WATCH.length} rule files).`);
} else {
  const warn = flags.includes('--warn');
  if (changed.length) {
    const msg = `${warn ? '⚠' : '✗'} The About page may be out of date — rule code changed since the last review:\n  ${changed.join('\n  ')}\n` +
      `Update ${ABOUT} (rule text + ABOUT_CHANGELOG), then run: npm run rules:sync`;
    if (warn) console.warn(msg);
    else {
      console.error(msg);
      process.exit(1);
    }
  } else console.log(`✓ About page is in step with the rules (v${lock.version}).`);
}
