/**
 * Advisory LinkedIn daily safety limits for the control panel. These are the
 * commonly cited "stay under this per day" numbers, NOT enforcement: exceeding
 * one only shows a warning on the campaign page. Actual pacing is enforced at
 * execution time by the worker's per-action rules (app.rules + rate windows),
 * which are stricter. Pure module, safe to import from client components.
 */

export type PanelAction = 'connect' | 'message' | 'like' | 'comment' | 'post';

export const LINKEDIN_DAILY_SAFE_LIMITS: Record<PanelAction, number> = {
  connect: 25, // invitations per day (commonly cited 20-25)
  message: 50, // direct messages per day
  like: 30, // reactions per day (conservative; the DB caps a campaign at 30)
  comment: 20, // comments per day
  post: 3, // feed posts per day
};

const ACTION_LABEL: Record<PanelAction, string> = {
  connect: 'connection requests',
  message: 'messages',
  like: 'likes',
  comment: 'comments',
  post: 'posts',
};

/**
 * Returns an advisory warning string when the requested volume exceeds the
 * daily safe limit for the action, or null when it is within bounds. The
 * warning never blocks: the caller renders it and lets the campaign proceed.
 */
export function dailyLimitWarning(action: PanelAction, requested: number): string | null {
  const limit = LINKEDIN_DAILY_SAFE_LIMITS[action];
  if (!Number.isFinite(requested) || requested <= limit) return null;
  return (
    `${requested} ${ACTION_LABEL[action]} is above the commonly cited LinkedIn ` +
    `safe limit of about ${limit} per day. The campaign will still run, and the ` +
    `worker's rate limiter paces every action, but running hot raises the risk ` +
    `of a LinkedIn restriction. Consider lowering it.`
  );
}
