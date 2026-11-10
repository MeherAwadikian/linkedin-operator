/**
 * Persona lint (plan §8): deterministic checks against the persona rules —
 * banned openers / phrases (from docs/PERSONA.md), the em-dash ban, and
 * per-medium length caps. Pure; returns the list of violations.
 */

export interface PersonaLintOptions {
  bannedOpeners?: string[];
  bannedPhrases?: string[];
  maxChars?: number;
  /** Em dashes (and look-alike stand-ins) are banned unless explicitly allowed. */
  allowEmDash?: boolean;
}

export interface PersonaLintResult {
  ok: boolean;
  violations: string[];
}

const EM_DASH = /[—–]|(?:\s--\s)|(?:\s-\s)/; // em/en dash or spaced-hyphen stand-ins

export function personaLint(text: string, opts: PersonaLintOptions = {}): PersonaLintResult {
  const violations: string[] = [];
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (!opts.allowEmDash && EM_DASH.test(text)) {
    violations.push('contains an em dash / dash stand-in (banned)');
  }

  for (const opener of opts.bannedOpeners ?? []) {
    if (lower.startsWith(opener.toLowerCase().trim())) {
      violations.push(`banned opener: "${opener}"`);
    }
  }

  for (const phrase of opts.bannedPhrases ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(`banned phrase: "${phrase}"`);
    }
  }

  if (opts.maxChars && trimmed.length > opts.maxChars) {
    violations.push(`too long: ${trimmed.length} > ${opts.maxChars} chars`);
  }

  return { ok: violations.length === 0, violations };
}
