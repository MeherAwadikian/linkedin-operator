-- 0010_schema_grants.sql
-- The earlier migrations enabled RLS and granted EXECUTE on the queue functions,
-- but never granted USAGE on the `app` schema (nor table privileges) to the
-- Postgres roles the Supabase API keys map to. Result: the worker's service_role
-- key connects but every query fails with "permission denied for schema app".
--
-- This grants the minimum each role needs. service_role (the worker) bypasses RLS
-- and owns the secret-bearing tables; authenticated (the single operator, via the
-- web app) gets table DML but is still row-scoped by RLS and blocked from the
-- secrets/browser_sessions tables (RLS-enabled, no policy = deny all). Function
-- privileges are left exactly as the prior migrations set them — NOT re-granted
-- here — so the claim/complete/rate-limit restrictions stay intact.

-- Schema visibility for all three API-key roles.
grant usage on schema app to anon, authenticated, service_role;

-- Worker: full table/sequence access (it already bypasses RLS).
grant all on all tables    in schema app to service_role;
grant all on all sequences in schema app to service_role;
alter default privileges in schema app grant all on tables    to service_role;
alter default privileges in schema app grant all on sequences to service_role;

-- Operator (web, authenticated): row-scoped DML. RLS enforces owner scope and
-- hides the secret tables; these grants only make the non-secret tables reachable.
grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage, select on all sequences in schema app to authenticated;
alter default privileges in schema app grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema app grant usage, select on sequences to authenticated;

-- Belt-and-suspenders: the secret-bearing tables are service_role only. RLS
-- already denies authenticated/anon (no policy), but revoke table privileges too
-- so access never depends on RLS staying enabled.
revoke all on app.secrets          from anon, authenticated;
revoke all on app.browser_sessions from anon, authenticated;
