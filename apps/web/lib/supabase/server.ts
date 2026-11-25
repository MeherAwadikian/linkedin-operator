import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * The single operator this app acts as. There is no user login; every row is
 * owned by this id. Overridable via env, defaults to the seeded operator.
 */
export const OPERATOR_ID = process.env.OPERATOR_USER_ID ?? '79acea49-97e9-4cc0-b412-be40fec5cf8b';

/**
 * Server-side Supabase client using the SERVICE ROLE key. The app has no login:
 * this client bypasses RLS and runs only inside the Cloudflare Worker (the key
 * is never shipped to the browser). All data is the single operator's, so reads
 * need no per-user scoping and writes stamp `user_id: OPERATOR_ID` explicitly.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the Worker env. Kept async so existing
 * `await createClient()` call sites are unchanged.
 */
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
