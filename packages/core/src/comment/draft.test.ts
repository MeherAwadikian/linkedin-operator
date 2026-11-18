import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmResponse } from '../llm/types.ts';
import { draftComment } from './draft.ts';

function stubProvider(reply: Partial<LlmResponse>): LlmProvider {
  return {
    name: 'anthropic',
    complete: async () => ({
      text: '',
      model: 'test',
      provider: 'anthropic',
      ...reply,
    }),
  };
}

describe('draftComment', () => {
  it('parses a strict-JSON body', async () => {
    const provider = stubProvider({ text: '{"body": "Agreed, the second point matters most."}' });
    const out = await draftComment(provider, 'supportive', 'Post about hiring.');
    expect(out.body).toBe('Agreed, the second point matters most.');
  });

  it('returns empty body for an empty post without calling the model', async () => {
    const provider: LlmProvider = {
      name: 'anthropic',
      complete: async () => {
        throw new Error('should not be called');
      },
    };
    const out = await draftComment(provider, 'brief', '   ');
    expect(out.body).toBe('');
  });

  it('returns empty body when the model refuses', async () => {
    const out = await draftComment(stubProvider({ refused: true }), 'brief', 'some post');
    expect(out.body).toBe('');
  });

  it('returns empty body on unparseable output', async () => {
    const out = await draftComment(stubProvider({ text: 'nope' }), 'brief', 'some post');
    expect(out.body).toBe('');
  });

  it('caps the body at 600 chars', async () => {
    const provider = stubProvider({ text: JSON.stringify({ body: 'y'.repeat(2000) }) });
    const out = await draftComment(provider, 'brief', 'some post');
    expect(out.body).toHaveLength(600);
  });
});
