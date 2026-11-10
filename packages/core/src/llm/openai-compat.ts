import {
  DEFAULT_MODELS,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ProviderConfig,
  type ProviderName,
} from './types.ts';

const BASE_URLS: Partial<Record<ProviderName, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

interface ChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Provider for genuine OpenAI-compatible services (DeepSeek, OpenRouter). Uses
 * the Chat Completions shape where system/user/assistant all live in the
 * `messages` array. Kept separate from the Anthropic provider so the Anthropic
 * path can use its official SDK (per the claude-api skill).
 */
export class OpenAICompatProvider implements LlmProvider {
  readonly name: ProviderName;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    if (config.provider === 'anthropic') {
      throw new Error('Use AnthropicProvider for the anthropic provider.');
    }
    this.name = config.provider;
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODELS[config.provider];
    this.maxTokens = config.maxTokens ?? 1024;
    const base = config.baseUrl ?? BASE_URLS[config.provider];
    if (!base) throw new Error(`No base URL configured for provider "${config.provider}".`);
    this.baseUrl = base.replace(/\/$/, '');
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model ?? this.model,
        max_tokens: req.maxTokens ?? this.maxTokens,
        messages: req.messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`${this.name} request failed (${res.status}): ${detail.slice(0, 500)}`);
    }

    const data = (await res.json()) as ChatCompletion;
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? req.model ?? this.model,
      provider: this.name,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }
}
