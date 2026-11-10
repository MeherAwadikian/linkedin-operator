'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../lib/supabase/server.ts';

/** Sign out and return to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
