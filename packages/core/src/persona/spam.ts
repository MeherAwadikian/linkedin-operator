/**
 * Lightweight spam-trigger scan (port of the spam-checker skill's intent).
 * Flags words/phrases that make outreach read as spammy. Pure + case-insensitive.
 * This improves message QUALITY; it is not about evading any filter.
 */

export interface SpamFlag {
  term: string;
  category: string;
}
export interface SpamReport {
  score: number;
  flags: SpamFlag[];
}

const TERMS: Record<string, string[]> = {
  urgency: [
    'act now',
    'urgent',
    'limited time',
    'offer expires',
    "don't miss",
    'expires soon',
    'last chance',
  ],
  money: [
    'free',
    'cash',
    'earn money',
    'make money',
    'extra income',
    'investment',
    'cheap',
    'best price',
    'lowest price',
    'discount',
  ],
  guarantee: [
    'guarantee',
    'guaranteed',
    'risk-free',
    'no obligation',
    '100%',
    'no risk',
    'promise',
  ],
  pressure: ['buy now', 'click here', 'order now', 'sign up free', 'call now'],
  hype: [
    'amazing',
    'incredible',
    'once in a lifetime',
    'exclusive deal',
    'winner',
    'congratulations',
    'guaranteed income',
  ],
};

export function spamCheck(text: string): SpamReport {
  const hay = text.toLowerCase();
  const flags: SpamFlag[] = [];
  for (const [category, terms] of Object.entries(TERMS)) {
    for (const term of terms) {
      if (hay.includes(term)) flags.push({ term, category });
    }
  }
  return { score: flags.length, flags };
}
