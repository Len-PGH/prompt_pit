#!/bin/sh
# The Prompt Pit — challenge builds: one SignalWire-SDK app + one cloudflared
# tunnel; every challenge is a route under the same reusable public URL.
set -eu
PORT="${PORT:-3400}"
export SWML_TRUST_PROXY_HEADERS=true   # derive callback URLs from the tunnel host

echo "[ch] starting app on :${PORT}"
uvicorn app:app --host 0.0.0.0 --port "${PORT}" &

i=0; while [ "$i" -lt 40 ]; do curl -sf -o /dev/null "http://127.0.0.1:${PORT}/healthz" 2>/dev/null && break; i=$((i+1)); sleep 0.5; done
echo "[ch] app up"

if [ "${NO_TUNNEL:-0}" = "1" ]; then echo "[ch] NO_TUNNEL=1 — LAN only"; wait; exit 0; fi

publish() {
  echo "======================================================================"
  echo "  PUBLIC URL (reused for every challenge):  $1"
  echo "    worst-ivr     $1/worst-ivr"
  echo "    fix-disaster  $1/fix-disaster"
  echo "    rogue-agent   $1/rogue-agent"
  echo "    carrier       $1/carrier"
  echo "    prompt-golf   $1/prompt-golf   (web tool)"
  echo "    menu          $1/menu          (call-in switcher)"
  echo "======================================================================"
  PUBLIC_URL="$1" python configure_number.py || echo "[ch] number auto-config skipped/failed"
}

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  echo "[ch] starting NAMED cloudflared tunnel…"
  cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" &
  if [ -n "${PUBLIC_URL:-}" ]; then sleep 3; publish "$PUBLIC_URL"; else echo "[ch] set PUBLIC_URL to your hostname"; fi
  wait; exit 0
fi

echo "[ch] starting cloudflared quick tunnel…"
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}" 2>/tmp/cf.log &
url=""; i=0
while [ "$i" -lt 40 ]; do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf.log 2>/dev/null | head -1 || true)
  [ -n "$url" ] && break; i=$((i + 1)); sleep 1
done
[ -n "$url" ] && publish "$url" || echo "[ch] WARN: no tunnel URL captured"
wait
