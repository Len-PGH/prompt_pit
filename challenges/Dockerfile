# The Prompt Pit — challenge reference builds: one Python app (SignalWire SDK)
# hosting every challenge at its own route, + cloudflared, behind one tunnel.
FROM python:3.11-slim
ARG CLOUDFLARED_VERSION=2024.12.2
ARG TARGETARCH=amd64
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini \
 && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}" \
      -o /usr/local/bin/cloudflared \
 && chmod +x /usr/local/bin/cloudflared \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py configure_number.py entrypoint.sh ./
COPY public ./public
RUN chmod +x entrypoint.sh && useradd -m app && mkdir -p /app/data && chown -R app /app
USER app

ENV PORT=3400
EXPOSE 3400
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD curl -sf -o /dev/null http://localhost:${PORT}/healthz || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "./entrypoint.sh"]
