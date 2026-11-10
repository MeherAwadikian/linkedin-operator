'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '../lib/supabase/server.ts';

/** Sign out and return to the login screen. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Enqueue a harmless no-op job to exercise the queue end-to-end. */
export async function enqueueNoop(): Promise<void> {
  const supabase = await createClient();
  // user_id defaults to auth.uid() in the DB; RLS owner-check passes.
  await supabase.schema('app').from('jobs_queue').insert({ type: 'noop', payload: {} });
  revalidatePath('/');
}
