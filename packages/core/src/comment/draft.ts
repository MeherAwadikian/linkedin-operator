import type { LlmProvider } from '../llm/types.ts';

export interface DraftedComment {
  body: string;
}

const SYSTEM = [
  "You write short, genuine LinkedIn comments in the operator's own voice.",
  'Given a brief (the kind of comment wanted) and the text of a post, write ONE comment (about 15-50 words):',
  '- react to something specific in the post; add a thought, not flattery;',
  '- no hashtags, no emoji walls, no generic praise ("Great post!");',
  '- never claim experience or facts the operator did not state in the brief;',
  '- skip anything political, tragic, or sensitive: in that case return an empty body.',
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
 * Draft one comment for a post from the operator's brief. Returns an empty body
 * when the model declines or judges the post unsuitable; callers must skip
 * those. Every non-empty draft still goes through the Approval Queue.
 */
export async function draftComment(
  provider: LlmProvider,
  brief: string,
  postText: string,
): Promise<DraftedComment> {
  if (!postText.trim()) return { body: '' };
  const res = await provider.complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Brief: ${brief}\n\nPost:\n${postText.slice(0, 1500)}` },
    ],
    maxTokens: 250,
  });
  if (res.refused) return { body: '' };

  const parsed = extractJson(res.text);
  const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
  return { body: body.slice(0, 600) };
}
