import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_MODELS,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ProviderConfig,
  splitSystem,
} from './types.ts';

/**
 * Anthropic provider using the official SDK (never an OpenAI-compatible shim).
 * Default model is the latest Opus. Short persona drafts run without explicit
 * thinking for low latency; callers may pass an `effort` hint.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
    this.model = config.model ?? DEFAULT_MODELS.anthropic;
    this.maxTokens = config.maxTokens ?? 1024;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const { system, rest } = splitSystem(req.messages);
    const response = await this.client.messages.create({
      model: req.model ?? this.model,
      max_tokens: req.maxTokens ?? this.maxTokens,
      ...(system ? { system } : {}),
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      messages: rest,
    });

    if (response.stop_reason === 'refusal') {
      return {
        text: '',
        model: response.model,
        provider: this.name,
        refused: true,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      model: response.model,
      provider: this.name,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
