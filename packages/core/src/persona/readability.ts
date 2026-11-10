/**
 * Hemingway-lite readability analysis (port of the hemingway skill's intent):
 * Flesch-Kincaid grade plus adverb / long-sentence / passive-voice heuristics.
 * Pure. Used to keep drafts plain and human — a writing-quality aid.
 */

export interface ReadabilityReport {
  words: number;
  sentences: number;
  grade: number; // Flesch-Kincaid grade level
  adverbs: number; // -ly adverbs
  longSentences: number; // > 25 words
  passiveHits: number; // simple passive-voice heuristic
}

const ADVERB_WHITELIST = new Set(['only', 'family', 'reply', 'apply', 'early', 'likely', 'daily']);

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith('e') && n > 1) n -= 1; // silent e
  return Math.max(1, n);
}

export function analyzeReadability(text: string): ReadabilityReport {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z']/g, ''))
    .filter(Boolean);

  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const grade =
    wordCount === 0
      ? 0
      : 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;

  const adverbs = words.filter(
    (w) => /ly$/i.test(w) && w.length > 3 && !ADVERB_WHITELIST.has(w.toLowerCase()),
  ).length;

  const longSentences = sentences.filter((s) => s.split(/\s+/).filter(Boolean).length > 25).length;

  const passiveHits = (text.match(/\b(?:was|were|been|be|is|are|being)\s+\w+(?:ed|en)\b/gi) ?? [])
    .length;

  return {
    words: wordCount,
    sentences: sentences.length,
    grade: Math.round(grade * 10) / 10,
    adverbs,
    longSentences,
    passiveHits,
  };
}
