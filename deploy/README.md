# VM deployment (DigitalOcean droplet)

Runs the LinkedIn Operator **worker** (Playwright, headful under Xvfb) 24/7 on a
Linux host, behind a cloudflared quick tunnel. The Next.js web app stays on
Cloudflare Workers and Supabase is unchanged; only the worker moves off the
local PC onto the droplet.

## Why a tunnel (not the public IP)

The worker's ingest server binds to `127.0.0.1` only, and the web app's
`isAllowedIngestUrl` validator accepts **only** `https://*.trycloudflare.com`.
So a cloudflared quick tunnel fronts the loopback port, and its (ephemeral)
URL is republished to `app.worker_endpoints` on every start via the repo's
`apps/worker/publish-endpoint.mjs`. The web app always routes to the newest
`worker_endpoints` row, so the per-restart URL churn needs no dashboard edits.

## Files

| File | Installed to | Purpose |
|------|--------------|---------|
| `install.sh` | run once | provisions Node 24, pnpm, Playwright + Chrome, cloudflared, systemd units |
| `lo-tunnel.sh` | `/usr/local/bin/lo-tunnel.sh` | starts the tunnel, waits for the URL, republishes it (5x retry) |
| `systemd/lo-worker.service` | `/etc/systemd/system/` | the worker (`xvfb-run node --env-file=.env --import tsx src/index.ts`) |
| `systemd/lo-tunnel.service` | `/etc/systemd/system/` | the tunnel + publisher (starts after the worker) |

Both units are `Restart=always` and `enabled`, so they survive crashes and reboots.

## Deploy

```bash
# on a fresh Ubuntu 24.04 host, as root:
git clone https://github.com/MeherAwadikian/linkedin-operator.git /root/linkedin-operator
bash /root/linkedin-operator/deploy/install.sh

# copy the worker secrets up (NEVER committed), then:
#   scp apps/worker/.env root@HOST:/root/linkedin-operator/apps/worker/.env
# set a unique WORKER_ID in that .env (e.g. worker-droplet-sfo2), then:
systemctl start lo-worker lo-tunnel
```

## Verify

```bash
systemctl is-active lo-worker lo-tunnel       # both: active
journalctl -u lo-worker -n 20 --no-pager      # worker ticks
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /var/log/lo-tunnel.log | tail -1
# heartbeat should be seconds-fresh in app.worker_heartbeats (id = your WORKER_ID)
```

## Notes

- **One worker per account.** Do not also run the Windows `START.bat` worker — two
  workers double-claim jobs. The web app routes to the newest endpoint row regardless.
- Secrets (`apps/worker/.env`) are gitignored and must be copied up out of band.
- Headful Chrome under Xvfb is intentional (`channel: 'chrome'` for 2FA visibility);
  do not switch to `WORKER_HEADLESS=1` without testing the LinkedIn login path.
