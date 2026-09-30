# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma needs openssl for its engine; Next needs nothing special.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

COPY . .
# DATABASE_URL is not needed at build time: every page/API is dynamic and no route prerenders data.
RUN npx prisma generate \
 && npx next build --no-lint

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # PDF pipeline (src/lib/server/docs/pdf.ts) launches this binary with --no-sandbox.
    CHROME_PATH=/usr/bin/chromium

# Chromium for server-side PDF rendering (puppeteer-core launches it, sandbox already disabled)
# + Noto fonts: Arabic-script (Kurdish Sorani/Arabic) + Latin + CJK fallbacks so any glyph renders.
# openssl is required by the Prisma query engine at runtime.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-noto-core \
      fonts-noto-cjk \
      fontconfig \
      openssl \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

# Non-root user; Chromium needs a writable HOME for its profile dir.
RUN groupadd --system --gid 1001 alu \
 && useradd --system --uid 1001 --gid alu --create-home --shell /usr/sbin/nologin alu

COPY --from=builder --chown=alu:alu /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=alu:alu /app/prisma ./prisma
COPY --from=builder --chown=alu:alu /app/node_modules ./node_modules
COPY --from=builder --chown=alu:alu /app/.next ./.next
COPY --from=builder --chown=alu:alu /app/public ./public
COPY --from=builder --chown=alu:alu /app/next.config.ts ./

USER alu
EXPOSE 3000

# Migrate + seed (both idempotent) against Neon, then serve.
# Uses the pooled DATABASE_URL; safe to run on every deploy/restart.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npx next start -p ${PORT}"]
