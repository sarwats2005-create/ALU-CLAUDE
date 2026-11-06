#!/usr/bin/env bash
# Idempotent dependency install for ALU FACTORY cloud agents.
# Runs from any checkout layout: this script lives in the repo's .cursor directory.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  node_bin="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -type f -path '*/v22.*/bin/node' 2>/dev/null | sort | tail -n 1 || true)"
  if [ -n "${node_bin}" ]; then
    sudo ln -sfn "$(dirname "$node_bin")/node" /usr/local/bin/node
    sudo ln -sfn "$(dirname "$node_bin")/npm" /usr/local/bin/npm
    sudo ln -sfn "$(dirname "$node_bin")/npx" /usr/local/bin/npx
  fi
fi

command -v node >/dev/null 2>&1
command -v npm >/dev/null 2>&1
node -v

# Prisma's schema reads env("DATABASE_URL") at generate time. Cloud agents use a
# local Postgres (started by .cursor/start.sh) unless DATABASE_URL is already set
# to a hosted database such as Neon. The desktop .env is not copied into the VM.
local_url='postgresql://alu:alu@localhost:54329/alu_factory'
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="$local_url"
  if [ ! -f .env ]; then
    printf 'DATABASE_URL="%s"\n' "$local_url" > .env
  fi
fi

npm ci
npx prisma generate
echo "ALU_INSTALL_OK"
