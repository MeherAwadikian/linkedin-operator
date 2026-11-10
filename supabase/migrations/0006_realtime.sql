-- Add the tables the dashboard watches to the Realtime publication so the UI
-- updates live (job status as the worker processes, collected people, account
-- status changes). RLS still applies to Realtime: each user only receives their
-- own rows.
alter publication supabase_realtime add table app.jobs_queue;
alter publication supabase_realtime add table app.people;
alter publication supabase_realtime add table app.accounts;
