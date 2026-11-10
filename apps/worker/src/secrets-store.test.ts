import { decryptSecret, generateMasterKey, loadMasterKey } from '@lo/core';
import { describe, expect, it } from 'vitest';
import { buildSecretRow } from './secrets-store.ts';

describe('buildSecretRow', () => {
  it('produces a row whose fields decrypt back to the plaintext', () => {
    const key = loadMasterKey(generateMasterKey());
    const row = buildSecretRow(key, 'user-1', 'linkedin_password', 's3cret-pw');

    expect(row.user_id).toBe('user-1');
    expect(row.kind).toBe('linkedin_password');
    expect(row.ciphertext).not.toContain('s3cret');
    expect(row.key_version).toBe(1);

    const back = decryptSecret(
      {
        kind: 'linkedin_password',
        keyVersion: row.key_version,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      },
      key,
    );
    expect(back).toBe('s3cret-pw');
  });

  it('cannot be opened by a different master key', () => {
    const row = buildSecretRow(loadMasterKey(generateMasterKey()), 'u', 'anthropic_key', 'sk-xyz');
    expect(() =>
      decryptSecret(
        {
          kind: 'anthropic_key',
          keyVersion: row.key_version,
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        },
        loadMasterKey(generateMasterKey()),
      ),
    ).toThrow();
  });
});
