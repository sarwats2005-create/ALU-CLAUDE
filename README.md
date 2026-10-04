# ALU FACTORY — project structure

One app, one deployment (Railway), one database (Neon). The code is split into four areas by **what kind of
work it does**, so every change has one obvious home.

```
alu-factory/
├─ src/
│  ├─ frontend/        WHAT THE USER SEES — runs in the browser
│  │  ├─ views/        one folder per screen: pos/, invoices/, vault/, customers/, settings/, about/, landing/, login/ …
│  │  ├─ components/   shared UI pieces: buttons, dialogs, tables, sidebar (shell/), SplitPayment, TxnPanel …
│  │  ├─ lib/          browser helpers: API calls, app context, printing, local folders (invoices / backups)
│  │  └─ styles/       globals.css (colours, fonts, theme)
│  │
│  ├─ backend/         THE BUSINESS LOGIC — runs only on the server
│  │  ├─ txns.ts       sales, purchases, payments, vault operations, processing (every money rule)
│  │  ├─ ledger.ts     the three ledgers (vault, partner, stock) — balances are sums of these lines
│  │  ├─ dues.ts, expenses.ts, catalog.ts, erase.ts, backup.ts, auth.ts, audit.ts …
│  │  ├─ queries/      read-only data for screens and reports (dashboard, history, inventory, reports …)
│  │  ├─ docs/         invoice / statement / report PDFs
│  │  └─ db.ts         the single database connection
│  │
│  ├─ shared/          USED BY BOTH SIDES — pure code, no database, no browser
│  │  ├─ money.ts, dates.ts, format.ts, conversion.ts   numbers, currency, rates, dates
│  │  ├─ rules.ts      every limit the app enforces (24 h invoice lock, PIN tries, backups…)
│  │  ├─ about.ts      the text of the "How the app works" page
│  │  ├─ permissions.ts, kinds.ts, lock.ts
│  │  └─ i18n/         English + Kurdish (Sorani) text
│  │
│  └─ app/             ROUTING ONLY (Next.js needs this folder)
│     ├─ (app)/<page>/page.tsx   checks access, loads data from backend, shows a frontend view
│     └─ api/<name>/route.ts     the HTTP API: checks access, calls a backend function, returns JSON
│
├─ database/           THE DATABASE
│  ├─ schema.prisma    tables and columns
│  ├─ migrations/      every change to the tables, applied in order on deploy
│  ├─ seed.ts          base rows every install needs (settings, company profile)
│  └─ demo.ts          optional demo data (npm run db:demo)
│
├─ tests/              end-to-end tests against a running server (api, dues, erase, split, backup)
├─ scripts/            deploy (migrate.mjs), local database, rule + folder checks
└─ public/             static files (logo, images)
```

## Where does my change go?

| I want to change…                                   | Go to |
|------------------------------------------------------|-------|
| how a screen looks, a button, a form, a layout       | `src/frontend/views/<screen>/` or `src/frontend/components/` |
| a word or translation                                | `src/shared/i18n/dict.ts` |
| colours, fonts, dark mode                            | `src/frontend/styles/globals.css` |
| how money / stock / debt is calculated or checked    | `src/backend/` (mostly `txns.ts`, `ledger.ts`) |
| a number the app enforces (lock time, PIN tries…)    | `src/shared/rules.ts` (+ the About text in `src/shared/about.ts`) |
| what a report or list shows                          | `src/backend/queries/` |
| the PDF of an invoice or statement                   | `src/backend/docs/` |
| a table or column                                    | `database/schema.prisma` + a new folder in `database/migrations/` |
| a new page                                           | view in `src/frontend/views/`, route in `src/app/(app)/<name>/page.tsx` |
| a new API endpoint                                   | logic in `src/backend/`, route in `src/app/api/<name>/route.ts` |

## The rules between folders (checked automatically)

- **frontend** never imports backend code (only its TypeScript *types*). It talks to the backend through
  `/api/...` with `src/frontend/lib/api.ts`.
- **shared** imports nothing from frontend or backend — it must work in both places.
- **backend** never imports frontend.
- Backend files start with `import 'server-only'`, so backend code can't end up in the browser by mistake.

`npm run structure:check` checks these rules; `npm run build` runs it and stops if one is broken.

## Why one app and not two separate servers?

The frontend and backend are separated by folder and by these rules, but they are deployed together as one
Next.js app. That keeps one deployment, one domain (secure sign-in cookies, no cross-site setup) and one set of
shared types, so the screens and the server can never disagree about the shape of the data. If the backend ever
has to serve a second client (a mobile app, for example), `src/backend/` can be moved behind its own server
without rewriting it, because nothing in it depends on the frontend.

## Everyday commands

```
npm run dev              start locally (http://localhost:3000)
npm run build            checks (folders + rules) and production build
npm run typecheck        TypeScript only
npm run db:deploy        apply database migrations + seed (Railway runs this on every start)
npm run rules:check      is the About page in step with the rules?
npm run structure:check  are the folder rules respected?
```
