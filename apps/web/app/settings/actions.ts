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
