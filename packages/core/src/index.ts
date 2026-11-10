import { type Rule, RuleSchema } from '@lo/schemas';

/**
 * Default safety rules, one per action type, migrated from the plan §6 table
 * and the original `docs/SAFETY.md` approval scheme. These SEED the `rules`
 * table (issue #2); they are user-editable at runtime thereafter (§7).
 *
 * Note: `apply_easy_apply` is included (user elected to keep it, gated at L2).
 * The hard-coded prohibitions (no detection-evasion, identity-document
 * hard-stop) are NOT expressed here — they live in the worker's executor.
 */
const DEFAULT_QUIET_HOURS = { start: '23:00', end: '07:00' } as const;

export function defaultRules(): Rule[] {
  const raw: Array<Omit<Rule, 'version'>> = [
    {
      actionType: 'search',
      approvalLevel: 0,
      enabled: true,
      dailyLimit: 40,
      hourlyLimit: 10,
      minGapSeconds: 0,
      quietHours: null,
    },
    {
      actionType: 'collect_feed',
      approvalLevel: 0,
      enabled: true,
      dailyLimit: 3,
      hourlyLimit: 2,
      minGapSeconds: 0,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'gather_profile',
      approvalLevel: 0,
      enabled: true,
      dailyLimit: 25,
      hourlyLimit: 10,
      minGapSeconds: 0,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'gather_company',
      approvalLevel: 0,
      enabled: true,
      dailyLimit: 25,
      hourlyLimit: 10,
      minGapSeconds: 0,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'like',
      approvalLevel: 1,
      enabled: true,
      dailyLimit: 15,
      hourlyLimit: 6,
      minGapSeconds: 120,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'comment',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 5,
      hourlyLimit: 2,
      minGapSeconds: 600,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'post',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 1,
      hourlyLimit: 1,
      minGapSeconds: 0,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'message',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 10,
      hourlyLimit: 4,
      minGapSeconds: 300,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'connect',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 8,
      hourlyLimit: 4,
      minGapSeconds: 300,
      quietHours: DEFAULT_QUIET_HOURS,
    },
    {
      actionType: 'apply_easy_apply',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 5,
      hourlyLimit: 2,
      minGapSeconds: 300,
      quietHours: DEFAULT_QUIET_HOURS,
    },
  ];
  return raw.map((r) => RuleSchema.parse(r));
}

export { RuleSchema } from '@lo/schemas';
export type { Rule } from '@lo/schemas';

export {
  loadMasterKey,
  generateMasterKey,
  encryptSecret,
  decryptSecret,
  encryptBlob,
  decryptBlob,
  secretsEqual,
} from './vault.ts';
export type { SealedSecret, SecretKind, SealedBlob } from './vault.ts';

export { redactKeys, Redactor } from './redact.ts';

export { scoreJob } from './scoring.ts';
export type { JobInput, ScoringProfile, SkillAngle, ScorePart, ScoreResult } from './scoring.ts';

export { dedupeKey } from './dedupe.ts';

export { isWriteAction, resolveApprovalLevel, initialJobStatus } from './rules/approval.ts';
export type { InitialJobStatus } from './rules/approval.ts';

export { planCommand, buildPlannerSystemPrompt, extractJsonObject } from './console/planner.ts';
export type { PlanResult } from './console/planner.ts';

export { classifyLinkedInPage, isBlocked } from './linkedin/checkpoint.ts';
export type { PageState, PageSignal, PageClassification } from './linkedin/checkpoint.ts';
export { isLinkedInProfileUrl, isLinkedInHost } from './linkedin/url.ts';

export {
  runPersonaChecks,
  spamCheck,
  analyzeReadability,
  personaLint,
  generateDraft,
  buildDraftSystemPrompt,
  MEDIUM_MAX_CHARS,
} from './persona/index.ts';
export type {
  PersonaCheckResult,
  SpamReport,
  SpamFlag,
  ReadabilityReport,
  PersonaLintOptions,
  PersonaLintResult,
  DraftMedium,
  PersonaSpec,
  DraftRequest,
  DraftResult,
} from './persona/index.ts';

export {
  createProvider,
  AnthropicProvider,
  OpenAICompatProvider,
  splitSystem,
  DEFAULT_MODELS,
} from './llm/index.ts';
export type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmUsage,
  ChatMessage,
  ChatRole,
  ProviderName,
  ProviderConfig,
} from './llm/index.ts';
