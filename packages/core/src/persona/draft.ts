import type { LlmProvider } from '../llm/index.ts';
import { runPersonaChecks, type PersonaCheckResult } from './index.ts';

/**
 * Persona-constrained draft generation (plan §8). Builds a system prompt from
 * the active persona + hard rules, calls the LLM, then runs the quality pipeline
 * over the result. It NEVER sends anything — it returns text + reports for the
 * human approval gate. Fabrication is forbidden: the model may only reference
 * the verified facts passed in.
 */

export type DraftMedium = 'message' | 'comment' | 'post' | 'connect_note';

export interface PersonaSpec {
  toneInstructions: string;
  bannedOpeners: string[];
  bannedPhrases: string[];
}

export interface DraftRequest {
  medium: DraftMedium;
  /** The specific, real reason for this draft (a shared project, a posting, …). */
  context: string;
  /** Verified facts the draft may reference. The model must not invent others. */
  candidateFacts?: string;
}

export interface DraftResult {
  text: string;
  refused: boolean;
  model: string;
  checks: PersonaCheckResult;
}

export const MEDIUM_MAX_CHARS: Record<DraftMedium, number> = {
  connect_note: 280,
  comment: 500,
  message: 900,
  post: 1200,
};

export function buildDraftSystemPrompt(persona: PersonaSpec, medium: DraftMedium): string {
  return [
    persona.toneInstructions,
    '',
    'Hard rules:',
    '- Plain, conversational register. No marketing-speak, no corporate filler.',
    '- Lead with one concrete, real reason — never a generic compliment.',
    '- One clear point. Vary sentence length. No em dashes.',
    `- Keep it under ${MEDIUM_MAX_CHARS[medium]} characters.`,
    '- Only state facts given to you about the sender. Never invent experience, titles, or metrics.',
    persona.bannedOpeners.length
      ? `- Never open with: ${persona.bannedOpeners.map((o) => `"${o}"`).join(', ')}.`
      : '',
    `Write a single LinkedIn ${medium.replace('_', ' ')}. Output only the text, no preamble.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateDraft(
  provider: LlmProvider,
  persona: PersonaSpec,
  req: DraftRequest,
): Promise<DraftResult> {
  const system = buildDraftSystemPrompt(persona, req.medium);
  const user = [
    `Reason for reaching out: ${req.context}`,
    req.candidateFacts
      ? `Verified facts about me (reference only these): ${req.candidateFacts}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await provider.complete({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 600,
  });

  const lintOpts = {
    bannedOpeners: persona.bannedOpeners,
    bannedPhrases: persona.bannedPhrases,
    maxChars: MEDIUM_MAX_CHARS[req.medium],
    allowEmDash: false,
  };

  if (res.refused) {
    return { text: '', refused: true, model: res.model, checks: runPersonaChecks('', lintOpts) };
  }
  const text = res.text.trim();
  return { text, refused: false, model: res.model, checks: runPersonaChecks(text, lintOpts) };
}
