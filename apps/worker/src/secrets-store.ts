import { encryptSecret, type SecretKind } from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** DB row shape for app.secrets (base64 text fields after migration 0005). */
export interface SecretRow {
  user_id: string;
  kind: SecretKind;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

/**
 * Seal a plaintext secret and map it to the `secrets` row. Pure (no DB), so the
 * encrypt → row mapping is unit-tested without the network. Only the worker ever
 * holds the master key, so only the worker can build these rows.
 */
export function buildSecretRow(
  masterKey: Buffer,
  userId: string,
  kind: SecretKind,
  value: string,
  keyVersion = 1,
): SecretRow {
  const sealed = encryptSecret(value, masterKey, kind, keyVersion);
  return {
    user_id: userId,
    kind,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    auth_tag: sealed.authTag,
    key_version: sealed.keyVersion,
  };
}

/** Encrypt + upsert a secret (one row per user+kind). */
export async function storeSecret(
  sb: SupabaseClient,
  masterKey: Buffer,
  userId: string,
  kind: SecretKind,
  value: string,
): Promise<void> {
  const row = buildSecretRow(masterKey, userId, kind, value);
  const { error } = await sb.from('secrets').upsert(row, { onConflict: 'user_id,kind' });
  if (error) throw new Error(`storeSecret failed: ${error.message}`);
}
