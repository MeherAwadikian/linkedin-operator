'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

const SOURCES = ['feed', 'search'] as const;

/**
 * Create a like campaign and enqueue the scan job. The worker scans the feed (or a
 * post search), the AI judges each post against the criteria, and matching posts
 * are queued as likes under the standing 'like' rate limit (dry-run-aware).
 */
export async function createLikeCampaign(formData: FormData): Promise<void> {
  const criteria = String(formData.get('criteria') ?? '').trim();
  const sourceRaw = String(formData.get('source') ?? 'feed');
  const source = (SOURCES as readonly string[]).includes(sourceRaw) ? sourceRaw : 'feed';
  const query = String(formData.get('query') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_likes') ?? 10) || 10, 1), 30);
  if (!criteria) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  const { data: campaign } = await app
    .from('like_campaigns')
    .insert({ criteria, source, query, max_likes: max, status: 'scanning' })
    .select('id')
    .single();
  if (!campaign) return;

  await app.from('jobs_queue').insert({
    type: 'like_campaign.start',
    payload: { like_campaign_id: campaign.id, criteria, source, query, max_likes: max },
  });
  revalidatePath('/likes');
}
