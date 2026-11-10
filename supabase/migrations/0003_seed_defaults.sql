-- Default seeding (plan §6, §7). On each new auth user, create the default
-- safety rules (one per action type), a default persona (from docs/PERSONA.md),
-- a candidate_profile skeleton, and a logged-out LinkedIn account row. These
-- are the SAME defaults as packages/core `defaultRules()`; they are fully
-- user-editable afterwards.

create or replace function app.seed_defaults(uid uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare quiet jsonb := '{"start":"23:00","end":"07:00"}'::jsonb;
begin
  -- Rules (idempotent via unique(user_id, action_type)).
  insert into app.rules (user_id, action_type, approval_level, enabled, daily_limit, hourly_limit, min_gap_seconds, quiet_hours) values
    (uid,'search',          0,true,40,10,  0,null),
    (uid,'collect_feed',    0,true, 3, 2,  0,quiet),
    (uid,'gather_profile',  0,true,25,10,  0,quiet),
    (uid,'gather_company',  0,true,25,10,  0,quiet),
    (uid,'like',            1,true,15, 6,120,quiet),
    (uid,'comment',         2,true, 5, 2,600,quiet),
    (uid,'post',            2,true, 1, 1,  0,quiet),
    (uid,'message',         2,true,10, 4,300,quiet),
    (uid,'connect',         2,true, 8, 4,300,quiet),
    (uid,'apply_easy_apply',2,true, 5, 2,300,quiet)
  on conflict (user_id, action_type) do nothing;

  -- Default persona (docs/PERSONA.md).
  insert into app.personas (user_id, name, tone_instructions, banned_openers, style_rules, active)
  select uid, 'default',
    'Write like an experienced, human career strategist: professional, concise, '
    || 'natural, analytical, polite, persistent without being pushy. Lead with one '
    || 'concrete, real reason for reaching out. Short paragraphs, plain language, '
    || 'sentence-length variation, no corporate filler, no em dashes.',
    array[
      'I hope this message finds you well',
      'I am reaching out to express',
      'I came across your profile and was impressed',
      'I wanted to touch base',
      'In today''s fast-paced world'],
    '{"banned_phrases":["synergy","leverage","circle back","touch base","disrupt","game-changer","rockstar","ninja"],"no_em_dash":true,"no_excessive_emoji":true}'::jsonb,
    true
  where not exists (select 1 from app.personas p where p.user_id = uid and p.name = 'default');

  -- Candidate profile skeleton + LinkedIn account row.
  insert into app.candidate_profile (user_id, profile) values (uid, '{}'::jsonb)
    on conflict (user_id) do nothing;
  insert into app.accounts (user_id, platform, status)
  select uid, 'linkedin', 'logged_out'
  where not exists (select 1 from app.accounts a where a.user_id = uid and a.platform = 'linkedin');
end $$;

-- Trigger: seed defaults for every new auth user.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  perform app.seed_defaults(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Seed any users that already exist (so current logins get defaults too).
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform app.seed_defaults(u.id);
  end loop;
end $$;
