import { AnthropicProvider } from './anthropic.ts';
import { OpenAICompatProvider } from './openai-compat.ts';
import type { LlmProvider, ProviderConfig } from './types.ts';

/**
 * Build the configured provider. Anthropic → official SDK; deepseek/openrouter
 * → OpenAI-compatible fetch provider. Throws on an unknown provider so a bad
 * settings value fails loudly rather than silently picking a default.
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'deepseek':
    case 'openrouter':
      return new OpenAICompatProvider(config);
    default: {
      const unknown: never = config.provider;
      throw new Error(`Unknown LLM provider: ${String(unknown)}`);
    }
  }
}

export { AnthropicProvider } from './anthropic.ts';
export { OpenAICompatProvider } from './openai-compat.ts';
export * from './types.ts';
