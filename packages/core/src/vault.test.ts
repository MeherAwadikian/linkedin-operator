import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  loadMasterKey,
  secretsEqual,
  type SealedSecret,
  encryptBlob,
  decryptBlob,
} from './vault.ts';

const key = () => loadMasterKey(generateMasterKey());

describe('vault envelope encryption', () => {
  it('round-trips a secret', () => {
    const k = key();
    const sealed = encryptSecret('hunter2-s3cret', k, 'linkedin_password', 1);
    expect(sealed.ciphertext).not.toContain('hunter2');
    expect(decryptSecret(sealed, k)).toBe('hunter2-s3cret');
  });

  it('produces a unique IV/ciphertext each time (non-deterministic)', () => {
    const k = key();
    const a = encryptSecret('same', k, 'anthropic_key', 1);
    const b = encryptSecret('same', k, 'anthropic_key', 1);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails to decrypt under the wrong master key', () => {
    const sealed = encryptSecret('x', key(), 'anthropic_key', 1);
    expect(() => decryptSecret(sealed, key())).toThrow();
  });

  it('detects a tampered ciphertext (GCM auth)', () => {
    const k = key();
    const sealed = encryptSecret('tamper-me', k, 'linkedin_password', 1);
    const buf = Buffer.from(sealed.ciphertext, 'base64');
    buf[0] = buf[0]! ^ 0xff;
    const tampered: SealedSecret = { ...sealed, ciphertext: buf.toString('base64') };
    expect(() => decryptSecret(tampered, k)).toThrow();
  });

  it('binds AAD: a kind swap fails verification', () => {
    const k = key();
    const sealed = encryptSecret('v', k, 'linkedin_password', 1);
    expect(() => decryptSecret({ ...sealed, kind: 'anthropic_key' }, k)).toThrow();
  });

  it('binds AAD: a keyVersion swap fails verification', () => {
    const k = key();
    const sealed = encryptSecret('v', k, 'anthropic_key', 1);
    expect(() => decryptSecret({ ...sealed, keyVersion: 2 }, k)).toThrow();
  });

  it('rejects a master key of the wrong length', () => {
    expect(() => loadMasterKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(() => loadMasterKey(undefined)).toThrow();
  });

  it('secretsEqual is content-correct', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abd')).toBe(false);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
  });
});

describe('encryptBlob / decryptBlob', () => {
  it('round-trips an arbitrary blob under a context', () => {
    const k = key();
    const sealed = encryptBlob('{"cookies":[...]}', k, 'browser_session');
    expect(sealed.ciphertext).not.toContain('cookies');
    expect(decryptBlob(sealed, k, 'browser_session')).toBe('{"cookies":[...]}');
  });
  it('fails on a context (AAD) mismatch', () => {
    const k = key();
    const sealed = encryptBlob('data', k, 'browser_session');
    expect(() => decryptBlob(sealed, k, 'other_context')).toThrow();
  });
  it('fails under a different master key', () => {
    const sealed = encryptBlob('data', key(), 'browser_session');
    expect(() => decryptBlob(sealed, key(), 'browser_session')).toThrow();
  });
});
