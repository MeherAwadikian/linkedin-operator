/**
 * Provider-agnostic LLM interface (plan §3). The command console and persona
 * engine call `LlmProvider`; the concrete provider is chosen at runtime from
 * the user's settings. Anthropic is the default and uses the official SDK
 * (never an OpenAI-compatible shim); DeepSeek/OpenRouter are genuine
 * OpenAI-compatible services with their own provider.
 */

export type ProviderName = 'anthropic' | 'deepseek' | 'openrouter';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmRequest {
  messages: ChatMessage[];
  /** Overrides the provider's configured model for this call. */
  model?: string;
  maxTokens?: number;
  /** Anthropic effort hint (low|medium|high|xhigh|max); ignored by other providers. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  provider: ProviderName;
  usage?: LlmUsage;
  /** True if the model declined (Anthropic stop_reason "refusal"). */
  refused?: boolean;
}

export interface LlmProvider {
  readonly name: ProviderName;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  /** Default model for this provider. */
  model?: string;
  /** Override base URL (e.g. a gateway). Mainly for the OpenAI-compatible providers. */
  baseUrl?: string;
  maxTokens?: number;
}

/** Default model per provider. Anthropic default is the latest Opus. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: 'claude-opus-4-8',
  deepseek: 'deepseek-chat',
  openrouter: 'anthropic/claude-opus-4-8',
};

/**
 * Split a message list into the Anthropic shape: a single `system` string
 * (all system turns joined) and the remaining user/assistant turns. Pure, so
 * it is unit-tested without the network.
 */
export function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  rest: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemParts: string[] = [];
  const rest: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else rest.push({ role: m.role, content: m.content });
  }
  return {
    system: systemParts.length ? systemParts.join('\n\n') : undefined,
    rest,
  };
}
