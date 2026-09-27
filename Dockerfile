# The Prompt Pit — single container: web app (Node) + voice/SMS agent (Python)
# + cloudflared. One image, one tunnel, one URL for everything.
FROM node:20-bookworm-slim

ARG CLOUDFLARED_VERSION=2024.12.2
ARG TARGETARCH=amd64
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv curl ca-certificates tini \
 && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}" \
      -o /usr/local/bin/cloudflared \
 && chmod +x /usr/local/bin/cloudflared \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Node deps ---
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# --- Python deps (in a venv to avoid PEP 668) ---
COPY voteline/requirements.txt ./requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:${PATH}"

# --- App code (web + agent) ---
COPY server.js ./
COPY public ./public
COPY voteline/agent.py voteline/configure_number.py ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh \
 && mkdir -p /data && chown -R node:node /app /data

ENV PORT=3000 \
    AGENT_PORT=8100 \
    NODE_ENV=production \
    DATA_DIR=/data \
    VOICE_UPSTREAM=http://127.0.0.1:8100
EXPOSE 3000
VOLUME ["/data"]
USER node

HEALTHCHECK --interval=15s --timeout=4s --start-period=12s --retries=3 \
  CMD curl -sf -o /dev/null http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
