'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

interface Recipient {
  email: string;
  name?: string;
  company?: string;
}

// Very small email sanity check — we are not validating deliverability, just that
// the operator pasted something address-shaped.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse "email, name, company" lines (or bare emails) into recipients. */
function parseRecipients(raw: string): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const parts = line.split(',').map((s) => s.trim());
    const email = (parts[0] ?? '').toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: parts[1] || undefined, company: parts[2] || undefined });
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * Create an email campaign and enqueue the drafting job. The worker drafts a
 * personalized email per contact and queues each into the Approval Queue —
 * nothing sends until the operator approves it. Recipients are supplied by the
 * operator (their own contacts); nothing is scraped.
 */
export async function createEmailCampaign(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();
  const recipients = parseRecipients(String(formData.get('recipients') ?? ''));
  if (!name || !brief || recipients.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  const { data: campaign } = await app
    .from('email_campaigns')
    .insert({ name, brief, status: 'drafting', recipient_count: recipients.length })
    .select('id')
    .single();
  if (!campaign) return;

  await app.from('jobs_queue').insert({
    type: 'email_campaign.draft',
    payload: { campaign_id: campaign.id, brief, recipients },
  });
  revalidatePath('/email-campaigns');
}
