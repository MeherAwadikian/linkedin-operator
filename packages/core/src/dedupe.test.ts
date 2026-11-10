import { describe, expect, it } from 'vitest';
import { dedupeKey } from './dedupe.ts';

describe('dedupeKey', () => {
  it('collapses casing, punctuation, and whitespace differences', () => {
    const a = dedupeKey({ company: 'Acme  Inc.', title: 'AI, Engineer!' });
    const b = dedupeKey({ company: 'acme inc', title: 'ai engineer' });
    expect(a).toBe(b);
    expect(a).toBe('acme inc::ai engineer');
  });

  it('distinguishes genuinely different postings', () => {
    expect(dedupeKey({ company: 'Acme', title: 'Engineer' })).not.toBe(
      dedupeKey({ company: 'Globex', title: 'Engineer' }),
    );
  });

  it('handles missing fields without throwing', () => {
    expect(dedupeKey({})).toBe('::');
  });
});
