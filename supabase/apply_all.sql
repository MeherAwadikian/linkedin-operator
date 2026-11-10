-- LinkedIn Operator — full initial DB setup (apply in your SQL editor or via MCP).
-- Generated from 0001..0009. Safe to run once on a fresh project.

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


-- Row-Level Security (plan §4). RLS is enabled on EVERY table, and every table
-- is OWNER-SCOPED — there is no `using (true)` escape hatch, so a stray public
-- sign-up can never read another user's data.
--  * Tables with a user_id column → owner policy (user_id = auth.uid()).
--  * True child tables (non-null parent FK) → scoped through the parent's owner.
--  * secrets / browser_sessions → NO policy at all: only the worker's
--    service_role key (which bypasses RLS) can reach them.

-- Enable RLS everywhere.
do $$
declare t text;
begin
  for t in select table_name from information_schema.tables where table_schema = 'app'
  loop
    execute format('alter table app.%I enable row level security;', t);
  end loop;
end $$;

-- Owner-scoped policies for every table that carries user_id.
do $$
declare t text;
begin
  for t in select unnest(array[
    'settings','rules','personas','rate_limit_counters','accounts',
    'jobs_queue','actions_log','command_sessions','candidate_profile',
    'postings','applications','recruiters','people','conversations',
    'drafts','automations','connectors','repos','apps'])
  loop
    execute format($f$
      create policy owner_all on app.%I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()));
    $f$, t);
  end loop;
end $$;

-- True child tables: scope through the parent's owner (parent FK is NOT NULL).
create policy owner_via_parent on app.rule_revisions
  for all to authenticated
  using (exists (select 1 from app.rules r where r.id = rule_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from app.rules r where r.id = rule_id and r.user_id = (select auth.uid())));

create policy owner_via_parent on app.approvals
  for all to authenticated
  using (exists (select 1 from app.jobs_queue j where j.id = job_id and j.user_id = (select auth.uid())))
  with check (exists (select 1 from app.jobs_queue j where j.id = job_id and j.user_id = (select auth.uid())));

create policy owner_via_parent on app.scores
  for all to authenticated
  using (exists (select 1 from app.postings p where p.id = posting_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from app.postings p where p.id = posting_id and p.user_id = (select auth.uid())));

