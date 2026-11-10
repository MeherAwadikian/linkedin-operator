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
  if p_status not in ('done','failed','blocked','cancelled') then
    raise exception 'invalid completion status: %', p_status;
  end if;
  update app.jobs_queue
     set status = p_status, result = p_result, error = p_error
   where id = p_id;
end $$;

-- Only the worker (service_role) may claim/complete.
revoke execute on function app.claim_next_job(text)                     from anon, authenticated;
revoke execute on function app.complete_job(uuid, text, jsonb, text)    from anon, authenticated;

-- Expose the `app` schema to PostgREST so the web + worker clients can reach it
-- (Supabase only exposes public + graphql_public by default). Mirror this under
-- Settings → API → Exposed schemas if the role config is ever reset.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app';
notify pgrst, 'reload config';
