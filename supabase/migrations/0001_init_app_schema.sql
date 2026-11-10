-- LinkedIn Operator — initial schema (plan §4)
-- All operational tables live in schema `app`. RLS is enabled on every table.
-- The browser client (anon/authenticated) can reach operational tables; it can
-- NEVER read `secrets` or `browser_sessions` — only the worker's service_role
-- key (which bypasses RLS) touches those. Identity-sensitive artifacts (CV
-- files, government IDs, raw resumes) have NO table here by design.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Settings & safety
-- ---------------------------------------------------------------------------

create table app.settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create table app.rules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_type     text not null check (action_type in (
                    'search','collect_feed','gather_profile','gather_company',
                    'like','comment','post','message','connect','apply_easy_apply')),
  approval_level  int  not null default 2 check (approval_level in (0,1,2)),
  enabled         boolean not null default true,
  daily_limit     int  not null default 0 check (daily_limit >= 0),
  hourly_limit    int  not null default 0 check (hourly_limit >= 0),
  min_gap_seconds int  not null default 0 check (min_gap_seconds >= 0),
  quiet_hours     jsonb,                 -- {"start":"23:00","end":"07:00"} or null
  version         int  not null default 1,
  updated_at      timestamptz not null default now(),
  unique (user_id, action_type)
);

create table app.rule_revisions (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references app.rules (id) on delete cascade,
  old         jsonb,
  new         jsonb,
  changed_at  timestamptz not null default now()
);

create table app.personas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  tone_instructions text not null default '',
  banned_openers    text[] not null default '{}',
  style_rules       jsonb not null default '{}'::jsonb,
  active            boolean not null default true
);

create table app.rate_limit_counters (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_type   text not null,
  window_kind   text not null check (window_kind in ('hour','day')),
  window_start  timestamptz not null,
  count         int not null default 0,
  unique (user_id, action_type, window_kind, window_start)
);

-- ---------------------------------------------------------------------------
-- Account & secrets (service_role only for secret-bearing tables)
-- ---------------------------------------------------------------------------

create table app.accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform          text not null default 'linkedin',
  login_email       text,
  status            text not null default 'logged_out'
                      check (status in ('active','checkpoint','locked','logged_out')),
  last_login_at     timestamptz,
  checkpoint_reason text
);

create table app.secrets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in (
                'linkedin_password','anthropic_key','openrouter_key','deepseek_key')),
  ciphertext  bytea not null,
  iv          bytea not null,
  auth_tag    bytea not null,
  key_version int not null default 1,
  created_at  timestamptz not null default now(),
  unique (user_id, kind)
);

create table app.browser_sessions (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null references app.accounts (id) on delete cascade,
  storage_state_ciphertext bytea not null,
  iv                      bytea not null,
  auth_tag                bytea not null,
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Work data
-- ---------------------------------------------------------------------------

create table app.jobs_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in (
                'queued','awaiting_approval','approved','running','done',
                'failed','blocked','cancelled')),
  priority    int not null default 0,
  run_after   timestamptz not null default now(),
  attempts    int not null default 0,
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);
create index on app.jobs_queue (status, run_after, priority desc);

create table app.approvals (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references app.jobs_queue (id) on delete cascade,
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decision       text check (decision in ('approved','rejected','edited')),
  edited_payload jsonb,
  decided_by     text
);

create table app.actions_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id   uuid references app.accounts (id) on delete set null,
  action_type  text not null,
  target_url   text,
  summary      text,
  job_id       uuid references app.jobs_queue (id) on delete set null,
  outcome      text,
  at           timestamptz not null default now()
);

create table app.postings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source      text,
  external_id text,
  title       text,
  company     text,
  url         text,
  location    text,
  salary_text text,
  raw         jsonb,
  first_seen  timestamptz not null default now(),
  dedupe_hash text not null,
  unique (user_id, dedupe_hash)
);

create table app.scores (
  id             uuid primary key default gen_random_uuid(),
  posting_id     uuid not null references app.postings (id) on delete cascade,
  score          int not null,
  breakdown      jsonb,
  scorer_version text
);

create table app.applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  posting_id  uuid references app.postings (id) on delete set null,
  status      text not null default 'FOUND' check (status in (
                'FOUND','SCORED','WAITING_APPROVAL','APPLIED','REJECTED',
                'INTERVIEW','OFFER','CLOSED')),
  notes       text,
  applied_at  timestamptz,
  history     jsonb not null default '[]'::jsonb
);

create table app.recruiters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text,
  company     text,
  profile_url text,
  source      text not null default 'public_lookup',
  found_at    timestamptz not null default now()
);

create table app.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile_url  text not null,
  display_name text,
  headline     text,
  company      text,
  collected_at timestamptz not null default now(),
  raw          jsonb,
  unique (user_id, profile_url)
);

create table app.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id  uuid references app.people (id) on delete set null,
  thread_url text
);

create table app.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app.conversations (id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  body            text,
  sent_at         timestamptz,
  job_id          uuid references app.jobs_queue (id) on delete set null
);

create table app.drafts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('message','comment','post','connect_note')),
  target           jsonb,
  body             text not null default '',
  persona_id       uuid references app.personas (id) on delete set null,
  hemingway_report jsonb,
  spam_report      jsonb,
  status           text not null default 'draft' check (status in (
                     'draft','queued','approved','sent','rejected')),
  created_by       text not null default 'claude' check (created_by in ('claude','user')),
  created_at       timestamptz not null default now()
);

create table app.automations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  trigger     text not null default 'manual' check (trigger in ('manual','schedule')),
  cron        text,
  pipeline    jsonb not null default '[]'::jsonb,
  enabled     boolean not null default false,
  last_run_at timestamptz
);

create table app.connectors (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name      text not null,
  kind      text not null check (kind in ('job_board','ats')),
  config    jsonb not null default '{}'::jsonb,
  enabled   boolean not null default false,
  last_run  jsonb
);

create table app.repos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name      text not null,
  url       text,
  kind      text,
  notes     text,
  metadata  jsonb not null default '{}'::jsonb
);

create table app.apps (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name      text not null,
  url       text,
  kind      text,
  notes     text,
  metadata  jsonb not null default '{}'::jsonb
);

create table app.command_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prompt     text not null,
  plan       jsonb,
  status     text not null default 'planned',
  created_at timestamptz not null default now()
);

-- Identity-sensitive: candidate profile holds ONLY what the user already
-- publishes (skills, target roles, prefs). CV files / government IDs / raw
-- resumes are never stored (plan §4).
create table app.candidate_profile (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  profile  jsonb not null default '{}'::jsonb
);
