# ALU FACTORY — notes for code changes

## The About page must follow every rule change
The in-app page "How the app works" (`/about`) documents every business rule.
- Limits the app enforces live in `src/lib/rules.ts`; enforcing code imports them from there.
- The page text lives in `src/lib/about.ts`. Numbers go in as `{placeholders}` filled from `RULES` / live settings, never typed by hand.
- When a rule is added, changed or removed: update its text in `src/lib/about.ts`, add an entry at the top of `ABOUT_CHANGELOG` (added / changed / removed, EN + Kurdish Sorani), then run `npm run rules:sync`.
- `npm run rules:check` fails while rule files (listed in `scripts/rules.mjs`) changed since the last sync. `npm run build` prints the same as a warning.
- For a pure refactor that changes no rule: `npm run rules:sync -- --no-rule-change`.
