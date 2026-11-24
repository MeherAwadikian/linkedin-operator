# QA guide (apps/web)

One command runs the whole gate from the repo root:

```bash
pnpm qa
```

It runs, in order:

1. `pnpm typecheck` - every workspace.
2. `pnpm test` - every unit test (Vitest).
3. Playwright e2e - boots `next dev` on port 3105 and drives every panel control in Chromium.

At the end it prints a per-control summary, one `PASS` / `FAIL` / `SKIP` line per control, and
exits non-zero if anything failed.

## Running just the e2e suite

```bash
pnpm --filter @lo/web test:e2e           # headless
pnpm --filter @lo/web exec playwright test --ui    # interactive runner
pnpm --filter @lo/web exec playwright test e2e/02-nav.spec.ts   # one file
```

The suite drives your installed Google Chrome (`channel: 'chrome'`, same as the worker), so no
browser download is needed. On a machine without Chrome (e.g. CI), set `E2E_BROWSER_CHANNEL=""`
to use Playwright's bundled Chromium; `pnpm qa` then runs
`playwright install chromium` automatically.

## Environment

The dev server needs Supabase and the no-login operator credentials. The config assembles env
from, in increasing priority:

1. `.env.operator-login` (repo root): `OPERATOR_EMAIL`, `OPERATOR_PASSWORD`.
2. `apps/worker/.env`: `NEXT_PUBLIC_SUPABASE_URL` (and `SUPABASE_SERVICE_ROLE_KEY`, used only to
   clean up `[E2E]` rows after the run).
3. `apps/web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Real process env (wins over everything).

If `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPERATOR_EMAIL`, or
`OPERATOR_PASSWORD` cannot be found, `pnpm qa` marks the e2e stage SKIP with the missing names
(typecheck and unit tests still gate). In CI without a database, that skip is the intended
"assert at the server-action boundary" fallback: the suite is not mocked, it is simply not run
against nothing.

## What the suite covers

| File | Controls |
| --- | --- |
| `e2e/01-dashboard.spec.ts` | Hero/marketing copy, worker status, 5 stat cards + navigation, pit lane, START button |
| `e2e/02-nav.spec.ts` | All 7 panel nav links route correctly; skip link is keyboard-first |
| `e2e/03-forms.spec.ts` | All 5 campaign forms submit through their real server action and a draft row appears; redline limit warning |
| `e2e/04-settings.spec.ts` | Settings sections render, API key inputs armed, URL save round-trips |
| `e2e/05-classic.spec.ts` | Every classic route still renders without an error boundary |

## Side effects and safety

- Tests run against the real database named in your env. Form tests create rows whose text starts
  with `[E2E]`; a global teardown deletes them (needs `SUPABASE_SERVICE_ROLE_KEY` from
  `apps/worker/.env`).
- The START test only clicks when **zero** campaigns are staged (so it can never launch your real
  drafts); in that case the click queues a single `linkedin.login` job, which a live worker treats
  as a session refresh. Set `E2E_SKIP_START=1` to skip the click entirely.
- API key forms are never submitted (a dummy value would overwrite the real vaulted key).

## Related agents

`.claude/agents/ui-qa-tester.md` and `.claude/agents/worker-command-tester.md` are Claude Code
subagents that complement this suite: the first drives/audits every UI control, the second proves
every `jobs_queue` type has a real executor and a reachable producer. Invoke them from Claude Code
when changing controls or worker job types.
