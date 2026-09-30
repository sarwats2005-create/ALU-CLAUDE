# Deploying alu-factory to Railway with Neon

The repo ships a production [Dockerfile](../Dockerfile) (Node 22 + Chromium + Noto fonts, non-root) and
Railway config ([railway.json](../railway.json)). Deployment is `railway up` — no other tooling needed.

## One-time setup

1. **Link Railway** (in the repo root):
   ```bash
   npm i -g @railway/cli@latest && railway login
   railway init            # or: railway link  (pick an existing project)
   ```
2. **Set the Neon variable** on the service:
   ```bash
   railway variables --set "DATABASE_URL=<pooled connection string from .env>"
   ```
   Copy the **pooled** `DATABASE_URL` from this repo's `.env` (it has `-pooler` in the host). Railway injects
   `DATABASE_URL` into the build too, but no build step reads it — every route is dynamic, so builds are safe.
   Never set `INSECURE_COOKIES=1` in production; secure cookies are automatic under `NODE_ENV=production`.
3. **Deploy**:
   ```bash
   railway up
   ```

## What happens on every deploy

The container start command (`railway.json`) runs, in order:

1. `npx prisma migrate deploy` — applies pending migrations to the Neon **production** branch (idempotent).
2. `npx tsx prisma/seed.ts` — idempotent seed: settings row, company profile, the 5 aluminum types.
3. `npx next start -p ${PORT}` — serves on Railway's `PORT` (healthchecked at `/api/health`).

The healthcheck ([src/app/api/health/route.ts](../src/app/api/health/route.ts)) pings Neon with `SELECT 1`;
Railway keeps the deploy in "waiting" until it returns 200, then switches traffic.

## PDF rendering (invoices/statements/reports)

The image installs Debian's `chromium` and Noto fonts (Arabic-script for Kurdish Sorani + Latin + CJK fallbacks).
[src/lib/server/docs/pdf.ts](../src/lib/server/docs/pdf.ts) finds it via `CHROME_PATH=/usr/bin/chromium` (set in
the Dockerfile) and launches with `--no-sandbox`, which is correct for a container. Documents embed their fonts,
so rendering is identical to local.

## Notes

- **Scale to zero / restarts**: Railway restarts the container on failure (see `restartPolicyType`). Migrate +
  seed re-run harmlessly on every boot.
- **Multiple replicas**: keep `numReplicas = 1` unless you verify the document counters and stock logic against
  concurrent writers — they're transaction-safe but were validated single-instance.
- **Migrations from your machine**: if you prefer to migrate manually instead of on boot, remove the migrate
  step from the start command and run `DATABASE_URL=<unpooled string> npx prisma migrate deploy` locally.
- **Costs**: one Railway service + Neon's free plan covers this workload; Railway bills by usage, so check the
  usage page after the first deploy.
