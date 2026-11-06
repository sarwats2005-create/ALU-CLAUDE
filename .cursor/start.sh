set -euo pipefail

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

port_open() {
  (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
}

ALU="$(locate scripts/local-db.mjs)"
STORE="$(locate src/store.config.ts)"

cd "$ALU"
if [ -z "${DATABASE_URL:-}" ] && [ ! -f .env ]; then
  printf 'DATABASE_URL="%s"\n' 'postgresql://alu:alu@localhost:54329/alu_factory' > .env
fi
node scripts/local-db.mjs
npm run db:deploy

NPM_BIN="$(command -v npm)"
NPX_BIN="$(command -v npx)"

if ! port_open 3000; then
  tmux has-session -t alu_factory 2>/dev/null || tmux new-session -d -s alu_factory -c "$ALU" -- \
    "$NPM_BIN" run dev -- --hostname 0.0.0.0
fi
if ! port_open 3001; then
  tmux has-session -t os_store 2>/dev/null || tmux new-session -d -s os_store -c "$STORE" -- \
    "$NPX_BIN" next dev --webpack --hostname 127.0.0.1 --port 3001
fi

alu_ok=0
store_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45; do
  if [ "$alu_ok" != 1 ] && curl -fsS http://127.0.0.1:3000/api/health | grep -q '"db":true'; then
    alu_ok=1
  fi
  if [ "$store_ok" != 1 ] && curl -fsS http://127.0.0.1:3001/api/health | grep -q '"ok":true'; then
    store_ok=1
  fi
  if [ "$alu_ok" = 1 ] && [ "$store_ok" = 1 ]; then
    echo "CLOUD_ENV_START_OK"
    exit 0
  fi
  sleep 1
done
echo "ALU health=$alu_ok store health=$store_ok" >&2
tmux capture-pane -t alu_factory -p | tail -40 >&2 || true
tmux capture-pane -t os_store -p | tail -40 >&2 || true
exit 1
