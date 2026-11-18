'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server.ts';

/**
 * Stage a comment campaign (status 'draft'). START launches it: the worker
 * scans a content search for the audience (or the feed), the AI judges each
 * post, drafts a comment from the brief, and every comment waits in the
 * Approval Queue. Nothing posts without approval.
 */
export async function stageCommentCampaign(formData: FormData): Promise<void> {
  const brief = String(formData.get('brief') ?? '').trim();
  const audience = String(formData.get('audience') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_comments') ?? 5) || 5, 1), 20);
  if (!brief) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .schema('app')
    .from('comment_campaigns')
    .insert({
      brief,
      audience,
      source: audience ? 'search' : 'feed',
      max_comments: max,
      status: 'draft',
    });
  revalidatePath('/panel/comment');
}
