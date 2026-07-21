#!/bin/sh
# The Prompt Pit — single container: web app (Node) + voice/SMS agent (Python)
# + cloudflared, all behind ONE tunnel URL.
#
#   cloudflared -> Node :$PORT  ->  serves web directly
#                                   proxies /agent + /sms -> Python :$AGENT_PORT
set -eu

PORT="${PORT:-3000}"
AGENT_PORT="${AGENT_PORT:-8100}"
export NODE_URL="http://127.0.0.1:${PORT}"

# Agent basic auth (must match the userinfo configure_number.py puts in the
# SignalWire voice resource URL — derive both from one VOICE_AUTH_PASSWORD).
if [ -z "${VOICE_AUTH_PASSWORD:-}" ]; then
  VOICE_AUTH_PASSWORD="$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi
export VOICE_AUTH_PASSWORD
export SWML_BASIC_AUTH_USER="${VOICE_AUTH_USER:-vote}"
export SWML_BASIC_AUTH_PASSWORD="$VOICE_AUTH_PASSWORD"
export SWML_TRUST_PROXY_HEADERS=true

echo "[all] starting voice agent on 127.0.0.1:${AGENT_PORT}"
uvicorn agent:app --host 127.0.0.1 --port "$AGENT_PORT" &

echo "[all] starting web app on :${PORT}"
node server.js &

# Wait for both to be ready.
i=0; while [ "$i" -lt 40 ]; do curl -sf -o /dev/null "http://127.0.0.1:${PORT}/healthz" 2>/dev/null && break; i=$((i+1)); sleep 0.5; done
i=0; while [ "$i" -lt 40 ]; do curl -sf -o /dev/null "http://127.0.0.1:${AGENT_PORT}/health" 2>/dev/null && break; i=$((i+1)); sleep 0.5; done
echo "[all] web + agent up"

if [ "${NO_TUNNEL:-0}" = "1" ]; then
  echo "[all] NO_TUNNEL=1 — LAN only, no public URL / number config"
  wait
  exit 0
fi

# Publish a public URL to the app + point the SignalWire number at it.
publish() {
  echo "======================================================================"
  echo "  PUBLIC URL (web + voice + sms):  $1"
  echo "======================================================================"
  curl -sf -o /dev/null -X POST -H "Content-Type: application/json" \
    --data "{\"url\":\"$1\"}" "http://127.0.0.1:${PORT}/api/public-url" \
    && echo "[all] posted public url to node" \
    || echo "[all] warn: could not post public url to node"
  python configure_number.py || echo "[all] number auto-config skipped/failed"
}

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  # Stable NAMED tunnel — hostname/ingress configured in the Cloudflare dashboard.
  echo "[all] starting NAMED cloudflared tunnel (stable URL)…"
  cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" &
  if [ -n "${PUBLIC_URL:-}" ]; then
    sleep 3
    publish "$PUBLIC_URL"
  else
    echo "[all] WARN: TUNNEL_TOKEN set but PUBLIC_URL missing — set it to your hostname (https://…)"
  fi
  wait
  exit 0
fi

echo "[all] starting cloudflared quick tunnel…"
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}" 2>/tmp/cf.log &
url=""
i=0
while [ "$i" -lt 40 ]; do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf.log 2>/dev/null | head -1 || true)
  [ -n "$url" ] && break
  i=$((i + 1)); sleep 1
done
if [ -n "$url" ]; then publish "$url"; else echo "[all] WARN: no tunnel URL captured"; fi

wait
