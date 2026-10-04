# ALU FACTORY — notes for code changes

## Folder structure (see README.md)
- `src/frontend/` UI only (views per screen, components, browser helpers, styles).
- `src/backend/` business logic + database access + PDFs (server only).
- `src/shared/` pure code used by both (money, dates, i18n, rules, permissions).
- `src/app/` routing only: `page.tsx` / `route.ts` stay thin and call frontend views / backend functions.
- `database/` Prisma schema, migrations, seed, demo.
- Frontend may import backend *types* only. `npm run structure:check` enforces the boundaries (also run by `npm run build`).

## The About page must follow every rule change
The in-app page "How the app works" (`/about`) documents every business rule.
- Limits the app enforces live in `src/shared/rules.ts`; enforcing code imports them from there.
- The page text lives in `src/shared/about.ts`. Numbers go in as `{placeholders}` filled from `RULES` / live settings, never typed by hand.
- When a rule is added, changed or removed: update its text in `src/shared/about.ts`, add an entry at the top of `ABOUT_CHANGELOG` (added / changed / removed, EN + Kurdish Sorani), then run `npm run rules:sync`.
- `npm run rules:check` fails while rule files (listed in `scripts/rules.mjs`) changed since the last sync. `npm run build` prints the same as a warning.
- For a pure refactor that changes no rule: `npm run rules:sync -- --no-rule-change`.
