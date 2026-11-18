'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server.ts';

const URL_KEYS = {
  gmail_url: 'gmail_url',
  linkedin_url: 'linkedin_profile_url',
} as const;

/**
 * Save the Gmail / LinkedIn URLs into app.settings (per-user key/value rows,
 * same pattern as the classic Settings page). API keys do NOT come through
 * here: they go to the worker's encrypted vault via the existing saveSecret
 * action, so the web tier never stores a key.
 */
export async function savePanelUrls(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  for (const [field, key] of Object.entries(URL_KEYS)) {
    const url = String(formData.get(field) ?? '').trim();
    if (!url) continue;
    await app
      .from('settings')
      .upsert({ user_id: user.id, key, value: { url } }, { onConflict: 'user_id,key' });
  }
  revalidatePath('/panel/settings');
}
