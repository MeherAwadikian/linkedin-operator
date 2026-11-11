-- 0012_worker_endpoints.sql
-- Lets the local worker advertise its current public tunnel URL in the DB, so the
-- web app discovers it dynamically instead of needing WORKER_INGEST_URL re-set on
-- Cloudflare every time the tunnel restarts. The URL is a routing endpoint, not a
-- secret (the ingest endpoint is still token-gated), so any signed-in operator may
-- read it. Only the worker/launcher (service_role) writes it.

create table app.worker_endpoints (
  worker_id   text primary key,
  public_url  text not null,
  updated_at  timestamptz not null default now()
);

alter table app.worker_endpoints enable row level security;

-- Read-only to signed-in operators (URL is non-sensitive routing info).
create policy worker_endpoints_read on app.worker_endpoints for select to authenticated using (true);

grant select on app.worker_endpoints to authenticated;
grant all on app.worker_endpoints to service_role;
