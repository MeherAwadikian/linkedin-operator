import type { LlmProvider } from '../llm/types.ts';

export interface MessageTarget {
  name?: string | null;
  headline?: string | null;
}

export interface DraftedMessage {
  body: string;
}

const SYSTEM = [
  'You write short, personalized LinkedIn direct messages for a sender messaging from their own account.',
  'Given a brief and a recipient, write ONE concise message (about 40-90 words):',
  '- plain, specific and friendly; no hype, no stacks of adjectives, no fake familiarity;',
  '- open with a relevant, honest reason for reaching out;',
  '- one clear, low-friction ask at most;',
  '- do NOT invent facts about the recipient you were not given;',
  '- do NOT include a signature or sign-off name.',
  'Return STRICT JSON only: {"body": string}. No markdown, no commentary.',
].join('\n');

function extractJson(text: string): { body?: unknown } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { body?: unknown };
  } catch {
    return null;
  }
}

/**
 * Draft a single personalized LinkedIn message from the operator's brief and
 * the recipient's public name/headline. The operator reviews and approves
 * every draft in the Approval Queue before anything is sent.
 */
export async function draftMessage(
  provider: LlmProvider,
  opts: { brief: string; target: MessageTarget },
): Promise<DraftedMessage> {
  const user = [
    `Brief: ${opts.brief}`,
    `Recipient name: ${opts.target.name ?? '(unknown)'}`,
    `Recipient headline: ${opts.target.headline ?? '(unknown)'}`,
  ].join('\n');

  const res = await provider.complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    maxTokens: 400,
  });
  if (res.refused) throw new Error('model declined to draft this message');

  const parsed = extractJson(res.text);
  const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
  if (!body) throw new Error('could not parse drafted message');
  return { body: body.slice(0, 1200) };
}
