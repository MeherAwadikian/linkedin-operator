'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server.ts';

/**
 * Stage post campaigns (status 'draft'), one row per requested post. START
 * launches them: the worker drafts each post from the brief and queues a
 * linkedin.post into the Approval Queue; nothing publishes without approval.
 */
export async function stagePostCampaign(formData: FormData): Promise<void> {
  const brief = String(formData.get('brief') ?? '').trim();
  const count = Math.min(Math.max(Number(formData.get('post_count') ?? 1) || 1, 1), 10);
  if (!brief) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // One row per post so each gets its own draft + approval entry.
  const rows = Array.from({ length: count }, () => ({ brief, status: 'draft' }));
  await supabase.schema('app').from('post_campaigns').insert(rows);
  revalidatePath('/panel/posts');
}
