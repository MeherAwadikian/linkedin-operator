import { describe, expect, it } from 'vitest';
import { LINKEDIN_DAILY_SAFE_LIMITS, dailyLimitWarning } from './linkedin-limits.ts';

describe('dailyLimitWarning', () => {
  it('returns null at or below the limit', () => {
    expect(dailyLimitWarning('connect', 25)).toBeNull();
    expect(dailyLimitWarning('connect', 1)).toBeNull();
    expect(dailyLimitWarning('post', 3)).toBeNull();
  });

  it('warns above the limit and names the numbers', () => {
    const warning = dailyLimitWarning('connect', 40);
    expect(warning).toBeTruthy();
    expect(warning).toContain('40');
    expect(warning).toContain('25');
    expect(warning).toContain('connection requests');
  });

  it('is advisory in tone, not blocking', () => {
    const warning = dailyLimitWarning('message', 80);
    expect(warning).toContain('will still run');
  });

  it('ignores non-finite input', () => {
    expect(dailyLimitWarning('like', Number.NaN)).toBeNull();
  });

  it('has a limit for every panel action', () => {
    for (const action of ['connect', 'message', 'like', 'comment', 'post'] as const) {
      expect(LINKEDIN_DAILY_SAFE_LIMITS[action]).toBeGreaterThan(0);
    }
  });
});
