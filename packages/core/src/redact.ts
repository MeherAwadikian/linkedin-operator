/**
 * Log redaction (plan §5). Two independent defenses so a credential never
 * reaches a log sink, a trace artifact, or an error string:
 *
 *  1. Key-name redaction: any object field whose key looks like a credential
 *     (password, token, key, secret, authorization, ciphertext, cookie, iv,
 *     authTag) is replaced with [REDACTED], recursively.
 *  2. Value scrubbing: a Redactor can be told the literal secret values in use
 *     (the decrypted password, the API key) and will scrub them from ANY string
 *     it serializes, including error messages that may have interpolated them.
 *
 * The worker wraps its logger with a Redactor whose registered values are the
 * decrypted secrets currently in memory. Nothing else logs those values.
 */

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|ciphertext|auth[_-]?tag|^iv$|api[_-]?key|\bkey\b/i;

/** Deep-redact credential-shaped fields by key name. Pure; returns a new value. */
export function redactKeys(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactKeys(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactKeys(v, seen);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A Redactor that knows specific secret literal values and scrubs them from any
 * string, in addition to key-name redaction. Register the decrypted secrets
 * right after they are loaded; unregister on logout / rotation.
 */
export class Redactor {
  private values = new Set<string>();

  /** Register a secret value to scrub from all future output. No-ops on short/empty. */
  register(secret: string | undefined | null): void {
    if (secret && secret.length >= 4) this.values.add(secret);
  }

  clear(): void {
    this.values.clear();
  }

  /** Scrub all registered secret values from a string. */
  scrubString(input: string): string {
    let out = input;
    for (const v of this.values) {
      out = out.replace(new RegExp(escapeRegExp(v), 'g'), REDACTED);
    }
    return out;
  }

  /** Full redaction: key-name redaction + value scrubbing on every string. */
  redact(value: unknown): unknown {
    const byKey = redactKeys(value);
    return this.scrubDeep(byKey);
  }

  private scrubDeep(value: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof value === 'string') return this.scrubString(value);
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    if (Array.isArray(value)) return value.map((v) => this.scrubDeep(v, seen));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = this.scrubDeep(v, seen);
    }
    return out;
  }
}
