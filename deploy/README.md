# VM deployment (DigitalOcean droplet)

Runs the LinkedIn Operator **worker** (Playwright, headful under Xvfb) 24/7 on a
Linux host, reachable over a **stable Caddy HTTPS endpoint**, with crash + hang
recovery and a password-gated **noVNC login hand-off**. The Next.js web app
stays on Cloudflare Workers and Supabase is unchanged; only the worker moves off
the local PC onto the droplet.

## Architecture

```
CF Worker (web)  --https-->  worker_endpoints:latest = https://lo.<dashed-ip>.sslip.io
                              Caddy (Let's Encrypt TLS)  -->  127.0.0.1:8787 worker ingest (token-gated)
operator browser --https-->  https://vnc.<dashed-ip>.sslip.io  (basic_auth)
                              Caddy  -->  127.0.0.1:6080 websockify/noVNC  -->  127.0.0.1:5900 x11vnc  -->  Xvfb :99
```

The worker ingest binds to `127.0.0.1` only; Caddy's port 443 is the sole public
surface. `sslip.io` resolves `<label>.<dashed-ip>.sslip.io` to the embedded IP,
so you get stable HTTPS hostnames with auto-renewing certs **without owning a
domain**. The web app's `isAllowedIngestUrl` trusts the `lo.` host (plus the
legacy `*.trycloudflare.com` and an optional `WORKER_INGEST_HOST` override).

## Files

| File | Installed to | Purpose |
|------|--------------|---------|
| `install.sh` | run once | Node 24, pnpm, Playwright+Chrome, Caddy, x11vnc/noVNC, all units |
| `lo-publish-endpoint.sh` | `/usr/local/bin/` | publishes `WORKER_PUBLIC_URL` to `app.worker_endpoints` (5x retry) |
| `lo-watchdog.sh` | `/usr/local/bin/` | restarts the worker only if it is **hung** (DB readable, heartbeat stale) |
| `lo-x11vnc.sh` | `/usr/local/bin/` | attaches x11vnc to the worker's Xvfb (self-heals on restart) |
| `systemd/lo-worker.service` | `/etc/systemd/system/` | the worker (`xvfb-run node --env-file=.env --import tsx src/index.ts`), `Restart=always` |
| `systemd/lo-endpoint.service` | `/etc/systemd/system/` | oneshot stable-URL publisher (after the worker) |
| `systemd/lo-watchdog.{service,timer}` | `/etc/systemd/system/` | hang-watchdog, every 60s |
| `systemd/lo-x11vnc.service` | `/etc/systemd/system/` | x11vnc, localhost only, `Restart=always` |
| `systemd/lo-novnc.service` | `/etc/systemd/system/` | websockify 6080 -> 5900, `Restart=always` |
| `caddy/linkedin-operator.caddy.example` | append by hand | the two Caddy vhosts (ingest + noVNC) |

Legacy fallback (optional, not enabled by default): `lo-tunnel.sh` +
`systemd/lo-tunnel.service` run the old cloudflared quick tunnel. Use only if a
stable Caddy host is impossible; never run it alongside `lo-endpoint`.

## Deploy

```bash
# on a fresh Ubuntu 24.04 host, as root:
git clone https://github.com/MeherAwadikian/linkedin-operator.git /root/linkedin-operator
bash /root/linkedin-operator/deploy/install.sh

# copy the worker secrets up (NEVER committed):
#   scp apps/worker/.env root@HOST:/root/linkedin-operator/apps/worker/.env
# that .env must set WORKER_ID (e.g. worker-droplet-sfo2) and
# WORKER_PUBLIC_URL=https://lo.<dashed-ip>.sslip.io

# append the Caddy vhosts (substitute IP + `caddy hash-password` bcrypt):
nano /etc/caddy/Caddyfile   # paste from deploy/caddy/linkedin-operator.caddy.example
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy

systemctl start lo-worker lo-endpoint lo-x11vnc lo-novnc
systemctl start lo-watchdog.timer
```

## Verify

```bash
for u in lo-worker lo-endpoint lo-x11vnc lo-novnc; do systemctl is-active $u; done   # active
systemctl is-active lo-watchdog.timer                                               # active
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://lo.<dashed-ip>.sslip.io/store-secret   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://vnc.<dashed-ip>.sslip.io/vnc.html              # 401 (needs creds)
tail -f /var/log/lo-watchdog.log    # "ok: heartbeat age Ns"
# heartbeat should be seconds-fresh in app.worker_heartbeats (id = your WORKER_ID)
```

## Login hand-off

The droplet has no screen, so a first LinkedIn login (new-IP checkpoint / 2FA)
is done through noVNC: open `https://vnc.<dashed-ip>.sslip.io/vnc.html`, auth as
`operator`, and either log into linkedin.com by hand in that Chrome (session
persists in the worker's `userDataDir`, no password stored) or enter it in the
web app's Settings and complete 2FA there. Stop the surface when idle:
`systemctl stop lo-novnc lo-x11vnc`.

## Notes

- **One worker per account.** Do not also run the Windows `START.bat` worker.
- Secrets (`apps/worker/.env`) are gitignored and copied up out of band.
- Headful Chrome under Xvfb is intentional (`channel: 'chrome'` for 2FA
  visibility); do not switch to `WORKER_HEADLESS=1` without testing login.
- The database runs on Supabase free NANO by user choice; the watchdog is
  deliberately inert during DB capacity spells (see `lo-watchdog.sh`).
