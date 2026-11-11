-- 0011_campaigns.sql
-- Campaigns: a saved target (network type + search query) plus a message. Running
-- a campaign makes the worker search LinkedIn, collect matching people, and queue
-- one personalized connection-with-note per person into the APPROVAL queue. Nothing
-- is sent without the operator approving it (existing jobs_queue awaiting_approval
-- flow + rate limits + dry-run). No email, no scraping of contact details.

create table app.campaigns (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  network_type     text not null default 'any' check (network_type in ('any', 'first', 'second')),
  query            text not null,
  message_template text not null default '',
  max_targets      int  not null default 10 check (max_targets between 1 and 50),
  status           text not null default 'draft'
                     check (status in ('draft', 'collecting', 'ready', 'done', 'failed')),
  queued_count     int  not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table app.campaigns enable row level security;

-- Owner-scoped: the operator sees and manages only their own campaigns.
create policy campaigns_owner_select on app.campaigns for select using (user_id = auth.uid());
create policy campaigns_owner_insert on app.campaigns for insert with check (user_id = auth.uid());
create policy campaigns_owner_update on app.campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy campaigns_owner_delete on app.campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.campaigns to authenticated;
grant all on app.campaigns to service_role;

create index campaigns_user_created on app.campaigns (user_id, created_at desc);
