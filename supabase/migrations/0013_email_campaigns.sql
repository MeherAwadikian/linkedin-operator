-- 0013_email_campaigns.sql
-- Email campaigns: the operator gives a brief + pastes a list of contacts THEY
-- already have a basis to email. The worker drafts a personalized email per
-- contact (via the operator's own LLM key) and queues each into the APPROVAL
-- queue; nothing sends until the operator approves it, and sends are rate-limited
-- and carry an unsubscribe line. No scraping of strangers, no unattended blasting.

create table app.email_campaigns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  brief         text not null default '',
  status        text not null default 'draft'
                  check (status in ('draft', 'drafting', 'ready', 'done', 'failed')),
  recipient_count int not null default 0,
  queued_count    int not null default 0,
  last_error      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app.email_campaigns enable row level security;

create policy email_campaigns_owner_select on app.email_campaigns for select using (user_id = auth.uid());
create policy email_campaigns_owner_insert on app.email_campaigns for insert with check (user_id = auth.uid());
create policy email_campaigns_owner_update on app.email_campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy email_campaigns_owner_delete on app.email_campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.email_campaigns to authenticated;
grant all on app.email_campaigns to service_role;

create index email_campaigns_user_created on app.email_campaigns (user_id, created_at desc);
