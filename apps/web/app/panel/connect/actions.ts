'use server';

import { revalidatePath } from 'next/cache';
import { createClient, OPERATOR_ID } from '../../../lib/supabase/server.ts';

/**
 * Stage a connect campaign (status 'draft'). Nothing runs yet: the dashboard's
 * START button enqueues the worker job for every staged campaign, and each
 * resulting connection request still waits in the Approval Queue.
 */
export async function stageConnectCampaign(formData: FormData): Promise<void> {
  const audience = String(formData.get('audience') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_targets') ?? 10) || 10, 1), 50);
  if (!audience) return;

  const supabase = await createClient();

  await supabase
    .schema('app')
    .from('campaigns')
    .insert({
      user_id: OPERATOR_ID,
      name: audience.slice(0, 80),
      query: audience,
      network_type: 'any',
      message_template: notes,
      max_targets: max,
      status: 'draft',
    });
  revalidatePath('/panel/connect');
}
