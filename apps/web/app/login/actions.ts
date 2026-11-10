'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server.ts';

/** Password sign-in server action. On success, land on the dashboard. */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/');
}
