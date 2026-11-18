-- 0018_control_panel.sql
-- Hot Rod control panel: two new campaign types (message + comment), both
-- following the existing campaign pattern. The worker searches/scans LinkedIn,
-- the AI drafts text from the operator's brief, and every write is queued as an
-- awaiting_approval job: nothing is sent without the operator approving it, and
-- the standing rate limits + dry-run gate still apply at execution time.
-- Also widens the secrets vault to hold a Firecrawl API key.

-- Message campaigns: brief (what kind of message) + audience (to whom). The
-- worker searches people (1st-degree by default, since LinkedIn messaging
-- requires a connection), drafts one personalized message per person, and
-- queues each linkedin.message into the Approval Queue.
create table app.message_campaigns (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brief        text not null,
  audience     text not null,
  network_type text not null default 'first' check (network_type in ('any', 'first', 'second')),
  max_targets  int  not null default 5 check (max_targets between 1 and 25),
  status       text not null default 'draft'
                 check (status in ('draft', 'drafting', 'ready', 'done', 'failed')),
  queued_count int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table app.message_campaigns enable row level security;

create policy message_campaigns_owner_select on app.message_campaigns for select using (user_id = auth.uid());
create policy message_campaigns_owner_insert on app.message_campaigns for insert with check (user_id = auth.uid());
create policy message_campaigns_owner_update on app.message_campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy message_campaigns_owner_delete on app.message_campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.message_campaigns to authenticated;
grant all on app.message_campaigns to service_role;

create index message_campaigns_user_created on app.message_campaigns (user_id, created_at desc);

-- Comment campaigns: brief (the type of comment to write) + audience (whose
-- posts to comment on). The worker scans a content search (or the feed), the AI
-- judges each post against the audience criteria, drafts a comment from the
-- brief, and queues each linkedin.comment into the Approval Queue.
create table app.comment_campaigns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brief         text not null,
  audience      text not null default '',
  source        text not null default 'feed' check (source in ('feed', 'search')),
  max_comments  int  not null default 5 check (max_comments between 1 and 20),
  status        text not null default 'draft'
                  check (status in ('draft', 'scanning', 'ready', 'done', 'failed')),
  scanned_count int  not null default 0,
  queued_count  int  not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app.comment_campaigns enable row level security;

create policy comment_campaigns_owner_select on app.comment_campaigns for select using (user_id = auth.uid());
create policy comment_campaigns_owner_insert on app.comment_campaigns for insert with check (user_id = auth.uid());
create policy comment_campaigns_owner_update on app.comment_campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comment_campaigns_owner_delete on app.comment_campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.comment_campaigns to authenticated;
grant all on app.comment_campaigns to service_role;

create index comment_campaigns_user_created on app.comment_campaigns (user_id, created_at desc);

-- Allow the vault to store a Firecrawl API key (same encrypted path as the
-- other API keys; the worker is the only holder of the master key).
alter table app.secrets drop constraint if exists secrets_kind_check;
alter table app.secrets add constraint secrets_kind_check check (kind in (
  'linkedin_password', 'gmail_password', 'anthropic_key', 'openrouter_key',
  'deepseek_key', 'firecrawl_key'));

-- Live status updates in the control panel, same as the other campaign tables.
alter publication supabase_realtime add table app.message_campaigns;
alter publication supabase_realtime add table app.comment_campaigns;
