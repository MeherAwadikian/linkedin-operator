import { describe, expect, it } from 'vitest';
import { Redactor, redactKeys } from './redact.ts';

describe('redactKeys', () => {
  it('redacts credential-shaped fields by name, recursively', () => {
    const out = redactKeys({
      user: 'meher',
      password: 'p@ss',
      nested: { apiKey: 'sk-123', token: 't', ok: 'visible' },
      list: [{ secret: 's' }, { fine: 'yes' }],
    }) as Record<string, unknown>;

    expect(out.user).toBe('meher');
    expect(out.password).toBe('[REDACTED]');
    const nested = out.nested as Record<string, unknown>;
    expect(nested.apiKey).toBe('[REDACTED]');
    expect(nested.token).toBe('[REDACTED]');
    expect(nested.ok).toBe('visible');
    const list = out.list as Record<string, unknown>[];
    expect(list[0]!.secret).toBe('[REDACTED]');
    expect(list[1]!.fine).toBe('yes');
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    expect(() => redactKeys(a)).not.toThrow();
  });
});

describe('Redactor value scrubbing', () => {
  it('scrubs registered secret values from strings, incl. error messages', () => {
    const r = new Redactor();
    r.register('super-secret-password');
    const msg = r.scrubString('login failed for super-secret-password at step 2');
    expect(msg).toBe('login failed for [REDACTED] at step 2');
  });

  it('scrubs secrets even when they leak into an object string field', () => {
    const r = new Redactor();
    r.register('sk-live-abc123');
    const out = r.redact({
      event: 'call',
      note: 'used key sk-live-abc123 here',
      apiKey: 'sk-live-abc123',
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe('[REDACTED]'); // by key name
    expect(out.note).toBe('used key [REDACTED] here'); // by value scrub
  });

  it('ignores too-short values to avoid over-redacting', () => {
    const r = new Redactor();
    r.register('ab');
    expect(r.scrubString('ab cd ab')).toBe('ab cd ab');
  });

  it('clear() stops scrubbing', () => {
    const r = new Redactor();
    r.register('topsecretvalue');
    r.clear();
    expect(r.scrubString('topsecretvalue')).toBe('topsecretvalue');
  });
});
