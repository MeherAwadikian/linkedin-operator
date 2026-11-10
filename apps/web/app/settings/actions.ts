'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server.ts';

const INGEST_URL = process.env.WORKER_INGEST_URL ?? 'http://127.0.0.1:8787';
const INGEST_TOKEN = process.env.WORKER_INGEST_TOKEN ?? '';

/**
 * Forward a just-entered secret to the worker's local ingest endpoint. The web
 * tier never encrypts or stores it — the worker (sole holder of the master key)
 * does. The plaintext exists only for the duration of this request.
 */
async function forwardSecret(userId: string, kind: string, value: string): Promise<void> {
  const res = await fetch(`${INGEST_URL}/store-secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-token': INGEST_TOKEN },
    body: JSON.stringify({ userId, kind, value }),
  });
  if (!res.ok) throw new Error(`worker ingest failed (${res.status})`);
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Save an API key (anthropic/openrouter/deepseek) into the vault. */
export async function saveSecret(formData: FormData): Promise<void> {
  const kind = String(formData.get('kind') ?? '');
  const value = String(formData.get('value') ?? '').trim();
  if (!value) return;
  const userId = await currentUserId();
  if (!userId) return;
  await forwardSecret(userId, kind, value);
  revalidatePath('/settings');
}

/** Save the LinkedIn email (to accounts) and password (to the vault). */
export async function saveLinkedInAccount(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (email) {
    await supabase
      .schema('app')
      .from('accounts')
      .update({ login_email: email })
      .eq('user_id', user.id)
      .eq('platform', 'linkedin');
  }
  if (password) {
    await forwardSecret(user.id, 'linkedin_password', password);
  }
  revalidatePath('/settings');
}

/** Toggle global dry-run mode (forces all write actions to await approval). */
export async function setDryRun(formData: FormData): Promise<void> {
  const enabled = String(formData.get('enabled')) === 'true';
  const supabase = await createClient();
  await supabase
    .schema('app')
    .from('settings')
    .upsert({ key: 'dry_run', value: { enabled } }, { onConflict: 'user_id,key' });
  revalidatePath('/settings');
}

/** Update one safety rule live; writes a rule_revisions audit row + bumps version. */
export async function updateRule(formData: FormData): Promise<void> {
  const actionType = String(formData.get('action_type'));
  const approvalLevel = Number(formData.get('approval_level'));
  const dailyLimit = Number(formData.get('daily_limit'));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const app = supabase.schema('app');

  const { data: old } = await app
    .from('rules')
    .select('*')
    .eq('user_id', user.id)
    .eq('action_type', actionType)
    .maybeSingle();
  if (!old) return;

  const { data: updated } = await app
    .from('rules')
    .update({
      approval_level: approvalLevel,
      daily_limit: dailyLimit,
      version: (old.version as number) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', old.id)
    .select()
    .maybeSingle();

  if (updated) {
    await app.from('rule_revisions').insert({ rule_id: old.id, old, new: updated });
  }
  revalidatePath('/settings');
}
