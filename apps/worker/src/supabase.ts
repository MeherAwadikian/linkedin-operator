import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Worker-only Supabase client using the service_role key. It bypasses RLS and
 * is the ONLY component allowed to read secrets/browser_sessions and to call
 * the claim/complete queue functions. Defaults all queries to the `app` schema.
 *
 * Returns null (rather than throwing) when credentials are absent, so the worker
 * can still boot + heartbeat locally before the project keys are wired.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // The `schema: 'app'` option narrows the client's generic; erase it back to
  // the base SupabaseClient type (the schema still applies at runtime).
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'app' },
  }) as unknown as SupabaseClient;
}
