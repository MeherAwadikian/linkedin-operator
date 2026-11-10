import { analyzeReadability, type ReadabilityReport } from './readability.ts';
import { personaLint, type PersonaLintOptions, type PersonaLintResult } from './lint.ts';
import { spamCheck, type SpamReport } from './spam.ts';

export * from './spam.ts';
export * from './readability.ts';
export * from './lint.ts';
export * from './draft.ts';

export interface PersonaCheckResult {
  readability: ReadabilityReport;
  spam: SpamReport;
  lint: PersonaLintResult;
  /**
   * Overall gate. Only the deterministic persona LINT is a hard pass/fail;
   * readability and spam are advisory signals surfaced to the human reviewer.
   */
  pass: boolean;
}

/** Run the full persona quality pipeline (plan §8) over a draft. */
export function runPersonaChecks(text: string, opts: PersonaLintOptions = {}): PersonaCheckResult {
  const lint = personaLint(text, opts);
  return {
    readability: analyzeReadability(text),
    spam: spamCheck(text),
    lint,
    pass: lint.ok,
  };
}
