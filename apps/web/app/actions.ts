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

/** Enqueue a LinkedIn login/session-refresh job for the worker to run. */
export async function enqueueLinkedInLogin(): Promise<void> {
  const supabase = await createClient();
  await supabase.schema('app').from('jobs_queue').insert({ type: 'linkedin.login', payload: {} });
  revalidatePath('/');
}

/** Enqueue a people-search job. */
export async function enqueueSearch(formData: FormData): Promise<void> {
  const query = String(formData.get('query') ?? '').trim();
  if (!query) return;
  const supabase = await createClient();
  await supabase
    .schema('app')
    .from('jobs_queue')
    .insert({ type: 'linkedin.search', payload: { query, max_results: 10 } });
  revalidatePath('/');
}

/** Enqueue a feed-collection sweep. */
export async function enqueueCollectFeed(): Promise<void> {
  const supabase = await createClient();
  await supabase
    .schema('app')
    .from('jobs_queue')
    .insert({ type: 'linkedin.collect_feed', payload: { max_items: 20 } });
  revalidatePath('/');
}
