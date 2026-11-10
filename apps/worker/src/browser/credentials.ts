import { decryptSecret, type SecretKind } from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch and decrypt a vaulted secret (worker-only; uses the service_role client
 * + the master key). Returns null if the secret has not been stored yet.
 */
export async function fetchSecret(
  sb: SupabaseClient,
  masterKey: Buffer,
  userId: string,
  kind: SecretKind,
): Promise<string | null> {
  const { data, error } = await sb
    .from('secrets')
    .select('ciphertext,iv,auth_tag,key_version')
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw new Error(`fetchSecret failed: ${error.message}`);
  if (!data) return null;
  return decryptSecret(
    {
      kind,
      keyVersion: data.key_version as number,
      ciphertext: data.ciphertext as string,
      iv: data.iv as string,
      authTag: data.auth_tag as string,
    },
    masterKey,
  );
}
