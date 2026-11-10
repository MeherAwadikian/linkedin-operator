import { describe, expect, it } from 'vitest';
import { analyzeReadability } from './readability.ts';
import { personaLint } from './lint.ts';
import { spamCheck } from './spam.ts';
import { runPersonaChecks } from './index.ts';

describe('spamCheck', () => {
  it('flags spammy terms with categories', () => {
    const r = spamCheck('ACT NOW for a risk-free guarantee and free cash!');
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.flags.map((f) => f.term)).toEqual(
      expect.arrayContaining(['act now', 'risk-free', 'guarantee', 'free', 'cash']),
    );
  });
  it('passes clean copy', () => {
    expect(spamCheck('I saw your work on medical-lab automation and had one question.').score).toBe(
      0,
    );
  });
});

describe('analyzeReadability', () => {
  it('counts adverbs and long sentences', () => {
    const r = analyzeReadability('He quickly and carelessly wrote it. ' + 'word '.repeat(30) + '.');
    expect(r.adverbs).toBeGreaterThanOrEqual(2);
    expect(r.longSentences).toBe(1);
  });
  it('flags passive voice', () => {
    expect(analyzeReadability('The report was written by the team.').passiveHits).toBe(1);
  });
});

describe('personaLint', () => {
  const opts = {
    bannedOpeners: ['I hope this message finds you well'],
    bannedPhrases: ['synergy', 'circle back'],
    maxChars: 300,
  };
  it('catches em dashes', () => {
    expect(personaLint('Great work — really.', opts).ok).toBe(false);
  });
  it('catches a banned opener', () => {
    expect(personaLint('I hope this message finds you well. Quick question.', opts).ok).toBe(false);
  });
  it('catches a banned phrase', () => {
    expect(personaLint('Can we circle back on this?', opts).ok).toBe(false);
  });
  it('catches over-length', () => {
    expect(personaLint('x'.repeat(301), opts).ok).toBe(false);
  });
  it('passes clean, in-policy copy', () => {
    expect(personaLint('Saw your lab-automation project. Open to a quick chat?', opts).ok).toBe(
      true,
    );
  });
});

describe('runPersonaChecks', () => {
  it('passes only when lint passes (readability/spam are advisory)', () => {
    const r = runPersonaChecks('Noticed your automation work. Worth a short chat?', {
      bannedPhrases: ['synergy'],
    });
    expect(r.pass).toBe(true);
    expect(r.readability.words).toBeGreaterThan(0);
  });
  it('fails on a lint violation even if spam is clean', () => {
    const r = runPersonaChecks('Clean copy — but has a dash.', {});
    expect(r.pass).toBe(false);
    expect(r.lint.violations.length).toBeGreaterThan(0);
  });
});
