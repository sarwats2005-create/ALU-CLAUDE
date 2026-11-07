#!/usr/bin/env bash
# Boot script for ALU FACTORY. Safe to run more than once.
# Starts local Postgres when DATABASE_URL is local, applies migrations, then
# serves the Next.js dev server on port 3000.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

local_url='postgresql://alu:alu@localhost:54329/alu_factory'
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="$local_url"
  if [ ! -f .env ]; then
    printf 'DATABASE_URL="%s"\n' "$local_url" > .env
  fi
fi

if [ -z "${CHROME_PATH:-}" ] && [ -x /usr/local/bin/google-chrome ]; then
  export CHROME_PATH=/usr/local/bin/google-chrome
fi

node scripts/local-db.mjs
npm run db:deploy

if (echo >/dev/tcp/127.0.0.1/3000) >/dev/null 2>&1; then
  echo "ALU FACTORY already listening on port 3000"
  exit 0
fi

exec npm run dev -- --hostname 0.0.0.0
