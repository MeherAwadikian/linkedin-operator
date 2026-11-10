-- Row-Level Security (plan §4). RLS is enabled on EVERY table.
--  * Owner tables (have user_id): the authenticated owner may do everything.
--  * secrets / browser_sessions: NO policy at all → unreachable by the anon or
--    authenticated client; only the worker's service_role key (which bypasses
--    RLS) can read or write them.
--  * Shared single-user work tables: any authenticated session (the owner) may
--    do everything; anon gets nothing.

-- Enable RLS everywhere.
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables where table_schema = 'app'
  loop
    execute format('alter table app.%I enable row level security;', t);
  end loop;
end $$;

-- Owner-scoped policies (user_id = auth.uid()).
do $$
declare t text;
begin
  for t in select unnest(array[
    'settings','rules','personas','rate_limit_counters','accounts',
    'jobs_queue','actions_log','command_sessions','candidate_profile'])
  loop
    execute format($f$
      create policy owner_all on app.%I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()));
    $f$, t);
  end loop;
end $$;

-- Shared single-user work tables: authenticated owner full access, anon none.
do $$
declare t text;
begin
  for t in select unnest(array[
    'rule_revisions','approvals','postings','scores','applications',
    'recruiters','people','conversations','messages','drafts',
    'automations','connectors','repos','apps'])
  loop
    execute format($f$
      create policy authed_all on app.%I
        for all to authenticated
        using (true) with check (true);
    $f$, t);
  end loop;
end $$;

-- secrets and browser_sessions intentionally get NO policy: service_role only.
-- (RLS is enabled above; with no policy, non-service roles are denied.)
