#!/usr/bin/env bash
#
# lo-watchdog.sh - hang-aware, DB-spell-safe watchdog for lo-worker.
#
# The worker writes app.worker_heartbeats every ~20s. systemd's Restart=always
# catches a crashed worker but NOT a hung one. This closes that gap:
#
#   - READ a fresh heartbeat row succeeds but last_beat is stale (> THRESHOLD)
#     => the DB is clearly responsive (it just answered), so the only cause is a
#        stuck worker => restart it.
#   - READ fails / times out => that is a Supabase capacity spell, NOT a worker
#     fault => do NOTHING (a restart cannot fix the DB and would just loop).
#
# Only act on unambiguous evidence. Install via lo-watchdog.service + .timer.
#
set -u
THRESHOLD=${WATCHDOG_THRESHOLD:-120}   # seconds; heartbeat cadence is ~20s
LOG=/var/log/lo-watchdog.log
WORKER_DIR=${WORKER_DIR:-/root/linkedin-operator/apps/worker}
cd "$WORKER_DIR"

SB_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"')
SB_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '"')

resp=$(curl -s --max-time 15 \
  "$SB_URL/rest/v1/worker_heartbeats?select=last_beat&order=last_beat.desc&limit=1" \
  -H "Accept-Profile: app" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" 2>/dev/null) || resp=""

beat=$(echo "$resp" | grep -oE '"last_beat":"[^"]+"' | head -1 | sed -E 's/"last_beat":"([^"]+)"/\1/')

if [ -z "$beat" ]; then
  echo "$(date -Is) skip: no readable heartbeat (DB busy/unreachable); resp=${resp:0:80}" >> "$LOG"
  exit 0
fi

beat_epoch=$(date -d "$beat" +%s 2>/dev/null || echo 0)
now_epoch=$(date +%s)
age=$(( now_epoch - beat_epoch ))

if [ "$beat_epoch" -gt 0 ] && [ "$age" -gt "$THRESHOLD" ]; then
  echo "$(date -Is) RESTART: heartbeat stale ${age}s (> ${THRESHOLD}s), DB readable -> worker hung" >> "$LOG"
  systemctl restart lo-worker
else
  echo "$(date -Is) ok: heartbeat age ${age}s" >> "$LOG"
fi
