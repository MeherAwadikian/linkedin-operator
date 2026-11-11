import type { LlmProvider } from '../llm/types.ts';

export interface EmailRecipient {
  email: string;
  name?: string;
  company?: string;
}

export interface DraftedEmail {
  subject: string;
  body: string;
}

const SYSTEM = [
  'You write short, personalized B2B outreach emails for a sender reaching out from their own account.',
  'Given a brief and a recipient, write ONE concise email (about 80-130 words):',
  '- plain, specific and professional; no hype, no stacks of adjectives, no fake "I saw your post" claims;',
  '- open with a relevant, honest reason for reaching out;',
  '- one clear, low-friction ask (a quick reply or a short call);',
  '- do NOT invent facts about the recipient you were not given;',
  '- do NOT include a signature, sign-off name, or unsubscribe line (added separately).',
  'Return STRICT JSON only: {"subject": string, "body": string}. No markdown, no commentary.',
].join('\n');

function extractJson(text: string): { subject?: unknown; body?: unknown } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { subject?: unknown; body?: unknown };
  } catch {
    return null;
  }
}

/**
 * Draft a single personalized outreach email from the operator's brief and the
 * recipient's details. The sender reviews and approves every draft before it is
 * ever sent — this only produces text.
 */
export async function draftEmail(
  provider: LlmProvider,
  opts: { brief: string; recipient: EmailRecipient },
): Promise<DraftedEmail> {
  const r = opts.recipient;
  const user = [
    `Brief: ${opts.brief}`,
    `Recipient name: ${r.name ?? '(unknown)'}`,
    `Recipient company: ${r.company ?? '(unknown)'}`,
  ].join('\n');

  const res = await provider.complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    maxTokens: 500,
  });
  if (res.refused) throw new Error('model declined to draft this email');

  const parsed = extractJson(res.text);
  const subject = typeof parsed?.subject === 'string' ? parsed.subject.trim() : '';
  const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
  if (!subject || !body) throw new Error('could not parse drafted email');
  return { subject: subject.slice(0, 200), body: body.slice(0, 2000) };
}
