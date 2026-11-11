import type { LlmProvider } from '../llm/types.ts';

export interface LikeDecision {
  like: boolean;
  reason: string;
}

const SYSTEM = [
  "You decide whether a LinkedIn feed post matches the operator's liking criteria.",
  'Like only posts that genuinely fit — be conservative; when unsure, do not like.',
  'Never like posts that are political, inflammatory, tragic/sensitive, or spammy, even if keywords match.',
  'Return STRICT JSON only: {"like": boolean, "reason": string}. No commentary.',
].join('\n');

function parse(text: string): LikeDecision {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const o = JSON.parse(text.slice(start, end + 1)) as { like?: unknown; reason?: unknown };
      return {
        like: o.like === true,
        reason: typeof o.reason === 'string' ? o.reason : '',
      };
    } catch {
      // fall through
    }
  }
  return { like: false, reason: 'unparseable decision' };
}

/**
 * Decide whether a single post matches the operator's criteria. Conservative by
 * design — likes still pass the rate limit and dry-run gate before anything runs.
 */
export async function classifyLike(
  provider: LlmProvider,
  criteria: string,
  postText: string,
): Promise<LikeDecision> {
  if (!postText.trim()) return { like: false, reason: 'empty post' };
  const res = await provider.complete({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Criteria: ${criteria}\n\nPost:\n${postText.slice(0, 1500)}` },
    ],
    maxTokens: 120,
  });
  if (res.refused) return { like: false, reason: 'model declined' };
  return parse(res.text);
}
