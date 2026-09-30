# GATES — ALU FACTORY v1 (solo ledger)

Source of truth: `../ALU_FACTORY_MASTER_PROMPT_v1.1.md`. Runner: `node scripts/gates.mjs` (the unlazy
skill's bundled `gate-check.mjs` is not present on this machine, so this repo ships its own portable
runner that executes each CHECK, requires exit 0 AND the EXPECT regex, and prints MET/UNMET per gate).

Prerequisite for G3–G6: a fresh test database + production server are started by
`tests/run-acceptance.mjs` itself (isolated DB dir `.local-pg-test`, port 54330, app port 3100).

- [ ] G1 TypeScript compiles with zero errors
  CHECK: npx tsc --noEmit && node -e "console.log('TSC_CLEAN')"
  EXPECT: TSC_CLEAN
- [ ] G2 Production build succeeds
  CHECK: npx next build && node -e "console.log('BUILD_OK')"
  EXPECT: BUILD_OK
- [ ] G3 Part 19 acceptance tests 1–20 all pass against a fresh DB via the real HTTP API
  CHECK: node tests/run-acceptance.mjs
  EXPECT: ACCEPTANCE 20/20 PASS
- [ ] G4 Integrity negatives: client totals ignored, negative stock blocked, numbers never reused, 403 matrix
  CHECK: node tests/run-acceptance.mjs --suite integrity
  EXPECT: INTEGRITY ALL PASS
- [ ] G5 Every page renders (EN + KU, light + dark, 390px + 1440px) with no console errors and no horizontal overflow
  CHECK: node tests/run-acceptance.mjs --suite ui
  EXPECT: UI ALL PASS
- [ ] G6 Documents: invoice A5, statement A4, report A4 landscape PDFs generated in EN and KU with page X of Y
  CHECK: node tests/run-acceptance.mjs --suite docs
  EXPECT: DOCS ALL PASS
- [ ] G7 Money/weight columns are Decimal, never Float, and no SQLite migration folder exists
  CHECK: node scripts/check-schema.mjs
  EXPECT: SCHEMA_OK
- [ ] G8 No hard-coded company name in document templates; no `html.dark .text-[#` overrides; no arbitrary hex classes in components
  CHECK: node scripts/check-hygiene.mjs
  EXPECT: HYGIENE_OK
- [ ] G9 Every i18n key used in code exists in both en and ku dictionaries
  CHECK: node scripts/check-i18n.mjs
  EXPECT: I18N_OK
- [ ] G10 Manual: visual review of screenshots (dashboard, POS, customer page, vault, invoice) in light/dark/KU
  EVIDENCE:
