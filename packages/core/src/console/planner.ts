import { ActionPlanSchema, type ActionPlan } from '@lo/schemas';
import type { LlmProvider } from '../llm/index.ts';

/**
 * Command console planner (plan §9): turn a natural-language instruction into a
 * validated, inspectable action plan. The plan is validated against the action
 * catalog via Zod, so a hallucinated action name fails closed instead of being
 * enqueued. This produces a PLAN only — nothing executes here; the UI previews
 * it and the user confirms, then steps flow through the existing approval gates.
 */

// Only actions the worker can actually execute via browser automation. Keep this
// in lockstep with the operator's handled cases — never advertise an action the
// worker can't run, or the plan would enqueue a job that fails as unsupported.
const ACTIONS = [
  'search',
  'collect_feed',
  'gather_profile',
  'like',
  'comment',
  'post',
  'message',
  'connect',
] as const;

export function buildPlannerSystemPrompt(): string {
  return [
    'You turn a natural-language instruction into a JSON action plan for a LinkedIn assistant.',
    'Respond with ONLY JSON of the form: {"steps":[{"action":"...","inputs":{...},"rationale":"..."}]}.',
    `Allowed actions (use no others): ${ACTIONS.join(', ')}.`,
    'Read-only: search, collect_feed, gather_profile (gather data).',
    'Write: like, comment, post, message, connect (these ALWAYS require human approval; include them if asked, but never assume they will auto-run).',
    'Put concrete parameters in "inputs" (e.g. {"query":"..."}, {"profile_url":"https://www.linkedin.com/in/..."}). One clear step per action. No prose outside the JSON.',
  ].join('\n');
}

/** Extract the first {...} JSON object from a model response (tolerates fences). */
export function extractJsonObject(text: string): unknown {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(stripped.slice(start, end + 1));
}

export interface PlanResult {
  plan: ActionPlan;
  refused: boolean;
  model: string;
}

export async function planCommand(provider: LlmProvider, instruction: string): Promise<PlanResult> {
  const res = await provider.complete({
    messages: [
      { role: 'system', content: buildPlannerSystemPrompt() },
      { role: 'user', content: instruction },
    ],
    maxTokens: 800,
  });
  if (res.refused) return { plan: { steps: [] }, refused: true, model: res.model };

  const parsed = ActionPlanSchema.safeParse(extractJsonObject(res.text));
  if (!parsed.success) {
    throw new Error(`invalid plan from model: ${parsed.error.message}`);
  }
  // Drop any step the worker can't execute via browser automation, so a plan
  // never enqueues a job that would fail as unsupported.
  const executable = new Set<string>(ACTIONS);
  const steps = parsed.data.steps.filter((s) => executable.has(s.action));
  return { plan: { ...parsed.data, steps }, refused: false, model: res.model };
}
