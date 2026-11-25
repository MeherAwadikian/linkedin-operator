#!/usr/bin/env bash
#
# lo-x11vnc.sh - attach x11vnc to whatever Xvfb display lo-worker's `xvfb-run`
# created, so the operator can SEE the headful Chrome and complete a LinkedIn
# login / 2FA / checkpoint on a headless droplet. No change to lo-worker needed;
# the display + auth path are discovered at runtime, so this self-heals across
# worker restarts (Restart=always re-runs us and re-finds the new display).
#
# Binds to localhost only; noVNC (websockify) bridges it, and Caddy fronts that
# with HTTPS + basic_auth. See deploy/caddy/linkedin-operator.caddy.example.
#
set -u
line=$(ps -eo args | grep -E 'Xvfb :[0-9]+' | grep -v grep | head -1)
disp=$(echo "$line" | grep -oE 'Xvfb :[0-9]+' | grep -oE ':[0-9]+')
auth=$(echo "$line" | grep -oE '\-auth [^ ]+' | awk '{print $2}')
if [ -z "$disp" ]; then
  echo "lo-x11vnc: no Xvfb display found (is lo-worker running?)" >&2
  exit 1
fi
echo "lo-x11vnc: attaching display $disp auth ${auth:-none}"
exec x11vnc -display "$disp" ${auth:+-auth "$auth"} -localhost -rfbport 5900 \
  -forever -shared -noxdamage -nopw -quiet
