/**
 * Secrets vault — envelope encryption for the LinkedIn password and the user's
 * Claude API key (plan §5).
 *
 * Design:
 *  - A single 32-byte master key lives ONLY in the worker's `.env`
 *    (`VAULT_MASTER_KEY`, base64). Never in Supabase, never in the repo.
 *  - Each secret is sealed with AES-256-GCM: random 12-byte IV, 16-byte auth
 *    tag, and Additional Authenticated Data (AAD) that binds the ciphertext to
 *    its `keyVersion` and `kind`. AAD is NOT secret; it is integrity-protected,
 *    so a ciphertext cannot be silently swapped between kinds or key versions.
 *  - `keyVersion` lets the worker re-encrypt everything under a new master key
 *    (the `rotate-key` ops command) without ambiguity.
 *
 * Only the worker ever calls `decryptSecret`. The web tier may call
 * `encryptSecret` only when forwarding a just-entered secret to storage.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The kinds of secret the vault stores (mirrors the `secrets.kind` column). */
export type SecretKind =
  | 'linkedin_password'
  | 'gmail_password'
  | 'anthropic_key'
  | 'openrouter_key'
  | 'deepseek_key';

/** Serialized, DB-ready encrypted secret. All binary fields are base64. */
export interface SealedSecret {
  kind: SecretKind;
  keyVersion: number;
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/**
 * Validate and load the master key from a base64 string (typically
 * `process.env.VAULT_MASTER_KEY`). Throws on absence or wrong length rather
 * than silently accepting a weak key.
 */
export function loadMasterKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error('VAULT_MASTER_KEY is not set — the worker cannot seal or open secrets.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `VAULT_MASTER_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate one with generateMasterKey().',
    );
  }
  return key;
}

/** Generate a fresh base64 master key for first-time setup or key rotation. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

function aad(kind: SecretKind, keyVersion: number): Buffer {
  return Buffer.from(`${kind}:v${keyVersion}`, 'utf8');
}

/** Seal a plaintext secret under the master key. */
export function encryptSecret(
  plaintext: string,
  masterKey: Buffer,
  kind: SecretKind,
  keyVersion: number,
): SealedSecret {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(kind, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    kind,
    keyVersion,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Open a sealed secret. Throws if the master key is wrong, the ciphertext was
 * tampered with, or the AAD (kind/keyVersion) does not match — GCM verifies all
 * three. There is no "partial" decrypt: it either returns the exact plaintext
 * or throws.
 */
export function decryptSecret(sealed: SealedSecret, masterKey: Buffer): string {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error(`master key must be ${KEY_BYTES} bytes`);
  }
  const iv = Buffer.from(sealed.iv, 'base64');
  const authTag = Buffer.from(sealed.authTag, 'base64');
  if (iv.length !== IV_BYTES) throw new Error('bad IV length');
  if (authTag.length !== TAG_BYTES) throw new Error('bad auth tag length');

  const decipher = createDecipheriv(ALGO, masterKey, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(sealed.kind, sealed.keyVersion));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** A sealed arbitrary blob (e.g. a Playwright storageState backup). base64 fields. */
export interface SealedBlob {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Seal an arbitrary string under the master key, with a caller-supplied
 * `context` string as AAD (integrity-bound, not secret). Used for the encrypted
 * browser-session backup; same AES-256-GCM guarantees as encryptSecret.
 */
export function encryptBlob(plaintext: string, masterKey: Buffer, context: string): SealedBlob {
  if (masterKey.length !== KEY_BYTES) throw new Error(`master key must be ${KEY_BYTES} bytes`);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Open a sealed blob. Throws on wrong key, tamper, or AAD/context mismatch. */
export function decryptBlob(sealed: SealedBlob, masterKey: Buffer, context: string): string {
  if (masterKey.length !== KEY_BYTES) throw new Error(`master key must be ${KEY_BYTES} bytes`);
  const iv = Buffer.from(sealed.iv, 'base64');
  const authTag = Buffer.from(sealed.authTag, 'base64');
  if (iv.length !== IV_BYTES) throw new Error('bad IV length');
  if (authTag.length !== TAG_BYTES) throw new Error('bad auth tag length');
  const decipher = createDecipheriv(ALGO, masterKey, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Constant-time comparison of two secrets (e.g. to check whether a re-entered
 * value matches without branching on content). Returns false on length
 * mismatch without leaking length via timing beyond the unavoidable.
 */
export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
