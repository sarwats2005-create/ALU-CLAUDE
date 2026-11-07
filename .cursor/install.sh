set -euo pipefail

if [ ! -x /usr/local/bin/node ]; then
  node_bin="$(find "$HOME/.nvm/versions/node" -maxdepth 3 -type f -path '*/v22.*/bin/node' 2>/dev/null | sort | tail -n 1 || true)"
  if [ -n "${node_bin}" ]; then
    sudo ln -sfn "$node_bin" /usr/local/bin/node
    sudo ln -sfn "$(dirname "$node_bin")/npm" /usr/local/bin/npm
    sudo ln -sfn "$(dirname "$node_bin")/npx" /usr/local/bin/npx
  fi
fi
command -v node >/dev/null
command -v npm >/dev/null

locate() {
  marker="$1"
  root=""
  cand=""
  for root in "$PWD" /workspace /agent /opt; do
    [ -d "$root" ] || continue
    if [ -e "$root/$marker" ]; then
      (cd "$root" && pwd)
      return 0
    fi
    for cand in "$root"/* "$root"/repos/*; do
      [ -e "$cand/$marker" ] || continue
      (cd "$cand" && pwd)
      return 0
    done
  done
  echo "Could not find a checkout containing $marker" >&2
  return 1
}

ALU="$(locate scripts/local-db.mjs)"
STORE="$(locate src/store.config.ts)"

cd "$ALU"
if [ -z "${DATABASE_URL:-}" ] && [ ! -f .env ]; then
  printf 'DATABASE_URL="%s"\n' 'postgresql://alu:alu@localhost:54329/alu_factory' > .env
fi
npm ci
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL='postgresql://alu:alu@localhost:54329/alu_factory'
fi
npx prisma generate

cd "$STORE"
npm ci

echo "CLOUD_ENV_INSTALL_OK"
