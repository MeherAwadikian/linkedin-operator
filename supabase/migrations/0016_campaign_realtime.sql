-- 0016_campaign_realtime.sql
-- Add the campaign tables to the Realtime publication so the UI live-updates a
-- campaign's status when the worker changes it (drafting -> ready/failed), instead
-- of needing a manual reload. RLS applies to Realtime, so each operator only
-- receives their own rows.

alter publication supabase_realtime add table app.campaigns;
alter publication supabase_realtime add table app.email_campaigns;
alter publication supabase_realtime add table app.post_campaigns;
alter publication supabase_realtime add table app.like_campaigns;
