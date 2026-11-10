import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, createProvider, OpenAICompatProvider, splitSystem } from './index.ts';

describe('splitSystem', () => {
  it('joins system turns and preserves user/assistant order', () => {
    const { system, rest } = splitSystem([
      { role: 'system', content: 'be terse' },
      { role: 'system', content: 'no emoji' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'bye' },
    ]);
    expect(system).toBe('be terse\n\nno emoji');
    expect(rest).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'bye' },
    ]);
  });

  it('returns undefined system when there are no system turns', () => {
    expect(splitSystem([{ role: 'user', content: 'x' }]).system).toBeUndefined();
  });
});

describe('createProvider', () => {
  it('routes each provider name to the right implementation', () => {
    expect(createProvider({ provider: 'anthropic', apiKey: 'k' })).toBeInstanceOf(
      AnthropicProvider,
    );
    expect(createProvider({ provider: 'deepseek', apiKey: 'k' })).toBeInstanceOf(
      OpenAICompatProvider,
    );
    expect(createProvider({ provider: 'openrouter', apiKey: 'k' })).toBeInstanceOf(
      OpenAICompatProvider,
    );
  });

  it('throws on an unknown provider', () => {
    expect(() => createProvider({ provider: 'bogus' as never, apiKey: 'k' })).toThrow(
      /Unknown LLM provider/,
    );
  });
});

describe('OpenAICompatProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a chat-completions response to LlmResponse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'deepseek-chat',
              choices: [{ message: { content: 'drafted reply' } }],
              usage: { prompt_tokens: 12, completion_tokens: 4 },
            }),
            { status: 200 },
          ),
      ),
    );
    const provider = new OpenAICompatProvider({ provider: 'deepseek', apiKey: 'k' });
    const res = await provider.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.text).toBe('drafted reply');
    expect(res.provider).toBe('deepseek');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
  });

  it('throws on a non-OK HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    const provider = new OpenAICompatProvider({ provider: 'openrouter', apiKey: 'bad' });
    await expect(provider.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      /openrouter request failed \(401\)/,
    );
  });

  it('refuses to construct for the anthropic provider', () => {
    expect(() => new OpenAICompatProvider({ provider: 'anthropic', apiKey: 'k' })).toThrow(
      /Use AnthropicProvider/,
    );
  });
});
