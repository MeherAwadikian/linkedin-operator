import type { LlmProvider } from '../llm/types.ts';

export interface DraftedPost {
  body: string;
}

const SYSTEM = [
  "You write authentic LinkedIn posts for the operator's own feed.",
  'Given a brief, write ONE post (roughly 60-170 words):',
  '- a strong, specific first line that earns the next line;',
  '- concrete and conversational, professional but human; short paragraphs / line breaks;',
  "- no engagement-bait, no 'I'm thrilled to announce' clichés unless they genuinely fit;",
  '- at most 0-3 relevant hashtags, only if useful;',
  '- do NOT invent facts, metrics, or events you were not given.',
  'Return STRICT JSON only: {"body": string}. No markdown, no commentary.',
].join('\n');

function extractBody(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1)) as { body?: unknown };
      if (typeof o.body === 'string' && o.body.trim()) return o.body.trim();
    } catch {
      // fall through to raw text
    }
  }
  return text.trim();
}

/**
 * Draft a single LinkedIn post from the operator's brief. The operator reviews and
 * approves the post before it is ever published — this only produces text.
 */
export async function draftPost(provider: LlmProvider, brief: string): Promise<DraftedPost> {
  const res = await provider.complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: brief },
    ],
    maxTokens: 600,
  });
  if (res.refused) throw new Error('model declined to draft this post');
  const body = extractBody(res.text).slice(0, 2800); // LinkedIn post hard limit is 3000
  if (!body) throw new Error('could not parse drafted post');
  return { body };
}
