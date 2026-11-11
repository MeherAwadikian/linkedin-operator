'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

const NETWORKS = ['any', 'first', 'second'] as const;

/**
 * Create a campaign and enqueue the worker job that runs it. The worker searches
 * LinkedIn, collects matching people, and queues one personalized
 * connection-with-note per person into the Approval Queue — nothing is sent until
 * the operator approves each. No email, no contact-detail scraping.
 */
export async function createCampaign(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const query = String(formData.get('query') ?? '').trim();
  const networkRaw = String(formData.get('network_type') ?? 'any');
  const networkType = (NETWORKS as readonly string[]).includes(networkRaw) ? networkRaw : 'any';
  const template = String(formData.get('message_template') ?? '').trim();
  const max = Math.min(Math.max(Number(formData.get('max_targets') ?? 10) || 10, 1), 50);
  if (!name || !query) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  const { data: campaign } = await app
    .from('campaigns')
    .insert({
      name,
      query,
      network_type: networkType,
      message_template: template,
      max_targets: max,
      status: 'collecting',
    })
    .select('id')
    .single();
  if (!campaign) return;

  await app.from('jobs_queue').insert({
    type: 'campaign.start',
    payload: {
      campaign_id: campaign.id,
      query,
      network_type: networkType,
      message_template: template,
      max_targets: max,
    },
  });
  revalidatePath('/campaigns');
}
