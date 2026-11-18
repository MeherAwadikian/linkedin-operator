'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server.ts';

/**
 * Stage a like campaign (status 'draft'). START launches it: the worker scans
 * the feed, the AI judges each post against the criteria, and matching posts
 * are queued as likes under the standing 'like' rate limit (dry-run-aware).
 */
export async function stageLikeCampaign(formData: FormData): Promise<void> {
  const criteria = String(formData.get('criteria') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_likes') ?? 10) || 10, 1), 30);
  if (!criteria) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.schema('app').from('like_campaigns').insert({
    criteria,
    source: 'feed',
    query: '',
    max_likes: max,
    status: 'draft',
  });
  revalidatePath('/panel/like');
}
