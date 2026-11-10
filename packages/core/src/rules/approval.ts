import type { ActionType, ApprovalLevel } from '@lo/schemas';

/**
 * Approval-level resolution (plan §7, §9, §14 dry-run). Decides whether an
 * action auto-runs, runs under a standing rule, or must wait for per-item human
 * approval. This is the single place that logic lives so the worker's executor
 * and the UI agree.
 *
 * Dry-run forces EVERY write action to level 2 (await approval), regardless of
 * its configured rule — the global "nothing is sent without me" switch.
 */

const WRITE_ACTIONS = new Set<ActionType>([
  'like',
  'comment',
  'post',
  'message',
  'connect',
  'apply_easy_apply',
]);

/** True for actions that change state on LinkedIn (vs read-only gathering). */
export function isWriteAction(action: ActionType): boolean {
  return WRITE_ACTIONS.has(action);
}

/** Effective approval level after applying the dry-run override. */
export function resolveApprovalLevel(
  action: ActionType,
  configuredLevel: ApprovalLevel,
  dryRun: boolean,
): ApprovalLevel {
  if (dryRun && isWriteAction(action)) return 2;
  return configuredLevel;
}

export type InitialJobStatus = 'approved' | 'awaiting_approval';

/**
 * Map an effective approval level to the status a newly-enqueued job should get:
 *  - L0 / L1 → approved (auto-run; L1 is a standing rule, still logged)
 *  - L2      → awaiting_approval (per-item human gate)
 */
export function initialJobStatus(effectiveLevel: ApprovalLevel): InitialJobStatus {
  return effectiveLevel === 2 ? 'awaiting_approval' : 'approved';
}
