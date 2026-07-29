#!/usr/bin/env bash
# Build + run the Prompt Pit challenge reference builds (one container).
set -euo pipefail
cd "$(dirname "$0")"
IMAGE="pit-challenges"; NAME="pit-challenges"
[[ -f .env ]] || { echo "no .env — copy .env.example first"; exit 1; }
if grep -q '^SWML_BASIC_AUTH_PASSWORD=change-me' .env 2>/dev/null; then
  PW="$(openssl rand -hex 8 2>/dev/null || head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed -i.bak "s/^SWML_BASIC_AUTH_PASSWORD=.*/SWML_BASIC_AUTH_PASSWORD=$PW/" .env && rm -f .env.bak
fi
PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]')"; PORT="${PORT:-3400}"
echo "==> building $IMAGE…"; docker build -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --restart unless-stopped --name "$NAME" --env-file .env -p "${PORT}:${PORT}" "$IMAGE" >/dev/null
echo "==> started (auto-restarts on boot). Logs: docker logs -f $NAME"
sleep 18
docker logs "$NAME" 2>&1 | grep -E 'PUBLIC URL|worst-ivr|rogue|carrier|attached' | head
