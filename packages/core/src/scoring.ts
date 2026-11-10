/**
 * Explainable 0-100 job scorer, ported verbatim (logic-preserving) from the
 * original `linkedin-job-hunter` `src/scoring/score.js` (spec §7). Rule-based,
 * no LLM call — every sub-score is returned with its reason so the UI can show
 * "why". Freshness takes an injectable `now` so the pure logic is testable.
 */

export interface SkillAngle {
  id?: string;
  label: string;
  keywords?: string[];
  weight?: number;
}

export interface ScoringProfile {
  scoring_weights?: Record<string, number>;
  skill_angles?: SkillAngle[];
  location?: { country?: string };
  preferences?: { min_salary_usd_month?: number };
}

export interface JobInput {
  title?: string;
  description?: string;
  tags?: string[];
  remote?: boolean;
  location?: string;
  posted_at?: string | null;
  salary_min?: number;
  salary_max?: number;
}

export interface ScorePart {
  key: string;
  score: number;
  reason: string;
}

export interface ScoreResult {
  total: number;
  grade: string;
  breakdown: ScorePart[];
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  skills_match: 0.3,
  experience_match: 0.15,
  location_remote_compat: 0.2,
  salary_compat: 0.1,
  freshness: 0.1,
  application_ease: 0.15,
};

export function scoreJob(
  job: JobInput,
  profile: ScoringProfile,
  now: number = Date.now(),
): ScoreResult {
  const text =
    `${job.title ?? ''} ${job.description ?? ''} ${(job.tags ?? []).join(' ')}`.toLowerCase();
  const weights = profile.scoring_weights ?? DEFAULT_WEIGHTS;

  const skillsResult = scoreSkillsMatch(text, profile.skill_angles ?? []);
  const remoteResult = scoreRemoteCompat(job, profile);
  const freshnessResult = scoreFreshness(job, now);
  const salaryResult = scoreSalaryCompat(job, profile);
  // Experience-match and application-ease lack reliable signal here (seniority
  // parsing, ATS detection) — scored neutral rather than inventing confidence.
  const experienceResult: Omit<ScorePart, 'key'> = {
    score: 60,
    reason: 'No reliable seniority signal parsed from listing — neutral default',
  };
  const easeResult: Omit<ScorePart, 'key'> = {
    score: 70,
    reason: 'Default: most free-source listings have a standard external apply link',
  };

  const parts: ScorePart[] = [
    { key: 'skills_match', ...skillsResult },
    { key: 'experience_match', ...experienceResult },
    { key: 'location_remote_compat', ...remoteResult },
    { key: 'salary_compat', ...salaryResult },
    { key: 'freshness', ...freshnessResult },
    { key: 'application_ease', ...easeResult },
  ];

  const total = Math.round(parts.reduce((sum, p) => sum + p.score * (weights[p.key] ?? 0), 0));

  return {
    total: Math.max(0, Math.min(100, total)),
    grade: gradeFor(total),
    breakdown: parts,
  };
}

function scoreSkillsMatch(text: string, skillAngles: SkillAngle[]): Omit<ScorePart, 'key'> {
  if (!skillAngles.length) return { score: 50, reason: 'No skill angles configured' };
  let bestAngle: (SkillAngle & { hits: string[] }) | null = null;
  let bestHits = 0;
  let totalWeight = 0;
  for (const angle of skillAngles) {
    const hits = (angle.keywords ?? []).filter((kw) => text.includes(kw.toLowerCase()));
    const weighted = hits.length * (angle.weight ?? 1);
    totalWeight += weighted;
    if (hits.length > bestHits) {
      bestHits = hits.length;
      bestAngle = { ...angle, hits };
    }
  }
  const score = Math.min(100, Math.round(totalWeight * 12));
  const reason = bestAngle
    ? `Best match: "${bestAngle.label}" (${bestAngle.hits.join(', ') || 'no keyword hits'})`
    : 'No keyword overlap with any configured skill angle';
  return { score, reason };
}

function scoreRemoteCompat(job: JobInput, profile: ScoringProfile): Omit<ScorePart, 'key'> {
  if (job.remote) return { score: 100, reason: 'Listed as remote' };
  const loc = (job.location ?? '').toLowerCase();
  const prefs = (profile.location?.country ?? '').toLowerCase();
  if (prefs && loc.includes(prefs)) {
    return { score: 90, reason: "On-site but in candidate's own country" };
  }
  return {
    score: 20,
    reason: 'On-site, location not confirmed compatible with candidate location',
  };
}

function scoreFreshness(job: JobInput, now: number): Omit<ScorePart, 'key'> {
  if (!job.posted_at) return { score: 50, reason: 'No posting date available' };
  const ageDays = (now - new Date(job.posted_at).getTime()) / 86400000;
  if (ageDays < 1) return { score: 100, reason: 'Posted < 24 hours ago' };
  if (ageDays < 3) return { score: 85, reason: 'Posted < 3 days ago' };
  if (ageDays < 7) return { score: 65, reason: 'Posted < 7 days ago' };
  if (ageDays < 30) return { score: 40, reason: `Posted ${Math.round(ageDays)} days ago` };
  return { score: 15, reason: `Posted ${Math.round(ageDays)} days ago — stale` };
}

function scoreSalaryCompat(job: JobInput, profile: ScoringProfile): Omit<ScorePart, 'key'> {
  const min = profile.preferences?.min_salary_usd_month;
  if (typeof min !== 'number' || (!job.salary_min && !job.salary_max)) {
    return { score: 50, reason: 'Salary data unavailable on one or both sides — neutral' };
  }
  const jobMax = job.salary_max || job.salary_min || 0;
  const jobMonthly = jobMax > 20000 ? jobMax / 12 : jobMax; // heuristic: annual vs monthly figure
  if (jobMonthly >= min) return { score: 100, reason: `Listed pay meets ${min}/mo minimum` };
  return { score: 30, reason: `Listed pay below ${min}/mo minimum` };
}

function gradeFor(total: number): string {
  if (total >= 90) return 'Excellent';
  if (total >= 80) return 'Strong';
  if (total >= 70) return 'Good';
  if (total >= 60) return 'Possible';
  return 'Low priority';
}