create policy owner_via_parent on app.messages
  for all to authenticated
  using (exists (select 1 from app.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from app.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

-- secrets and browser_sessions intentionally get NO policy: service_role only.
-- (RLS is enabled above; with no policy, non-service roles are denied.)


-- Default seeding (plan §6, §7). On each new auth user, create the default
-- safety rules (one per action type), a default persona (from docs/PERSONA.md),
-- a candidate_profile skeleton, and a logged-out LinkedIn account row. These
-- are the SAME defaults as packages/core `defaultRules()`; they are fully
-- user-editable afterwards.

create or replace function app.seed_defaults(uid uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare quiet jsonb := '{"start":"23:00","end":"07:00"}'::jsonb;
begin
  -- Rules (idempotent via unique(user_id, action_type)).
  insert into app.rules (user_id, action_type, approval_level, enabled, daily_limit, hourly_limit, min_gap_seconds, quiet_hours) values
    (uid,'search',          0,true,40,10,  0,null),
    (uid,'collect_feed',    0,true, 3, 2,  0,quiet),
    (uid,'gather_profile',  0,true,25,10,  0,quiet),
    (uid,'gather_company',  0,true,25,10,  0,quiet),
    (uid,'like',            1,true,15, 6,120,quiet),
    (uid,'comment',         2,true, 5, 2,600,quiet),
    (uid,'post',            2,true, 1, 1,  0,quiet),
    (uid,'message',         2,true,10, 4,300,quiet),
    (uid,'connect',         2,true, 8, 4,300,quiet),
    (uid,'apply_easy_apply',2,true, 5, 2,300,quiet)
  on conflict (user_id, action_type) do nothing;

  -- Default persona (docs/PERSONA.md).
  insert into app.personas (user_id, name, tone_instructions, banned_openers, style_rules, active)
  select uid, 'default',
    'Write like an experienced, human career strategist: professional, concise, '
    || 'natural, analytical, polite, persistent without being pushy. Lead with one '
    || 'concrete, real reason for reaching out. Short paragraphs, plain language, '
    || 'sentence-length variation, no corporate filler, no em dashes.',
    array[
      'I hope this message finds you well',
      'I am reaching out to express',
      'I came across your profile and was impressed',
      'I wanted to touch base',
      'In today''s fast-paced world'],
    '{"banned_phrases":["synergy","leverage","circle back","touch base","disrupt","game-changer","rockstar","ninja"],"no_em_dash":true,"no_excessive_emoji":true}'::jsonb,
    true
  where not exists (select 1 from app.personas p where p.user_id = uid and p.name = 'default');

  -- Candidate profile skeleton + LinkedIn account row.
  insert into app.candidate_profile (user_id, profile) values (uid, '{}'::jsonb)
    on conflict (user_id) do nothing;
  insert into app.accounts (user_id, platform, status)
  select uid, 'linkedin', 'logged_out'
  where not exists (select 1 from app.accounts a where a.user_id = uid and a.platform = 'linkedin');
end $$;

-- Trigger: seed defaults for every new auth user.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  perform app.seed_defaults(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Seed any users that already exist (so current logins get defaults too).
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform app.seed_defaults(u.id);
  end loop;
end $$;


-- Job queue claim primitives (plan §2, §6). The worker claims jobs through
-- `app.claim_next_job`, which uses FOR UPDATE SKIP LOCKED so concurrent
-- claimers never double-claim. These functions are SECURITY DEFINER and are
-- execizable only by service_role (the worker) — revoked from anon/authenticated
-- so a browser client can never claim or complete a job.

-- Worker liveness (UI reads this to show worker health; only the worker writes).
create table if not exists app.worker_heartbeats (
  id         text primary key,          -- stable worker id
  last_beat  timestamptz not null default now(),
  info       jsonb
);
alter table app.worker_heartbeats enable row level security;
-- Authenticated owner (single operator) may read; writes are service_role only.
create policy heartbeats_read on app.worker_heartbeats
  for select to authenticated using (true);

-- Claim the next runnable job atomically. Returns null when the queue is empty.
create or replace function app.claim_next_job(p_worker text)
returns app.jobs_queue
language plpgsql
security definer
set search_path = app, public
as $$
declare j app.jobs_queue;
begin
  -- Defense in depth: only the worker's service_role may ever run this, even if
  -- the grants below are ever misconfigured.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select * into j
  from app.jobs_queue
  where status = 'queued' and run_after <= now()
  order by priority desc, created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update app.jobs_queue
     set status = 'running', claimed_at = now(), attempts = attempts + 1
   where id = j.id
  returning * into j;

  return j;
end $$;

-- Mark a claimed job finished (done/failed/blocked/cancelled).
create or replace function app.complete_job(
  p_id uuid, p_status text, p_result jsonb default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_status not in ('done','failed','blocked','cancelled') then
    raise exception 'invalid completion status: %', p_status;
  end if;
  update app.jobs_queue
     set status = p_status, result = p_result, error = p_error
   where id = p_id;
end $$;

-- Only the worker (service_role) may claim/complete. Revoke from PUBLIC too —
-- Postgres grants EXECUTE to PUBLIC by default, so revoking anon/authenticated
-- alone would still leave them access via the PUBLIC grant.
revoke execute on function app.claim_next_job(text)                  from public, anon, authenticated;
revoke execute on function app.complete_job(uuid, text, jsonb, text) from public, anon, authenticated;
grant  execute on function app.claim_next_job(text)                  to service_role;
grant  execute on function app.complete_job(uuid, text, jsonb, text) to service_role;

-- Expose the `app` schema to PostgREST so the web + worker clients can reach it
-- (Supabase only exposes public + graphql_public by default). Mirror this under
-- Settings → API → Exposed schemas if the role config is ever reset.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app';
notify pgrst, 'reload config';


-- Store encrypted blobs as base64 TEXT rather than bytea. The vault
-- (packages/core/vault.ts) already emits base64 strings, and TEXT round-trips
-- cleanly through PostgREST/supabase-js, whereas bytea does not. The ciphertext
-- is equally opaque either way. Tables are empty at this point, so the USING
-- conversions are no-ops.

alter table app.secrets
  alter column ciphertext type text using encode(ciphertext, 'base64'),
  alter column iv         type text using encode(iv, 'base64'),
  alter column auth_tag   type text using encode(auth_tag, 'base64');

alter table app.browser_sessions
  alter column storage_state_ciphertext type text using encode(storage_state_ciphertext, 'base64'),
  alter column iv         type text using encode(iv, 'base64'),
  alter column auth_tag   type text using encode(auth_tag, 'base64');


-- Add the tables the dashboard watches to the Realtime publication so the UI
-- updates live (job status as the worker processes, collected people, account
-- status changes). RLS still applies to Realtime: each user only receives their
-- own rows.
alter publication supabase_realtime add table app.jobs_queue;
alter publication supabase_realtime add table app.people;
alter publication supabase_realtime add table app.accounts;


-- Defense in depth: app.people.profile_url may only ever be a canonical
-- https://www.linkedin.com/in/ URL. The worker already validates before insert,
-- but this stops any direct client insert from storing a javascript:/data: or
-- off-site URL that the UI might render into an href.
alter table app.people
  add constraint people_profile_url_linkedin
  check (profile_url ~ '^https://www\.linkedin\.com/in/');


-- Atomic rate limiter (plan §6). app.consume_rate_limit checks the current hour
-- and day windows for (user, action); if either is at/over its limit it returns
-- false WITHOUT consuming, otherwise it increments both windows and returns true.
-- service_role only (the worker). A limit of 0 means "no limit" for that window.
create or replace function app.consume_rate_limit(
  p_user uuid, p_action text, p_hourly int, p_daily int)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  h_start timestamptz := date_trunc('hour', now());
  d_start timestamptz := date_trunc('day', now());
  h_count int;
  d_count int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select coalesce(count, 0) into h_count from app.rate_limit_counters
    where user_id = p_user and action_type = p_action
      and window_kind = 'hour' and window_start = h_start;
  select coalesce(count, 0) into d_count from app.rate_limit_counters
    where user_id = p_user and action_type = p_action
      and window_kind = 'day' and window_start = d_start;

  if (p_hourly > 0 and coalesce(h_count,0) >= p_hourly)
     or (p_daily > 0 and coalesce(d_count,0) >= p_daily) then
    return false;
  end if;

  insert into app.rate_limit_counters (user_id, action_type, window_kind, window_start, count)
    values (p_user, p_action, 'hour', h_start, 1)
    on conflict (user_id, action_type, window_kind, window_start)
    do update set count = app.rate_limit_counters.count + 1;
  insert into app.rate_limit_counters (user_id, action_type, window_kind, window_start, count)
    values (p_user, p_action, 'day', d_start, 1)
    on conflict (user_id, action_type, window_kind, window_start)
    do update set count = app.rate_limit_counters.count + 1;
  return true;
end $$;

revoke execute on function app.consume_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant  execute on function app.consume_rate_limit(uuid, text, int, int) to service_role;


-- Live command-console updates: the worker writes the generated plan back to
-- command_sessions, and the console UI shows it in real time. RLS still scopes
-- to the owner.
alter publication supabase_realtime add table app.command_sessions;


