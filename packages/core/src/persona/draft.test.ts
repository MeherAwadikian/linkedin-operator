import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest, LlmResponse } from '../llm/index.ts';
import { buildDraftSystemPrompt, generateDraft, type PersonaSpec } from './draft.ts';

const persona: PersonaSpec = {
  toneInstructions: 'Write like an experienced, human career strategist.',
  bannedOpeners: ['I hope this message finds you well'],
  bannedPhrases: ['synergy'],
};

function fakeProvider(reply: string, refused = false): LlmProvider {
  return {
    name: 'anthropic',
    async complete(_req: LlmRequest): Promise<LlmResponse> {
      return { text: reply, model: 'claude-opus-4-8', provider: 'anthropic', refused };
    },
  };
}

describe('buildDraftSystemPrompt', () => {
  it('embeds the persona, length cap, and banned openers', () => {
    const p = buildDraftSystemPrompt(persona, 'connect_note');
    expect(p).toContain('career strategist');
    expect(p).toContain('280');
    expect(p).toContain('I hope this message finds you well');
    expect(p).toContain('No em dashes');
  });
});

describe('generateDraft', () => {
  it('returns the text with quality checks for a clean draft', async () => {
    const r = await generateDraft(
      fakeProvider('Saw your lab-automation project. Open to a quick chat?'),
      persona,
      { medium: 'message', context: 'their lab automation work' },
    );
    expect(r.refused).toBe(false);
    expect(r.checks.pass).toBe(true);
    expect(r.checks.readability.words).toBeGreaterThan(0);
  });

  it('flags a lint violation (em dash) without throwing', async () => {
    const r = await generateDraft(fakeProvider('Great work — lets talk.'), persona, {
      medium: 'message',
      context: 'x',
    });
    expect(r.checks.pass).toBe(false);
    expect(r.checks.lint.violations.join(' ')).toMatch(/em dash/);
  });

  it('handles a provider refusal', async () => {
    const r = await generateDraft(fakeProvider('', true), persona, {
      medium: 'post',
      context: 'x',
    });
    expect(r.refused).toBe(true);
    expect(r.text).toBe('');
  });
});
