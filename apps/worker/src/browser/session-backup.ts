import { decryptBlob, encryptBlob } from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Encrypted Playwright storageState backup (plan §5). The primary session copy
 * is the worker's local userDataDir; this encrypted backup lets a reinstalled /
 * moved worker restore the LinkedIn session. The master key never leaves the
 * worker, so only the worker can read it; the DB only holds ciphertext.
 */
const CONTEXT = 'browser_session';

export async function saveSessionBackup(
  sb: SupabaseClient,
  masterKey: Buffer,
  accountId: string,
  storageStateJson: string,
): Promise<void> {
  const sealed = encryptBlob(storageStateJson, masterKey, CONTEXT);
  // One backup per account; serial worker, so delete-then-insert is safe.
  await sb.from('browser_sessions').delete().eq('account_id', accountId);
  const { error } = await sb.from('browser_sessions').insert({
    account_id: accountId,
    storage_state_ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    auth_tag: sealed.authTag,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saveSessionBackup failed: ${error.message}`);
}

export async function loadSessionBackup(
  sb: SupabaseClient,
  masterKey: Buffer,
  accountId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('browser_sessions')
    .select('storage_state_ciphertext,iv,auth_tag')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!data) return null;
  return decryptBlob(
    {
      ciphertext: data.storage_state_ciphertext as string,
      iv: data.iv as string,
      authTag: data.auth_tag as string,
    },
    masterKey,
    CONTEXT,
  );
}
