# GATES — ALU FACTORY v1 (solo ledger)

Status as of 30/09/2026 (UI build session). Evidence below was produced against a fresh Postgres 17
database with demo data (`npm run db:demo`) and the production build (`next build` + `next start`).

- [x] G1 TypeScript compiles with zero errors
  CHECK: npx tsc --noEmit
  EVIDENCE: clean (no output)
- [x] G2 Production build succeeds
  CHECK: npx next build
  EVIDENCE: exit 0, all 68 routes compiled, no warnings
- [x] G3 Business-rule acceptance flows pass via the real HTTP API
  CHECK: node tests/api-flows.mjs   (server running; OWNER_EMAIL / OWNER_PASSWORD env)
  EVIDENCE: FLOWS ALL PASS — 36 passed, 0 failed (dev server and production server)
  Covers: purchase → balance, processing loss %, over-processing blocked, negative stock blocked,
  server total wins over client total, COGS carries processing loss, IQD payment at rate, refund
  without credit refused, delete reverses stock + keeps tombstone, numbers never reused, edit can
  reuse its own quantity, vault exchange at custom rate, documents + reports render.
- [x] G4 Integrity negatives + 403 matrix
  EVIDENCE: included in tests/api-flows.mjs (9-route 403 matrix for a customers-only user,
  401 when signed out, clerk cannot delete an invoice).
- [x] G5 Every page renders (EN + KU, light + dark, 390px + 1440px) with no console errors and no horizontal overflow
  EVIDENCE: 19 routes × 4 combinations = 76 renders, 0 console errors, 0 horizontal overflow
  (Playwright sweep, Chromium).
- [x] G6 Documents: invoice A5, statement A4, report A4 (landscape where set) as PDF in EN and KU with page X of Y
  EVIDENCE: /api/docs/txn/:id, /api/docs/statement/:kind/:id, /api/reports/:type?format=pdf —
  all 200 with %PDF; visually reviewed invoice EN + KU (RTL), statement, P&L.
- [ ] G7 Schema check script (Decimal-only money/weight) — schema is Decimal throughout; script not written yet
- [ ] G8 Hygiene script — not written yet (no hard-coded company name in templates: documents use the
  Company profile from Settings)
- [ ] G9 i18n key check script — not written yet. Every new UI string was added to both en and ku in dict.ts.
- [ ] G10 Manual visual review by the owner (dashboard, POS, customer page, vault, invoice) in light/dark/KU

Not built yet (spec items that need infrastructure decisions):
- Email: daily/weekly owner reports and scheduled report emails (needs an email provider / SMTP).
- Backup: automatic scheduled backups and in-app restore (manual JSON + Excel export is built).
