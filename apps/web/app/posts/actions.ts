'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

/**
 * Create a post campaign and enqueue the drafting job. The worker drafts the post
 * from the brief and queues a linkedin.post action into the Approval Queue —
 * nothing is published until the operator approves the drafted text.
 */
export async function createPost(formData: FormData): Promise<void> {
  const brief = String(formData.get('brief') ?? '').trim();
  if (!brief) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  const { data: post } = await app
    .from('post_campaigns')
    .insert({ brief, status: 'drafting' })
    .select('id')
    .single();
  if (!post) return;

  await app.from('jobs_queue').insert({
    type: 'post_campaign.draft',
    payload: { post_campaign_id: post.id, brief },
  });
  revalidatePath('/posts');
}
