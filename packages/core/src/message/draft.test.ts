import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmResponse } from '../llm/types.ts';
import { draftMessage } from './draft.ts';

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

describe('draftMessage', () => {
  it('parses a strict-JSON body', async () => {
    const provider = stubProvider({ text: '{"body": "Hi Sam, quick question about ops."}' });
    const out = await draftMessage(provider, { brief: 'intro', target: { name: 'Sam' } });
    expect(out.body).toBe('Hi Sam, quick question about ops.');
  });

  it('tolerates prose around the JSON object', async () => {
    const provider = stubProvider({ text: 'Sure:\n{"body": "Hello there"}\nDone.' });
    const out = await draftMessage(provider, { brief: 'b', target: {} });
    expect(out.body).toBe('Hello there');
  });

  it('caps the body at 1200 chars', async () => {
    const provider = stubProvider({ text: JSON.stringify({ body: 'x'.repeat(5000) }) });
    const out = await draftMessage(provider, { brief: 'b', target: {} });
    expect(out.body).toHaveLength(1200);
  });

  it('throws when the model refuses', async () => {
    const provider = stubProvider({ refused: true });
    await expect(draftMessage(provider, { brief: 'b', target: {} })).rejects.toThrow(/declined/);
  });

  it('throws on unparseable output', async () => {
    const provider = stubProvider({ text: 'no json here' });
    await expect(draftMessage(provider, { brief: 'b', target: {} })).rejects.toThrow(/parse/);
  });
});
