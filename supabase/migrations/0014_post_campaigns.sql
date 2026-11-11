-- 0014_post_campaigns.sql
-- Post campaigns: the operator describes a post they want; the worker drafts it
-- (via the operator's own LLM key) and queues a linkedin.post action into the
-- APPROVAL queue. Nothing is published until the operator approves the drafted
-- text. Posts go to the operator's own LinkedIn feed.

create table app.post_campaigns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brief       text not null,
  body        text not null default '',
  status      text not null default 'draft'
                check (status in ('draft', 'drafting', 'ready', 'done', 'failed')),
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table app.post_campaigns enable row level security;

create policy post_campaigns_owner_select on app.post_campaigns for select using (user_id = auth.uid());
create policy post_campaigns_owner_insert on app.post_campaigns for insert with check (user_id = auth.uid());
create policy post_campaigns_owner_update on app.post_campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy post_campaigns_owner_delete on app.post_campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.post_campaigns to authenticated;
grant all on app.post_campaigns to service_role;

create index post_campaigns_user_created on app.post_campaigns (user_id, created_at desc);
