# Database (Supabase)

The LinkedIn Operator database. All tables live in schema **`app`**; RLS is on
for every table. `secrets` and `browser_sessions` are reachable **only** by the
worker's `service_role` key — never by the browser client.

Target project: the **linkedin** org's project (`unhmguolakeqjrpccacj`, region
`ap-southeast-2`). That project is on a different Supabase login than the one
currently connected to the MCP, so apply the migrations one of these ways:

## Option A — Supabase SQL editor (no extra setup)

1. Open the project → **SQL Editor** → **New query**.
2. Paste the contents of [`apply_all.sql`](./apply_all.sql) and **Run**.
   (It is `0001` + `0002` + `0003` concatenated; safe to run once.)
3. Verify: **Table editor** → schema `app` should list ~24 tables.

## Option B — Reconnect the Supabase MCP to the `linkedin` account

If you re-auth the Supabase integration to the account that owns the `linkedin`
org, the migrations can be applied (and RLS verified via advisors, types
generated) automatically with no copy-paste.

## Migrations

| File | Purpose |
|---|---|
| `migrations/0001_init_app_schema.sql` | All `app` tables (plan §4) |
| `migrations/0002_rls.sql` | Enable RLS + owner / authenticated / service-role-only policies |
| `migrations/0003_seed_defaults.sql` | Default rules + persona + auto-seed trigger on signup |

## After applying — wire the app

Add to `.env` (gitignored; also set in the hosting dashboard):

```
NEXT_PUBLIC_SUPABASE_URL=https://unhmguolakeqjrpccacj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Project Settings → API → anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API → service_role>   # worker only, never shipped to the browser
```

The default rules seeded here match `packages/core` `defaultRules()`; they are
fully editable at runtime from the Settings UI (issue for the rules editor comes
later in Phase 2).
