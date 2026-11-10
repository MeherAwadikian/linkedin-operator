# Implementation Plan: LinkedIn Operator Web App

Turning the `linkedin-job-hunter` engine + Hermes `linkedin-hunter` profile into a self-hosted web application for operating the user's own LinkedIn account, with a Claude-driven command console, Supabase persistence, and a configurable human-in-the-loop safety model.

---

## 1. Executive Summary

Today the system is a Node 22 ESM CLI (`src/cli.js`) with job-board connectors, a rule-based 0-100 scorer, a SQLite application tracker with a `WAITING_APPROVAL` gate, a recruiter finder, persona/safety docs, and a Hermes agent profile that drives it. None of it touches LinkedIn directly; the LinkedIn folder holds a profile builder, outreach templates, and an OAuth stub.

The target is a web app with three parts: a **browser UI** (dashboard, settings, approval queue, command console), an **API layer**, and a **long-running automation worker** that owns a persistent, logged-in Playwright Chromium context and performs LinkedIn actions (search, scroll, collect, like, comment, post, message, connect). Supabase is the single database for all operational data. Claude (user's own API key) parses natural-language commands, drafts persona-constrained content, and scores/analyzes. Existing modules migrate nearly wholesale: the scorer, tracker semantics, connectors, dedupe, backoff/cache/logger tools, and the PERSONA.md/SAFETY.md documents become live, editable configuration.

### Fixed ethical guardrail (restated, non-negotiable, baked into architecture)

This system operates **only on the user's own LinkedIn account**, with a configurable human-in-the-loop approval gate on every write action. "Human persona" means two things and only two things: (1) natural, non-robotic writing tone, and (2) conservative pacing that respects the account. It does **not** mean masquerading as organic human activity to defeat LinkedIn's bot detection. The system contains:

- **No** randomized-to-deceive behavior, fake fingerprints, user-agent spoofing, stealth plugins, or CAPTCHA solving/bypass of any kind.
- A **hard-stop policy**: if LinkedIn presents a checkpoint, CAPTCHA, rate-limit, or restriction, the worker halts the queue, records the event, and surfaces it to the user. It never retries through, rotates identity, or escalates to evasion.
- Approval gates and rate limits are **user-configurable settings**, changeable anytime in the UI. The detection-evasion prohibition is **hard-coded**: it lives in the worker's action executor as an unconditional code path, not in the rules table, so no settings change can disable it.
- Credentials are the user's own, encrypted at rest, never committed, never logged.
- The user acknowledges that browser automation of LinkedIn sits outside LinkedIn's ToS even on one's own account; the system is built to be conservative and transparent, not invisible (see §13).

---

## 2. Recommended Architecture

The critical split: **serverless/stateless things** (UI, API, DB) versus **the one thing that must never be serverless**, the authenticated Chromium session. A Playwright context that is logged in, scrolling a feed, and holding cookies cannot live in a Vercel function; it needs a process that runs for days. So the worker is a plain long-running Node service, and everything else talks to it through a job queue in Postgres.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ USER'S BROWSER                                                           │
│  Next.js UI: dashboard · approval queue · command console · settings     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ HTTPS (Supabase Auth JWT)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ WEB TIER (stateless, can be serverless or same box)                      │
│  Next.js App Router: pages + API route handlers                          │
│   - validates rules server-side                                          │
│   - writes jobs/approvals to Supabase                                    │
│   - calls Claude for command parsing + draft generation                  │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ SQL / Realtime
┌───────────────▼──────────────────────────────────────────────────────────┐
│ SUPABASE (Postgres + Auth + Realtime + Storage)                          │
│  all operational tables (§4) · jobs queue table · action log             │
│  Realtime channels: job status, approval events, worker heartbeat        │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ poll jobs (FOR UPDATE SKIP LOCKED) + heartbeat + results
┌───────────────┴──────────────────────────────────────────────────────────┐
│ AUTOMATION WORKER (persistent Node 22 service, NOT serverless)           │
│  runs on: user's Windows machine (Phase 1) or small VPS (later)          │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ Action Executor: rules engine (server-side enforcement),       │    │
│   │ rate-limit counters, hard-coded stop-on-checkpoint policy      │    │
│   └───────────────┬────────────────────────────────────────────────┘    │
│   ┌───────────────▼────────────────────────────────────────────────┐    │
│   │ Playwright Chromium, persistent context (userDataDir +         │    │
│   │ storageState), headful by default, one LinkedIn session        │    │
│   └────────────────────────────────────────────────────────────────┘    │
│  also hosts: job-board connectors (no browser needed), scorer,           │
│  scheduled automations (daily report, feed sweep)                        │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ user's own API key
        ┌───────▼────────┐
        │ Claude API     │  (provider-agnostic adapter: Anthropic default,
        │ (Anthropic)    │   DeepSeek/OpenRouter optional)
        └────────────────┘
```

**Why the split is non-negotiable:** serverless functions cap execution at seconds-to-minutes, give you a fresh filesystem each invocation, and can run concurrently (two functions logging into one LinkedIn account simultaneously is exactly the signal that gets accounts restricted, and is also just broken). The worker owns exactly one browser context, processes the queue strictly serially for LinkedIn actions, and is the only component holding the decrypted LinkedIn credential in memory.

**Queue choice:** a plain `jobs` table in Supabase claimed with `SELECT ... FOR UPDATE SKIP LOCKED`, plus Supabase Realtime so the UI sees status changes live. No Redis, no extra infra. One worker, serial LinkedIn lane, so queue throughput is a non-issue; simplicity wins.

---

## 3. Technology Stack

**Recommended:**

| Layer                     | Choice                                                                                                                | Rationale                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front-end + API           | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui                                                           | One codebase for UI and API routes; shadcn gives fast, decent dashboard UI for a solo dev; deploys anywhere later                                  |
| DB / Auth / Realtime      | Supabase (user's new project)                                                                                         | Chosen by user; Auth protects the app itself, Realtime streams job status, RLS as defense-in-depth                                                 |
| Worker                    | Plain Node 22 ESM service + Playwright (`chromium.launchPersistentContext`)                                           | Matches existing codebase (Node 22 ESM, minimal deps); persistent context survives restarts via `userDataDir`                                      |
| Queue                     | Postgres table + `SKIP LOCKED` + Realtime                                                                             | Zero extra infrastructure; serial LinkedIn lane makes anything fancier pointless                                                                   |
| LLM                       | `@anthropic-ai/sdk`, default latest Claude, behind a small provider adapter                                           | User supplies key in settings; adapter keeps DeepSeek/OpenRouter as drop-ins since those keys exist                                                |
| Validation                | Zod shared between web and worker                                                                                     | One schema package validates rules, action inputs, and Claude's structured outputs                                                                 |
| Monorepo                  | pnpm workspaces: `apps/web`, `apps/worker`, `packages/core` (scorer, dedupe, connectors, persona), `packages/schemas` | Lets web and worker share the migrated `src/` modules without duplication; mirrors the Marketing Research Intelligence repo layout you already use |
| Hosting (Phase 1)         | Everything on the Windows dev machine: `next dev`/`next start` + worker as a manually started process                 | Zero cost, headful browser visible for 2FA hand-off; per your standing preference, no Task Scheduler registration unless you ask                   |
| Hosting (later, optional) | Web on Cloudflare Pages/VPS; worker in Docker on a small VPS with persistent volume + noVNC for headful access        | Only if 24/7 uptime is wanted; see §13 risks                                                                                                       |

**Alternative stack (if you want maximum reuse and minimum framework):** keep everything JavaScript-no-build: Fastify server serving a Vite + React SPA, same worker, same Supabase. Lighter than Next.js, but you lose App Router conveniences and server components; only worth it if Next.js feels heavy. Recommendation stands with Next.js.

---

## 4. Supabase Data Model

All tables in schema `app`. Supabase Auth secures the UI (single user initially, but model it properly). **RLS enabled on every table**; policies restrict to the authenticated owner `user_id`. The worker uses the `service_role` key (held only in the worker's local `.env`, never shipped to the browser).

### Classification rule

- **OPERATIONAL** tables: jobs, logs, configs, scores, statuses, URLs, public-profile metadata. Fine to store.
- **IDENTITY-SENSITIVE**: raw CV content, government IDs, salary documents, any uploaded identity artifact. These tables are marked below; most simply **must not exist**. The candidate profile stores only what the user already publishes (headline, skills, target roles), and the repo contains zero personal data: `user-profile.yaml` does **not** migrate into the repo; its contents move to the `candidate_profile` table, and the repo ships only a schema + example file.

### Tables

**Settings & safety (operational):**

| Table                 | Key columns                                                                                                                                                                                  | Notes                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `settings`            | `id`, `user_id`, `key text unique`, `value jsonb`, `updated_at`                                                                                                                              | App-wide knobs: model choice, headful/headless, timezone, worker pause flag               |
| `rules`               | `id`, `user_id`, `action_type`, `approval_level int (0/1/2)`, `enabled bool`, `daily_limit int`, `hourly_limit int`, `min_gap_seconds int`, `quiet_hours jsonb`, `version int`, `updated_at` | One row per action type; migrated from SAFETY.md defaults; editable live (§7)             |
| `rule_revisions`      | `id`, `rule_id fk`, `old jsonb`, `new jsonb`, `changed_at`                                                                                                                                   | Audit trail of every rule change                                                          |
| `personas`            | `id`, `user_id`, `name`, `tone_instructions text`, `banned_openers text[]`, `style_rules jsonb`, `active bool`                                                                               | PERSONA.md migrated to rows; UI-editable                                                  |
| `rate_limit_counters` | `id`, `user_id`, `action_type`, `window_start timestamptz`, `window_kind (hour/day)`, `count int`                                                                                            | Incremented atomically by the worker inside the same transaction that marks a job running |

**Account & secrets (operational, encrypted payloads):**

| Table              | Key columns                                                                                                                                                     | Notes                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`         | `id`, `user_id`, `platform ('linkedin')`, `login_email text`, `status (active/checkpoint/locked/logged_out)`, `last_login_at`, `checkpoint_reason text`         | Status is how the hard-stop surfaces in the UI                                                                                                                               |
| `secrets`          | `id`, `user_id`, `kind (linkedin_password/anthropic_key/openrouter_key/...)`, `ciphertext bytea`, `iv bytea`, `auth_tag bytea`, `key_version int`, `created_at` | AES-256-GCM ciphertext only; master key never in DB (§5). **Never** `SELECT`able by the browser client: RLS denies all client reads; only the worker's service role reads it |
| `browser_sessions` | `id`, `account_id fk`, `storage_state_ciphertext bytea`, `iv`, `auth_tag`, `updated_at`                                                                         | Encrypted Playwright `storageState` backup so a reinstalled worker can restore the session; primary copy is the worker's local `userDataDir`                                 |

**Work data (operational):**

| Table                        | Key columns                                                                                                                                                                                                                             | Notes                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `jobs_queue`                 | `id`, `user_id`, `type`, `payload jsonb`, `status (queued/awaiting_approval/approved/running/done/failed/blocked/cancelled)`, `priority`, `run_after timestamptz`, `attempts`, `result jsonb`, `error text`, `created_at`, `claimed_at` | The queue. `blocked` = hard-stop fired                                                                                              |
| `approvals`                  | `id`, `job_id fk`, `requested_at`, `decided_at`, `decision (approved/rejected/edited)`, `edited_payload jsonb`, `decided_by`                                                                                                            | Approval events; `edited` lets the user rewrite a draft then approve                                                                |
| `actions_log`                | `id`, `user_id`, `account_id`, `action_type`, `target_url`, `summary text`, `job_id fk`, `outcome`, `at timestamptz`                                                                                                                    | Append-only record of everything performed on LinkedIn; never contains credentials or message secrets beyond what was actually sent |
| `postings`                   | `id`, `source`, `external_id`, `title`, `company`, `url`, `location`, `salary_text`, `raw jsonb`, `first_seen`, `dedupe_hash unique`                                                                                                    | Migrated from SQLite `db.js`; `dedupe.js` logic becomes the `dedupe_hash`                                                           |
| `scores`                     | `id`, `posting_id fk`, `score int`, `breakdown jsonb`, `scorer_version`                                                                                                                                                                 | Explainable output of `score.js` preserved verbatim                                                                                 |
| `applications`               | `id`, `posting_id fk`, `status (FOUND/SCORED/WAITING_APPROVAL/APPLIED/REJECTED/INTERVIEW/OFFER/CLOSED)`, `notes`, `applied_at`, `history jsonb`                                                                                         | `tracker.js` CRUD semantics carried over including `WAITING_APPROVAL`                                                               |
| `recruiters`                 | `id`, `name`, `company`, `profile_url`, `source ('public_lookup')`, `found_at`                                                                                                                                                          | `finder.js` output; public info only, by existing design                                                                            |
| `people`                     | `id`, `profile_url unique`, `display_name`, `headline`, `company`, `collected_at`, `raw jsonb`                                                                                                                                          | Data gathered from feed/search; public profile metadata only                                                                        |
| `conversations` / `messages` | conversation: `id`, `person_id fk`, `thread_url`; message: `id`, `conversation_id fk`, `direction (in/out)`, `body`, `sent_at`, `job_id fk`                                                                                             | Mirror of DMs the system reads/sends, for context when drafting replies                                                             |
| `drafts`                     | `id`, `kind (message/comment/post/connect_note)`, `target jsonb`, `body`, `persona_id fk`, `hemingway_report jsonb`, `spam_report jsonb`, `status (draft/queued/approved/sent/rejected)`, `created_by ('claude'/'user')`                | Every piece of generated text lives here before any send                                                                            |
| `automations`                | `id`, `name`, `trigger (manual/schedule)`, `cron text`, `pipeline jsonb`, `enabled bool`, `last_run_at`                                                                                                                                 | Saved routines (daily feed sweep, daily report); created disabled by default per your manual-trigger preference                     |
| `connectors`                 | `id`, `name`, `kind (job_board/ats)`, `config jsonb`, `enabled bool`, `last_run jsonb`                                                                                                                                                  | Registry of the 2 current + optional 12 `job-hunter` connectors                                                                     |
| `repos` / `apps`             | `id`, `name`, `url`, `kind`, `notes`, `metadata jsonb`                                                                                                                                                                                  | The user's requested registry of repos and deployed apps tied to this operation                                                     |
| `command_sessions`           | `id`, `prompt text`, `plan jsonb`, `status`, `created_at`                                                                                                                                                                               | Console history: what the user asked, what plan Claude produced (§9)                                                                |

**Identity-sensitive (constrained):**

| Table                                    | Policy                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate_profile`                      | `id`, `user_id`, `profile jsonb` holding the content of `user-profile.yaml` (skills, target titles, locations, preferences). Lives **only** in DB. The repo gets `user-profile.example.yaml` + a Zod schema; real values are seeded into this table once and the local YAML never enters git (`.gitignore` + the file stays outside the repo tree). |
| CV files, government ID, raw resume text | **No table. Not stored. Not uploaded. Not auto-handled.** If an application flow requires a resume upload, the job hard-stops at `awaiting_approval` with a note that the user must attach/submit the document manually. This is enforced in the action executor, same tier as the anti-evasion rule.                                               |

---

## 5. Credential & Secrets Handling

**Threat model:** keep the LinkedIn password and Claude key out of git, out of logs, out of the browser client, and out of plaintext at rest, while letting exactly one process (the worker) use them.

**Envelope encryption:**

1. A 32-byte master key (`VAULT_MASTER_KEY`) is generated once and lives **only** in the worker's local `.env` (gitignored) and, as backup, wherever the user keeps secrets. It is never in Supabase, never in the repo, never sent to the web tier.
2. When the user enters the LinkedIn password or an API key in Settings, the browser POSTs it over HTTPS to a web-tier endpoint which **forwards it as a one-shot `store_secret` job** to the worker (payload passed via a short-lived encrypted channel: the web tier encrypts to the worker's registered public key, X25519 + AES-GCM, so even the queue row never holds plaintext). The worker encrypts with AES-256-GCM under the master key and writes ciphertext + IV + auth tag to `secrets`.
3. Decryption happens only inside the worker, only at use time, into a variable scoped to the login/API call. A logging wrapper (migrate `src/tools/logger.js`, add a redaction pass) refuses to serialize any object field named like `password|token|key|secret|authorization` and scrubs known ciphertext/plaintext values from error strings. Playwright tracing/video is disabled on the login page specifically so the password never lands in a trace artifact.
4. `key_version` on `secrets` supports master-key rotation: a worker CLI command re-encrypts all rows under a new key.

**Login flow:**

1. First run: worker launches **headful** Chromium with a dedicated `userDataDir` (e.g. `%LOCALAPPDATA%\linkedin-operator\browser-profile`), navigates to the LinkedIn login page, fills email + decrypted password via normal Playwright `fill`, submits. No fingerprint manipulation, default Playwright Chromium, standard automation flags left as-is.
2. On success: save `storageState`, encrypt, upsert into `browser_sessions`; set `accounts.status = active`.
3. Subsequent starts: reuse `userDataDir` (usually still logged in); if logged out, re-login automatically with the stored credential; if that fails, go to the 2FA/checkpoint path.

**2FA / checkpoint hand-off (human-in-the-loop by design):**

- When the worker detects a verification page, CAPTCHA, or any checkpoint URL pattern, it: sets `accounts.status = checkpoint` with the reason, marks the current job and queue lane `blocked`, emits a Realtime event, and **waits**. The UI banner says "LinkedIn needs you" with instructions.
- The user completes the challenge **themselves** in the worker's headful window (on the local machine: just click into the visible browser; on a future VPS: via noVNC). The worker polls for the feed page to confirm resolution, re-saves `storageState`, flips status back to `active`, and resumes only jobs the user explicitly un-pauses.
- The worker never attempts to solve, bypass, or automate any challenge. This branch is code, not config.

---

## 6. The LinkedIn Action Layer

Every capability is a discrete, named action with a Zod input schema, a default approval level, a default rate limit, and a persona/safety pipeline. Defaults below seed the `rules` table and are **config-driven**: the user can change approval levels and limits anytime (§7). Approval levels follow the existing SAFETY.md scheme: **L0** = auto-execute and log; **L1** = execute after a one-time standing rule authorizes it, still logged, batch-reviewable; **L2** = each instance requires explicit per-item approval in the queue.

| Action                              | Inputs                                 | Default level | Default rate limit    | Persona/safety checks                                                                                            |
| ----------------------------------- | -------------------------------------- | ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `search` (jobs/people/posts)        | query, filters, max_results            | L0            | 10/hour, 40/day       | Read-only; results stored to `postings`/`people`                                                                 |
| `collect_feed` (scroll + gather)    | max_items, stop_conditions             | L0            | 3 sweeps/day          | Read-only; natural scroll pacing (fixed polite delays, not randomized-to-deceive); hard-stop on any interstitial |
| `gather_profile` / `gather_company` | profile_url                            | L0            | 25/day combined       | Read-only, public info; respects existing `finder.js` public-only principle                                      |
| `like`                              | post_url                               | L1            | 15/day, min 2 min gap | Target must come from a collected item (no blind URLs); logged                                                   |
| `comment`                           | post_url, draft_id                     | **L2**        | 5/day, min 10 min gap | Draft must pass persona pipeline (§8); posted text must equal approved draft byte-for-byte                       |
| `post`                              | draft_id, media?                       | **L2**        | 1/day                 | Full persona pipeline; preview rendered in UI before approval                                                    |
| `message` (DM/InMail reply or new)  | conversation_id or person_id, draft_id | **L2**        | 10/day, min 5 min gap | Persona pipeline + conversation context; never messages someone not in `people`/`conversations`                  |
| `connect`                           | person_id, note_draft_id?              | **L2**        | 8/day, 80/week        | Note (if any) through persona pipeline; weekly cap mirrors LinkedIn's own guidance conservatively                |
| `apply_easy_apply`                  | posting_id                             | **L2**        | 5/day                 | Hard-stops at any resume-upload or identity-document step for manual completion (§4)                             |

Cross-cutting executor rules (hard-coded, not in `rules`):

- **Serial lane:** one LinkedIn action at a time, period.
- **Quiet hours respected** (configurable window, default 23:00-07:00 Beirut).
- **Stop-on-anomaly:** any unexpected modal, warning banner, "unusual activity" notice, or HTTP-level throttle sets account status to `checkpoint` and blocks the lane. No retry-through, ever.
- **Counter check inside the claim transaction:** the worker increments `rate_limit_counters` atomically when claiming a job; if over limit, the job reschedules to `run_after` the window reset instead of executing.

`★ Insight ─────────────────────────────────────`
Putting the rate-limit increment inside the same DB transaction that claims the job is what makes limits _enforced_ rather than _advisory_: even if the UI, the console, and an automation all enqueue sends simultaneously, the serial claim transaction is the single choke point, so a limit can never be exceeded by a race.
`─────────────────────────────────────────────────`

---

## 7. Approval Gate + Rules Engine

- **Storage:** one `rules` row per action type (§4). The Zod schema for a rule is shared by web and worker from `packages/schemas`, so the UI literally cannot save a malformed rule and the worker revalidates anyway.
- **Enforcement is server-side only.** The UI reads rules for display; the **worker** is the sole enforcer. On every job claim it re-reads the current rule row (no caching beyond the claim transaction), so edits apply to the very next action. The two hard-coded policies (no evasion, no identity-document handling) are checked before the rules table is even consulted.
- **Editing live:** Settings → Safety Rules shows a grid: action type, enabled toggle, approval level dropdown (0/1/2), daily/hourly limits, min gap, quiet hours. Saving writes `rules` + a `rule_revisions` audit row and bumps `version`; Realtime pushes the change so open dashboards update.
- **Runtime change example:** the user decides likes should need approval during a sensitive week. They open Settings, change `like` from L1 to L2, save. The next queued `like` job, claimed seconds later, sees `approval_level = 2`, transitions to `awaiting_approval` instead of running, and appears in the Approval Queue. Reverting to L1 later releases new jobs back to auto-run (already-parked jobs stay parked until decided, to avoid surprise sends).
- **Approval queue UI:** each pending item shows the action, target (with link), the full draft text, persona/hemingway/spam reports, and three buttons: Approve, Edit-then-approve (opens the draft editor, re-runs quality checks on save), Reject. Decisions write to `approvals` and flip the job status.

---

## 8. The Persona Engine

Goal: everything the system writes reads like the user wrote it. This is a **writing-quality system, not a disguise**: it shapes tone and pacing, and it does nothing to hide that a tool is in use.

Pipeline for every draft (message, comment, post, connect note):

1. **Context assembly:** target person/post content, conversation history from `messages`, candidate profile highlights, the active `personas` row (tone instructions, banned openers, style rules migrated from PERSONA.md, including the existing no-em-dash and no-robotic-opener rules).
2. **Generation:** Claude call with a system prompt built from the persona row + hard rules ("plain conversational register, no marketing-speak, no 'I hope this message finds you well', match the length norms of the medium, one clear point per message").
3. **Hemingway pass:** port the `/hemingway` skill's checks (grade level, adverb density, passive voice) as a library function in `packages/core`; store the report on the draft. Fails over threshold → one automatic revision round with the report fed back, then flag for the human.
4. **Spam-checker pass:** same treatment for the `/spam-checker` word/phrase lists; flags shown in the approval UI.
5. **Persona lint:** deterministic checks: banned openers, banned phrases, em-dash ban, length caps per medium, no fabricated claims about the user (the model may only reference facts present in `candidate_profile`).
6. **Human gate:** L2 actions always end at the approval queue with the draft and all three reports visible; the human is the final author.

What the persona engine explicitly does **not** do: no typing-cadence simulation, no deliberate typos, no "humanizer" rewriting aimed at classifier evasion, no claim that a human wrote it when asked. Pacing (gaps between sends, daily caps) comes from the rate-limit system and exists to keep usage reasonable, with values chosen conservatively and visible in settings, not tuned against detection.

---

## 9. Claude Command Console

A chat-style panel: the user types "find 10 UAE medtech recruiters and draft intro notes" and the system turns it into inspectable, approvable work.

Flow:

1. **Parse:** the web tier sends the instruction + a catalog of available actions (names, input schemas, current rule levels) to Claude with structured output: a **plan** = ordered list of `{action, inputs, rationale}` steps. Zod-validated; unknown actions rejected.
2. **Preview (dry-run by default):** the plan renders as cards: "Step 1: search people, query X, L0, will auto-run. Step 2: gather 10 profiles, L0. Step 3: draft 10 connect notes, L2, will wait for your approval." Nothing is enqueued yet. A `command_sessions` row stores prompt + plan.
3. **Confirm:** user clicks "Run plan" (or edits/removes steps first). Steps enqueue as jobs with dependencies; L2 steps flow into the approval queue as they're reached.
4. **Narrate:** Realtime streams job status back into the console thread ("collected 10 profiles", "3 drafts awaiting your approval"), so the console doubles as an activity feed.
5. **Dry-run mode toggle:** a global setting forces _all_ write actions to stop at `awaiting_approval` regardless of rules, used during development and testing (§12).

The parse step cannot invent capabilities: Claude selects only from the registered action catalog, and the worker revalidates every input against the Zod schema at execution time, so a hallucinated parameter fails closed.

---

## 10. Migration Plan (existing `src/` → new monorepo)

| Existing                                                                 | Destination                                                                                                                                                                                                                   | Change                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/cli.js`                                                             | Retired as entry point; command names become seeds for the console's action catalog                                                                                                                                           | A thin `apps/worker/cli.js` survives for ops (re-encrypt secrets, force logout, run connector once)            |
| `src/config/user-profile.yaml` + `candidate-profile.js`                  | Loader/validator → `packages/core/profile.js` with Zod; data → `candidate_profile` table via one-time seed script                                                                                                             | Repo keeps only `user-profile.example.yaml`; real file never committed                                         |
| `src/search/` (remoteok, arbeitnow, fan-out with per-source isolation)   | `packages/core/connectors/` unchanged in logic; worker schedules them; results write to `postings` instead of SQLite                                                                                                          | Fan-out isolation pattern kept; `connectors` table controls enablement                                         |
| `src/scoring/score.js`                                                   | `packages/core/scoring/` verbatim; breakdown JSON → `scores.breakdown`                                                                                                                                                        | Optionally add the `job-hunter` DeepSeek semantic scorer behind the provider adapter as a second scorer column |
| `src/recruiters/finder.js`                                               | `packages/core/recruiters/`; output → `recruiters` table                                                                                                                                                                      | Public-info-only principle preserved and documented                                                            |
| `src/linkedin/profile-builder.js`, `outreach-templates.js`               | Templates become seed rows for `personas`/draft prompts; profile-builder informs the persona context                                                                                                                          | `oauth-stub.js` kept only if the official-API option in §13 is pursued                                         |
| `src/applications/db.js` (SQLite schema)                                 | Translated to Supabase migration SQL (`postings`, `applications`, `scores`)                                                                                                                                                   | `node:sqlite` dependency dropped                                                                               |
| `src/applications/tracker.js` + `dedupe.js`                              | `packages/core/applications/`; same CRUD + status machine incl. `WAITING_APPROVAL`; dedupe → `dedupe_hash` generator                                                                                                          | Status enum extended (INTERVIEW/OFFER already per existing schema; align)                                      |
| `src/reports/daily.js`                                                   | Worker automation `daily_report` writing to a `reports` view in the dashboard (email optional later)                                                                                                                          | Created disabled; manual trigger first                                                                         |
| `src/tools/` (logger, cache, backoff)                                    | `packages/core/tools/`; logger gains the redaction layer (§5); backoff used by connectors only, **never** to retry through LinkedIn blocks                                                                                    |                                                                                                                |
| `docs/SAFETY.md`                                                         | Seeds `rules` defaults; doc itself stays in repo as the human-readable policy incl. the fixed guardrail                                                                                                                       |                                                                                                                |
| `docs/PERSONA.md`                                                        | Seeds the default `personas` row                                                                                                                                                                                              |                                                                                                                |
| `docs/COMMANDS.md`, `ARCHITECTURE.md`, `CONNECTORS.md`                   | Rewritten for the new app                                                                                                                                                                                                     |                                                                                                                |
| Hermes profile `linkedin-hunter` (SOUL.md, skills, projects.db/state.db) | SOUL.md persona content merges into the `personas` seed; hemingway + spam-checker skills become `packages/core` library ports (§8); projects/state DBs are historical, one-time import of anything useful into `applications` | Hermes profile remains usable side-by-side; the web app does not depend on Hermes                              |
| `job-hunter` engine (12 connectors + DeepSeek scoring)                   | Optional: connectors copied into `packages/core/connectors/` behind `connectors.enabled = false` defaults                                                                                                                     | Phase 6, only if wanted                                                                                        |

---

## 11. Phased Roadmap

Per your workflow standard: issue-first, branches `<type>/<issue#>-<slug>`, squash-merge to protected `main`, `dev` branch with its own Supabase branch for DB isolation. New private repo, e.g. `MeherAwadikian/linkedin-operator`.

### Phase 0: Foundation (repo, DB, skeleton)

- **#1** `chore/1-monorepo-scaffold`: pnpm workspaces, `apps/web` (Next.js + shadcn), `apps/worker`, `packages/core`, `packages/schemas`; CI lint+test. _AC: `pnpm build` green; empty worker boots and heartbeats._
- **#2** `feat/2-supabase-schema`: all §4 migrations + RLS policies + seed script for rules/persona defaults. _AC: migrations apply to fresh project; RLS verified (anon client cannot read `secrets`)._
- **#3** `feat/3-auth-shell`: Supabase Auth login, protected app shell, nav. _AC: unauthenticated users see only login._
- **#4** `feat/4-job-queue`: queue claim/complete with `SKIP LOCKED`, Realtime status, worker heartbeat row. _AC: enqueue no-op job from UI, watch it run live._
- **#5** `feat/5-secrets-vault`: master key, encrypt/store/decrypt path, settings form for LinkedIn creds + Claude key, log redaction. _AC: round-trip test; grep of logs/DB dumps shows no plaintext; `secrets` unreadable from browser client._

### Phase 1: Thin vertical slice (login + read-only + dashboard) — no write actions at all

- **#6** `feat/6-playwright-login`: persistent context, login flow, storageState backup, status surface. _AC: fresh machine reaches `active` using only vaulted creds._
- **#7** `feat/7-checkpoint-handoff`: checkpoint detection, hard-stop, UI banner, headful hand-off, resume. _AC: simulated checkpoint blocks lane and recovers only after manual completion; zero automated challenge interaction in code review._
- **#8** `feat/8-readonly-actions`: `search`, `collect_feed`, `gather_profile` with pacing + quiet hours; results into `postings`/`people`. _AC: a feed sweep stores items; rate counters increment; over-limit job defers._
- **#9** `feat/9-core-migration`: port scorer, dedupe, tracker, connectors (remoteok/arbeitnow), profile seed. _AC: existing scorer unit tests pass against `packages/core`; connector run populates + scores postings._
- **#10** `feat/10-dashboard`: account status, recent actions log, postings with scores, people collected, worker health. _AC: dashboard reflects a live sweep end-to-end._

### Phase 2: Drafting + approval queue (still nothing sent)

- **#11** `feat/11-persona-engine`: persona CRUD UI, Claude draft generation, hemingway + spam-checker ports, persona lint. _AC: generated drafts carry all three reports; banned-opener test corpus fully caught._
- **#12** `feat/12-approval-queue`: queue UI, approve/edit/reject, `approvals` audit. _AC: L2 job parks, edited draft re-checked, decision audited._
- **#13** `feat/13-rules-ui`: live rules editor + revisions + Realtime propagation. _AC: the §7 runtime-change scenario passes as an integration test._
- **#14** `feat/14-dry-run-mode`: global dry-run flag; sandbox executor that renders "would send" previews. _AC: with dry-run on, no Playwright write-path code is reachable (asserted by test)._

### Phase 3: Write actions, gated

- **#15** `feat/15-like-action` (L1 default). _AC: approved standing rule executes within limits; action logged with target._
- **#16** `feat/16-comment-action` (L2). _AC: posted text byte-equal to approved draft; verified by post-action readback._
- **#17** `feat/17-message-action` (L2) incl. conversation mirroring. _AC: reply uses thread context; appears in `messages`._
- **#18** `feat/18-connect-action` (L2) with weekly cap. _AC: cap enforced across restarts._
- **#19** `feat/19-post-action` (L2) with preview. _AC: preview matches published post._

### Phase 4: Command console + automations

- **#20** `feat/20-command-console`: parse → plan → preview → confirm → narrate (§9). _AC: the recruiter-notes example produces a valid multi-step plan; invalid action names fail closed._
- **#21** `feat/21-automations`: saved pipelines, manual trigger buttons, optional cron (disabled by default). _AC: daily-report automation runs on manual trigger and renders a report page._
- **#22** `feat/22-easy-apply` (L2): with the identity-document hard-stop. _AC: a posting requiring resume upload parks with the manual-completion notice._

### Phase 5: Hardening & ship

- **#23** `test/23-e2e-suite`: Playwright-against-mock-LinkedIn e2e (§12).
- **#24** `chore/24-worker-packaging`: worker as installable service with docs for local-machine and VPS options (no auto-registration).
- **#25** `docs/25-policy-docs`: SAFETY.md v2 (fixed guardrail text), runbook for checkpoints, ToS acknowledgement doc.

### Phase 6 (optional): breadth

- **#26+**: import the 12 `job-hunter` connectors; DeepSeek secondary scoring; provider adapter settings UI; Hermes bridge if still wanted.

---

## 12. Testing Strategy

- **Unit (Vitest):** scorer (migrate existing expectations), dedupe hashes, rule evaluation (level/limit/quiet-hours matrix), crypto round-trip + log-redaction, persona lint, hemingway/spam scoring, plan-schema validation with adversarial Claude outputs (unknown actions, injected params).
- **Integration:** queue claim semantics under concurrent claimers (limits never exceeded); rules edit propagation; approval state machine including edit-then-approve; checkpoint hard-stop and resume.
- **Mock-LinkedIn e2e:** a small local fixture app serving static HTML snapshots of login, feed, profile, message, and checkpoint pages. The worker's selectors run against it headlessly in CI. This is the **only** target automated tests ever drive; CI never touches linkedin.com.
- **Dry-run mode as permanent safety net:** the same flag from #14 used in all manual testing; write-path code is structurally unreachable while it's on, asserted by a test that stubs the executor.
- **Manual acceptance per write action:** each Phase 3 issue's AC includes one real, user-supervised execution on the user's account at minimum rates, with readback verification.
- **No-secrets-in-artifacts check:** CI greps build output, test logs, and the repo for credential patterns; pre-commit hook blocks `user-profile.yaml` and `.env`.

---

## 13. Risks & Open Decisions (user input needed)

1. **LinkedIn ToS (must acknowledge explicitly).** Automated interaction with linkedin.com violates LinkedIn's User Agreement even on your own account and even without evasion; the realistic outcomes are warnings, temporary restrictions, or account loss. This design minimizes risk (conservative caps, human approval, instant hard-stop) and maximizes transparency, but cannot eliminate it. **Decision: proceed with acceptance, and/or prefer option 2 where possible.**
2. **Official API where possible.** LinkedIn's official APIs (Share/Posts via the Community Management or Marketing APIs) can legitimately cover _posting_; messaging/feed/search are not available to individual developers. The `oauth-stub.js` is a starting point. **Decision: pursue official-API posting (compliant) and reserve browser automation for what the API cannot do, or keep one consistent browser path for everything?** Recommended: hybrid, official API for posts.
3. **Worker hosting.** Local Windows machine (free, easy headful 2FA, offline when the PC sleeps) vs small VPS + Docker + noVNC (24/7, ~$5-10/mo, clunkier checkpoint hand-off; also note a new-IP login itself tends to trigger a checkpoint). **Recommended: local for Phases 0-4, decide on VPS after real usage.**
4. **2FA method on the LinkedIn account.** Authenticator-app TOTP makes hand-offs quick; SMS works but is slower. Keeping 2FA **on** is recommended; the hand-off flow assumes it.
5. **Supabase single project vs branch-per-env.** The workflow standard wants `main`/`dev` DB isolation; Supabase branching costs money on some tiers. **Decision: paid branching vs a second free project as dev.** Recommended: second free project (watch your Cloudflare-style project-limit experience; Supabase free tier allows 2 active projects).
6. **Which LLM default.** Anthropic key is the design default; confirm whether DeepSeek/OpenRouter should be wired in Phase 2 (drafting cost) or deferred to Phase 6.
7. **Easy Apply scope.** Even gated at L2 with the document hard-stop, auto-filling applications is the highest-risk, lowest-leverage action (your memory notes most ATSes block automation anyway). **Decision: keep #22 or cut it and leave applications manual with the tracker.**
8. **Multi-account.** The schema supports it (`accounts`), but the serial worker is designed for one account. Confirm single-account is the product.

---

`★ Insight ─────────────────────────────────────`
Two architectural choices do most of the safety work here: (1) the worker is the only component that can touch LinkedIn or decrypt secrets, so every policy (rules, limits, hard-stops) has exactly one enforcement point that the UI and the LLM cannot route around; and (2) the fixed prohibitions live in code while the tunable limits live in data, which is what makes "user-configurable safety settings" and "non-negotiable ethics" coexist cleanly.
`─────────────────────────────────────────────────`

The plan is buildable as written: Phases 0-1 produce a useful read-only intelligence dashboard in roughly 10 issues before any send capability exists, and every later capability arrives individually gated. The open decisions in §13 (especially worker hosting, ToS acknowledgement, and the official-API hybrid for posting) are the only things blocking issue #1.
