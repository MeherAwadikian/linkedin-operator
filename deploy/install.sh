#!/usr/bin/env bash
#
# install.sh - Provision a fresh Ubuntu 24.04 host to run the LinkedIn Operator
# worker 24/7 (Playwright under Xvfb) behind a cloudflared quick tunnel.
#
# Usage (as root on the droplet):
#   bash deploy/install.sh
#
# Prereqs: you must place a valid apps/worker/.env on the host BEFORE enabling
# the services (SUPABASE_SERVICE_ROLE_KEY, VAULT_MASTER_KEY, WORKER_INGEST_TOKEN,
# etc.). This script never writes secrets.
#
set -euo pipefail

REPO_DIR=${REPO_DIR:-/root/linkedin-operator}
REPO_URL=${REPO_URL:-https://github.com/MeherAwadikian/linkedin-operator.git}
BRANCH=${BRANCH:-main}

echo "==> apt deps"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates xvfb

echo "==> Node 24 (NodeSource)"
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

echo "==> pnpm via corepack"
corepack enable
corepack prepare pnpm@latest --activate || true

echo "==> clone / update repo"
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> pnpm install"
pnpm install

echo "==> Playwright system deps + Google Chrome (worker uses channel:'chrome')"
cd "$REPO_DIR/apps/worker"
pnpm exec playwright install-deps
# Chrome first (the channel the worker uses); bundled Chromium as fallback so
# automation still works if the Chrome package is unavailable on this distro.
pnpm exec playwright install chrome || pnpm exec playwright install chromium

echo "==> Browser preflight (launch + close a blank page)"
node "$REPO_DIR/setup/preflight-browser.mjs" || {
  echo "browser preflight FAILED - LinkedIn automation will not run until this is fixed" >&2
}

echo "==> cloudflared"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/bin/cloudflared
  chmod +x /usr/bin/cloudflared
fi

if [ ! -f "$REPO_DIR/apps/worker/.env" ]; then
  echo "!! apps/worker/.env is missing - copy it up (scp) before starting the services." >&2
fi

echo "==> install tunnel script + systemd units"
install -m 0755 "$REPO_DIR/deploy/lo-tunnel.sh" /usr/local/bin/lo-tunnel.sh
install -m 0644 "$REPO_DIR/deploy/systemd/lo-worker.service" /etc/systemd/system/lo-worker.service
install -m 0644 "$REPO_DIR/deploy/systemd/lo-tunnel.service" /etc/systemd/system/lo-tunnel.service
systemctl daemon-reload
systemctl enable lo-worker.service lo-tunnel.service

echo "==> done. Start with: systemctl start lo-worker lo-tunnel"
echo "   Logs: journalctl -u lo-worker -f  /  journalctl -u lo-tunnel -f"
