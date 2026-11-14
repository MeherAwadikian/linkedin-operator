-- 0017_remove_orphan_rules.sql
-- apply_easy_apply and gather_company were seeded as safety rules (0003) but the
-- worker has no executor for them (the planner catalog was trimmed to executable
-- actions), so they can never run and only clutter the Settings safety-rules
-- editor. Remove their rows and any revisions so the UI shows only actionable
-- rules. Revisions go first because rule_revisions.rule_id references rules.
delete from app.rule_revisions
  where rule_id in (
    select id from app.rules where action_type in ('apply_easy_apply', 'gather_company')
  );

delete from app.rules where action_type in ('apply_easy_apply', 'gather_company');
