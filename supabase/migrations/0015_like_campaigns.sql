-- 0015_like_campaigns.sql
-- Like campaigns: the operator describes what kinds of posts to like; the worker
-- scans the LinkedIn feed (or a post search), the AI judges each post against the
-- criteria, and matching posts are queued as linkedin.like actions. Likes run
-- under the standing 'like' rule (rate-limited, dry-run-aware) — conservative by
-- design. Likes are on the operator's own account only.

create table app.like_campaigns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criteria      text not null,
  source        text not null default 'feed' check (source in ('feed', 'search')),
  query         text not null default '',
  max_likes     int  not null default 10 check (max_likes between 1 and 30),
  status        text not null default 'draft'
                  check (status in ('draft', 'scanning', 'ready', 'done', 'failed')),
  scanned_count int  not null default 0,
  queued_count  int  not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app.like_campaigns enable row level security;

create policy like_campaigns_owner_select on app.like_campaigns for select using (user_id = auth.uid());
create policy like_campaigns_owner_insert on app.like_campaigns for insert with check (user_id = auth.uid());
create policy like_campaigns_owner_update on app.like_campaigns for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy like_campaigns_owner_delete on app.like_campaigns for delete using (user_id = auth.uid());

grant select, insert, update, delete on app.like_campaigns to authenticated;
grant all on app.like_campaigns to service_role;

create index like_campaigns_user_created on app.like_campaigns (user_id, created_at desc);
