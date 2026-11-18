'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

interface ConnectRow {
  id: string;
  query: string;
  network_type: string;
  message_template: string;
  max_targets: number;
}
interface LikeRow {
  id: string;
  criteria: string;
  source: string;
  query: string;
  max_likes: number;
}
interface PostRow {
  id: string;
  brief: string;
}
interface MessageRow {
  id: string;
  brief: string;
  audience: string;
  network_type: string;
  max_targets: number;
}
interface CommentRow {
  id: string;
  brief: string;
  audience: string;
  source: string;
  max_comments: number;
}

/**
 * The START button's main run: refresh the LinkedIn session, then launch every
 * campaign still sitting in 'draft' across all five campaign tables by
 * enqueueing its worker job (the same jobs the classic pages enqueue). RLS
 * scopes every select/update to the signed-in operator; every outbound write
 * the workers produce still lands in the Approval Queue.
 */
export async function igniteRun(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  // Make sure the worker has a live session before campaigns need it.
  await app.from('jobs_queue').insert({ type: 'linkedin.login', payload: {} });

  const [connects, likes, posts, messages, comments] = await Promise.all([
    app
      .from('campaigns')
      .select('id,query,network_type,message_template,max_targets')
      .eq('status', 'draft'),
    app.from('like_campaigns').select('id,criteria,source,query,max_likes').eq('status', 'draft'),
    app.from('post_campaigns').select('id,brief').eq('status', 'draft'),
    app
      .from('message_campaigns')
      .select('id,brief,audience,network_type,max_targets')
      .eq('status', 'draft'),
    app
      .from('comment_campaigns')
      .select('id,brief,audience,source,max_comments')
      .eq('status', 'draft'),
  ]);

  for (const c of (connects.data ?? []) as ConnectRow[]) {
    await app.from('jobs_queue').insert({
      type: 'campaign.start',
      payload: {
        campaign_id: c.id,
        query: c.query,
        network_type: c.network_type,
        message_template: c.message_template,
        max_targets: c.max_targets,
      },
    });
    await app.from('campaigns').update({ status: 'collecting' }).eq('id', c.id);
  }

  for (const c of (likes.data ?? []) as LikeRow[]) {
    await app.from('jobs_queue').insert({
      type: 'like_campaign.start',
      payload: {
        like_campaign_id: c.id,
        criteria: c.criteria,
        source: c.source,
        query: c.query,
        max_likes: c.max_likes,
      },
    });
    await app.from('like_campaigns').update({ status: 'scanning' }).eq('id', c.id);
  }

  for (const c of (posts.data ?? []) as PostRow[]) {
    await app.from('jobs_queue').insert({
      type: 'post_campaign.draft',
      payload: { post_campaign_id: c.id, brief: c.brief },
    });
    await app.from('post_campaigns').update({ status: 'drafting' }).eq('id', c.id);
  }

  for (const c of (messages.data ?? []) as MessageRow[]) {
    await app.from('jobs_queue').insert({
      type: 'message_campaign.start',
      payload: {
        message_campaign_id: c.id,
        brief: c.brief,
        audience: c.audience,
        network_type: c.network_type,
        max_targets: c.max_targets,
      },
    });
    await app.from('message_campaigns').update({ status: 'drafting' }).eq('id', c.id);
  }

  for (const c of (comments.data ?? []) as CommentRow[]) {
    await app.from('jobs_queue').insert({
      type: 'comment_campaign.start',
      payload: {
        comment_campaign_id: c.id,
        brief: c.brief,
        audience: c.audience,
        source: c.source,
        max_comments: c.max_comments,
      },
    });
    await app.from('comment_campaigns').update({ status: 'scanning' }).eq('id', c.id);
  }

  revalidatePath('/panel');
}
