-- Live command-console updates: the worker writes the generated plan back to
-- command_sessions, and the console UI shows it in real time. RLS still scopes
-- to the owner.
alter publication supabase_realtime add table app.command_sessions;
