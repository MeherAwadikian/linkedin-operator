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
