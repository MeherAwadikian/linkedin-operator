'use server';

import { revalidatePath } from 'next/cache';
import { createClient, OPERATOR_ID } from '../../../lib/supabase/server.ts';

/**
 * Stage a message campaign (status 'draft'). START launches it: the worker
 * searches the audience (1st-degree connections), the AI drafts one message per
 * person from the brief, and every message waits in the Approval Queue.
 */
export async function stageMessageCampaign(formData: FormData): Promise<void> {
  const brief = String(formData.get('brief') ?? '').trim();
  const audience = String(formData.get('audience') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_targets') ?? 5) || 5, 1), 25);
  if (!brief || !audience) return;

  const supabase = await createClient();

  await supabase.schema('app').from('message_campaigns').insert({
    user_id: OPERATOR_ID,
    brief,
    audience,
    network_type: 'first',
    max_targets: max,
    status: 'draft',
  });
  revalidatePath('/panel/message');
}
