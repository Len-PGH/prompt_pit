#!/usr/bin/env bash
# Build + run The Prompt Pit — ONE container: web app + voice/SMS agent +
# cloudflared, all behind a single tunnel URL. Config comes from .env.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="prompt-pit"
NAME="prompt-pit"

# Bootstrap .env with a random operator key on first run.
if [[ ! -f .env ]]; then
  echo "==> No .env found — creating from .env.example"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then KEY="$(openssl rand -hex 16)"; else KEY="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"; fi
  sed -i.bak "s/^OPERATOR_KEY=.*/OPERATOR_KEY=$KEY/" .env && rm -f .env.bak
  echo "    generated OPERATOR_KEY=$KEY"
fi

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]')"; PORT="${PORT:-3000}"

echo "==> Building unified image ($IMAGE)…"
docker build -t "$IMAGE" .

docker rm -f "$NAME" >/dev/null 2>&1 || true

# Detached + auto-restart so it comes back after a host reboot / crash.
# Named volume 'prompt-pit-data' = crash-safe state snapshot.
docker run -d --restart unless-stopped --name "$NAME" \
  --env-file .env \
  -p "${PORT}:${PORT}" \
  -v prompt-pit-data:/data \
  "$IMAGE" >/dev/null

echo "==> Started (auto-restarts on boot). One container serves everything:"
echo "    Stage:    http://localhost:${PORT}/stage"
echo "    Operator: http://localhost:${PORT}/operator (key in .env)"
echo "    Logs:     docker logs -f ${NAME}"
sleep 18
docker logs "$NAME" 2>&1 | grep -E 'PUBLIC URL|attached' | tail -2 || true
