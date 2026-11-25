#!/usr/bin/env bash
#
# lo-publish-endpoint.sh - publish the STABLE worker endpoint to
# app.worker_endpoints so the web app routes to it. This replaces the ephemeral
# cloudflared quick tunnel: the URL is a permanent Caddy-fronted HTTPS host
# (Let's Encrypt), so it never changes and survives prod redeploys.
#
# Reads WORKER_PUBLIC_URL from apps/worker/.env (e.g.
# https://lo.<dashed-ip>.sslip.io). Idempotent; run on boot via lo-endpoint.service.
#
set -u
WORKER_DIR=${WORKER_DIR:-/root/linkedin-operator/apps/worker}
cd "$WORKER_DIR"

URL=$(grep -E '^WORKER_PUBLIC_URL=' .env | cut -d= -f2- | tr -d '"')
if [ -z "${URL:-}" ]; then
  echo "lo-publish: WORKER_PUBLIC_URL not set in $WORKER_DIR/.env" >&2
  exit 1
fi

for i in 1 2 3 4 5; do
  /usr/bin/node --env-file=.env publish-endpoint.mjs "$URL" && exit 0
  echo "lo-publish: retry $i" >&2
  sleep 5
done
exit 1
