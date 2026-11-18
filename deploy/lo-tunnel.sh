#!/usr/bin/env bash
# Runs a cloudflared quick tunnel to the worker ingest port and publishes the
# (per-start, ephemeral) trycloudflare URL to app.worker_endpoints so the web
# app always has the current address.
set -u
LOG=/var/log/lo-tunnel.log
: > "$LOG"
/usr/bin/cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate >>"$LOG" 2>&1 &
CFPID=$!
trap "kill $CFPID 2>/dev/null" TERM INT
URL=""
for i in $(seq 1 60); do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "lo-tunnel: no trycloudflare URL within 60s" >&2
  kill $CFPID 2>/dev/null
  exit 1
fi
echo "lo-tunnel: $URL"
cd /root/linkedin-operator/apps/worker
for i in 1 2 3 4 5; do
  /usr/bin/node --env-file=.env publish-endpoint.mjs "$URL" && break
  echo "lo-tunnel: publish retry $i" >&2
  sleep 5
done
wait $CFPID
