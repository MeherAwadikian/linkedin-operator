# LinkedIn Operator — setup

The **web app is already hosted** and **opens with no login**. You run a small
**worker** on your machine (it drives your real Chrome to operate your LinkedIn
account — it can't run in the cloud). `START.bat` does all of this for you.

```
You → hosted web app (Cloudflare) ◀─ Supabase (DB) ─▶ worker (this folder, your PC) → Chrome → LinkedIn
```

## Quick start (recommended)
1. Install **Google Chrome** if you don't have it.
2. **Double-click `START.bat`.** It will, automatically:
   - install Node, pnpm and cloudflared if missing (via Windows `winget`),
   - install the project dependencies,
   - start the worker and a secure tunnel,
   - publish the tunnel address to the app (no Cloudflare editing needed),
   - open the app in your browser.
3. **Double-click `STOP.bat`** to stop the worker + tunnel. Run `START.bat` again
   any time.

> ⚠️ Keep this folder private — it contains shared access keys (`apps/worker/.env`).

## In the app
- No sign-in. **Settings** → enter LinkedIn email + password and your Anthropic
  (Claude) API key (optionally Gmail). **Campaigns** → pick a network + search +
  message → "Create & collect", then approve each outreach in the **Approval
  Queue**. The first LinkedIn action opens a visible Chrome window for any 2FA.

## If `winget` isn't available (older Windows)
Install these once, then re-run `START.bat`:
- Node.js 22+ — https://nodejs.org
- pnpm — `npm install -g pnpm`
- cloudflared — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## Manual run (optional)
```powershell
pnpm install
cd apps/worker ; node --env-file=.env --import tsx src/index.ts   # terminal 1
cloudflared tunnel --url http://127.0.0.1:8787                     # terminal 2
```

## Notes
- Outreach is LinkedIn-only and **human-approved**: campaigns queue personalized
  connection requests; nothing sends until you approve, and sends are rate-limited.
  No emails are collected or sent.
- Run **one worker per LinkedIn account**.
- Logs are in `logs/`.
