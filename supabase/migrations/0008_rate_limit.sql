-- Atomic rate limiter (plan §6). app.consume_rate_limit checks the current hour
-- and day windows for (user, action); if either is at/over its limit it returns
-- false WITHOUT consuming, otherwise it increments both windows and returns true.
-- service_role only (the worker). A limit of 0 means "no limit" for that window.
create or replace function app.consume_rate_limit(
  p_user uuid, p_action text, p_hourly int, p_daily int)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  h_start timestamptz := date_trunc('hour', now());
  d_start timestamptz := date_trunc('day', now());
  h_count int;
  d_count int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select coalesce(count, 0) into h_count from app.rate_limit_counters
    where user_id = p_user and action_type = p_action
      and window_kind = 'hour' and window_start = h_start;
  select coalesce(count, 0) into d_count from app.rate_limit_counters
    where user_id = p_user and action_type = p_action
      and window_kind = 'day' and window_start = d_start;

  if (p_hourly > 0 and coalesce(h_count,0) >= p_hourly)
     or (p_daily > 0 and coalesce(d_count,0) >= p_daily) then
    return false;
  end if;

  insert into app.rate_limit_counters (user_id, action_type, window_kind, window_start, count)
    values (p_user, p_action, 'hour', h_start, 1)
    on conflict (user_id, action_type, window_kind, window_start)
    do update set count = app.rate_limit_counters.count + 1;
  insert into app.rate_limit_counters (user_id, action_type, window_kind, window_start, count)
    values (p_user, p_action, 'day', d_start, 1)
    on conflict (user_id, action_type, window_kind, window_start)
    do update set count = app.rate_limit_counters.count + 1;
  return true;
end $$;

revoke execute on function app.consume_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant  execute on function app.consume_rate_limit(uuid, text, int, int) to service_role;
