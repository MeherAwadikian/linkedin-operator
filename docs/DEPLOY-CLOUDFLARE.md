# Deploying the web app to Cloudflare

Only **`apps/web`** (the Next.js app) deploys to Cloudflare. The **worker** runs a
persistent logged-in Chrome and cannot run on Cloudflare (serverless, no browser)
— it stays on your machine. See the architecture note at the bottom.

The app is set up with the **OpenNext Cloudflare adapter** (`@opennextjs/cloudflare`)
and `wrangler.jsonc`. Deploy is `pnpm --filter @lo/web cf:deploy`.

## ⚠️ Build on Linux, not Windows

The Cloudflare build uses Next.js **standalone output**, which creates symlinks.
On Windows that fails with `EPERM: symlink` unless you enable **Developer Mode**
(Settings → Privacy & security → For developers → Developer Mode = On) or run the
shell as Administrator. Easiest is to let the build run on Linux:

- **Option A (recommended): Cloudflare Workers Builds (Git-connected).** Connect
  the GitHub repo in the Cloudflare dashboard; Cloudflare builds on its own Linux
  runners. Build command: `pnpm --filter @lo/web cf:build`. Deploy command:
  `pnpm --filter @lo/web exec opennextjs-cloudflare deploy`. Root dir: repo root.
- **Option B: GitHub Actions** — see `.github/workflows-pending/deploy-cloudflare.yml`
  (move it into `.github/workflows/` once the repo token has the `workflow` scope).
- **Option C: WSL / any Linux box** — `pnpm install && pnpm --filter @lo/web cf:deploy`.
- **Option D: Windows + Developer Mode** — then `pnpm --filter @lo/web cf:deploy`
  works locally.

## Environment variables

**Build-time (inlined into the client bundle — must be present when building):**

| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://unhmguolakeqjrpccacj.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your project's anon / publishable key |

**Runtime (set with wrangler; the web tier reads these server-side):**

```sh
# non-secret — can live in wrangler.jsonc "vars"
WORKER_INGEST_URL = https://<your-worker-tunnel-host>

# secret — never in the repo
pnpm --filter @lo/web exec wrangler secret put WORKER_INGEST_TOKEN
```

## Deploy

```sh
# Authenticate once
pnpm --filter @lo/web exec wrangler login

# On Linux (or Windows Developer Mode): build + deploy
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  pnpm --filter @lo/web cf:deploy
```

## Connecting the edge web app to your local worker

The web tier's "save secret" flow POSTs to the worker's ingest endpoint
(`WORKER_INGEST_URL`). From Cloudflare's edge, `localhost` is Cloudflare, not your
machine — so expose the local worker with a **cloudflared tunnel**:

```sh
# on your machine, with the worker running on :8787
cloudflared tunnel --url http://127.0.0.1:8787
# set WORKER_INGEST_URL to the printed https://<name>.trycloudflare.com host,
# and the same WORKER_INGEST_TOKEN on both sides.
```

## Architecture recap

```
Browser ── HTTPS ──▶ Cloudflare Worker (apps/web: UI, API, middleware)
                         │  SQL / Realtime
                         ▼
                     Supabase (the linkedin project)
                         ▲
                         │ service_role (SQL + queue + secrets)
   Your machine ── Worker (Playwright + Chrome, persistent) ── logs into LinkedIn
                         ▲
                         └── cloudflared tunnel ◀── web secret-ingest
```

The worker is intentionally local: it holds the live LinkedIn browser session,
which cannot exist on serverless edge infrastructure.
