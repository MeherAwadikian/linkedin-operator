import { z } from 'zod';

/**
 * The discrete LinkedIn actions the system can perform (plan §6).
 * Read-only actions default to approval level 0; write actions are gated.
 */
export const ActionType = z.enum([
  'search',
  'collect_feed',
  'gather_profile',
  'gather_company',
  'like',
  'comment',
  'post',
  'message',
  'connect',
  'apply_easy_apply',
]);
export type ActionType = z.infer<typeof ActionType>;

/**
 * Approval levels (plan §6):
 *  0 = auto-execute and log
 *  1 = execute under a standing rule, logged, batch-reviewable
 *  2 = per-item human approval required in the queue
 */
export const ApprovalLevel = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ApprovalLevel = z.infer<typeof ApprovalLevel>;

/**
 * A user-editable safety rule, one row per action type (plan §4 `rules`, §7).
 * Limits and levels are tunable at runtime; the hard-coded prohibitions
 * (no detection-evasion, no identity-document handling) do NOT live here.
 */
export const RuleSchema = z.object({
  actionType: ActionType,
  approvalLevel: ApprovalLevel,
  enabled: z.boolean(),
  dailyLimit: z.number().int().nonnegative(),
  hourlyLimit: z.number().int().nonnegative(),
  minGapSeconds: z.number().int().nonnegative(),
  quietHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .nullable(),
  version: z.number().int().nonnegative().default(1),
});
export type Rule = z.infer<typeof RuleSchema>;

/**
 * One step of a command-console plan (plan §9). `action` is constrained to the
 * registered action catalog, so a hallucinated action name fails validation
 * (fail closed) rather than being enqueued.
 */
export const ActionPlanStep = z.object({
  action: ActionType,
  inputs: z.record(z.unknown()).default({}),
  rationale: z.string().default(''),
});
export type ActionPlanStep = z.infer<typeof ActionPlanStep>;

export const ActionPlanSchema = z.object({
  steps: z.array(ActionPlanStep),
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
