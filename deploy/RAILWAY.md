# Deploying ALU FACTORY on Railway + Neon (no Docker)

Railway builds this repo with **Railpack** (its default builder) — no Dockerfile is used.

| File | What it does |
|---|---|
| `railway.json` | Builder = RAILPACK, start command, health check `/api/health`, restart on failure |
| `railpack.json` | Adds Chromium + fonts to the runtime image (PDF invoices/statements/reports) and sets `CHROME_PATH` |
| `package.json` | `engines.node = 22.x`; `build` = `prisma generate && next build`; `start` = `next start` (listens on Railway's `PORT`) |
| `scripts/migrate.mjs` | `npm run db:deploy`: runs `prisma migrate deploy` over Neon's **direct** connection, then the idempotent seed |

## One-time setup

1. **Neon** — use the project's `production` branch. Copy the **pooled** connection string
   (host contains `-pooler`, ends with `?sslmode=require`). Region: Frankfurt (`eu-central-1`).
2. **Railway** → New Project → *Deploy from GitHub repo* → pick this repository.
3. Service → **Settings → Region**: *EU West (Amsterdam)* — closest to Neon Frankfurt.
4. Service → **Variables**:
   - `DATABASE_URL` = the Neon pooled string (required)
   - `DIRECT_URL` = Neon's direct (non-pooler) string — optional; if unset it is derived by removing `-pooler` from the host
5. Service → **Settings → Networking → Generate Domain**.
6. Deploy. Each deploy: `npm ci` → `npm run build` → start = `npm run db:deploy && npm start`
   (migrations + seed, then the app). The deploy goes live once `/api/health` returns 200.

## Every update

Commit and push to the connected branch — Railway rebuilds and redeploys automatically.
New Prisma migrations are applied on start; nothing to run by hand.

## Checks

- `https://<your-domain>/api/health` → `{"ok":true,"db":true}`
- Build logs show `[db:deploy] migrating via ep-….eu-central-1.aws.neon.tech` (no `-pooler`)
- Print an invoice PDF once to confirm Chromium works

## Troubleshooting

- **Health check fails / 503** — `DATABASE_URL` missing or wrong; check the variable and that `sslmode=require` is present.
- **Migration hangs or fails with advisory-lock errors** — it is going through the pooler; set `DIRECT_URL` explicitly.
- **PDF error "Chrome not found"** — confirm `railpack.json` is in the repo root and redeploy (it installs `chromium`).
- Secure cookies are automatic in production (`NODE_ENV=production`), so always use the HTTPS Railway domain.
