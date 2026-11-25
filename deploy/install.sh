#!/usr/bin/env bash
#
# install.sh - Provision a fresh Ubuntu 24.04 host to run the LinkedIn Operator
# worker 24/7 (Playwright under Xvfb), reachable over a STABLE Caddy HTTPS
# endpoint, with crash + hang recovery and a noVNC login hand-off.
#
# Usage (as root on the droplet):
#   bash deploy/install.sh
#
# Prereqs: place a valid apps/worker/.env on the host BEFORE enabling the
# services. Besides the usual secrets (SUPABASE_SERVICE_ROLE_KEY,
# VAULT_MASTER_KEY, WORKER_INGEST_TOKEN, NEXT_PUBLIC_SUPABASE_URL), set:
#   WORKER_ID=worker-droplet-<region>
#   WORKER_PUBLIC_URL=https://lo.<dashed-ip>.sslip.io
# This script never writes secrets.
#
# After running: append deploy/caddy/linkedin-operator.caddy.example to
# /etc/caddy/Caddyfile (substituting your IP + a bcrypt password), then
# `systemctl reload caddy`. See deploy/README.md.
#
set -euo pipefail

REPO_DIR=${REPO_DIR:-/root/linkedin-operator}
REPO_URL=${REPO_URL:-https://github.com/MeherAwadikian/linkedin-operator.git}
BRANCH=${BRANCH:-main}

echo "==> apt deps"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# xvfb: headful Chrome display. caddy: stable HTTPS front door.
# x11vnc/novnc/websockify: the login hand-off surface.
apt-get install -y git curl ca-certificates xvfb x11vnc novnc websockify debian-keyring debian-archive-keyring apt-transport-https

echo "==> Caddy (official repo)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

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
pnpm exec playwright install chrome || pnpm exec playwright install chromium

echo "==> Browser preflight (launch + close a blank page)"
node "$REPO_DIR/setup/preflight-browser.mjs" || {
  echo "browser preflight FAILED - LinkedIn automation will not run until this is fixed" >&2
}

if [ ! -f "$REPO_DIR/apps/worker/.env" ]; then
  echo "!! apps/worker/.env is missing - copy it up (scp) before starting the services." >&2
fi

echo "==> install scripts + systemd units"
install -m 0755 "$REPO_DIR/deploy/lo-publish-endpoint.sh" /usr/local/bin/lo-publish-endpoint.sh
install -m 0755 "$REPO_DIR/deploy/lo-watchdog.sh"         /usr/local/bin/lo-watchdog.sh
install -m 0755 "$REPO_DIR/deploy/lo-x11vnc.sh"           /usr/local/bin/lo-x11vnc.sh
for u in lo-worker lo-endpoint lo-watchdog lo-x11vnc lo-novnc; do
  install -m 0644 "$REPO_DIR/deploy/systemd/$u.service" "/etc/systemd/system/$u.service"
done
install -m 0644 "$REPO_DIR/deploy/systemd/lo-watchdog.timer" /etc/systemd/system/lo-watchdog.timer
systemctl daemon-reload
systemctl enable lo-worker.service lo-endpoint.service lo-x11vnc.service lo-novnc.service lo-watchdog.timer

cat <<'NEXT'

==> units installed + enabled. Remaining manual steps:
  1) Append deploy/caddy/linkedin-operator.caddy.example to /etc/caddy/Caddyfile
     (substitute your dashed IP + a `caddy hash-password` bcrypt), then:
       caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
  2) Ensure apps/worker/.env has WORKER_PUBLIC_URL=https://lo.<dashed-ip>.sslip.io
  3) Start everything:
       systemctl start lo-worker lo-endpoint lo-x11vnc lo-novnc && systemctl start lo-watchdog.timer
  Logs: journalctl -u lo-worker -f   |   tail -f /var/log/lo-watchdog.log

Optional fallback: the legacy cloudflared quick tunnel (deploy/lo-tunnel.sh +
systemd/lo-tunnel.service) still works if you cannot use a stable Caddy host;
do not run both the tunnel and lo-endpoint (whichever publishes last wins).
NEXT
