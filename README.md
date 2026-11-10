# linkedin-operator

A web app to operate the owner's **own** LinkedIn account: a Claude-driven command
console, Supabase persistence, and a persistent-worker browser-automation layer, all
behind a configurable human-in-the-loop safety model.

> This is the web-app successor to the `linkedin-job-hunter` CLI engine. The full
> design lives in [`docs/IMPLEMENTATION_PLAN_WEBAPP.md`](docs/IMPLEMENTATION_PLAN_WEBAPP.md).

## What it is

Three parts (see plan §2):

- **`apps/web`** — Next.js UI + API: dashboard, approval queue, command console, settings.
- **`apps/worker`** — a long-running Node service that owns the one persistent, logged-in
  Playwright Chromium context and performs LinkedIn actions. **Not serverless.**
- **Supabase** — the single database for all operational data + the job queue.
- **`packages/core`** — shared logic (scorer, dedupe, connectors, persona engine).
- **`packages/schemas`** — Zod schemas shared by web and worker.

## Fixed ethical guardrail (non-negotiable, enforced in code)

This system operates **only on the owner's own account**, with a configurable
human-in-the-loop approval gate on every write action. "Human persona" means **natural
writing tone + conservative account-safety pacing only** — never masquerading as organic
human activity to defeat LinkedIn's bot detection.

- No fake fingerprints, no stealth plugins, no CAPTCHA solving/bypass.
- **Hard-stop on any checkpoint/CAPTCHA/restriction**: the worker halts, records it, and
  surfaces it to the user. It never retries through or escalates to evasion.
- Approval gates and rate limits are **user-configurable settings**. The detection-evasion
  prohibition and the identity-document hard-stop are **hard-coded**, not settings.
- Credentials are the owner's own, encrypted at rest, never committed, never logged.

Automated interaction with LinkedIn sits outside LinkedIn's User Agreement even on your
own account; this design minimizes and surfaces risk rather than hiding it. See plan §13.

## Status

Phase 0 (foundation) in progress. Issue-first per `CODING_WORKFLOW_STANDARD.md`:
`main` (protected) ← `dev` ← `<type>/<issue#>-<slug>`, squash-merge.
