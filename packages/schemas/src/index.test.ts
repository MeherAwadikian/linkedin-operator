import { describe, expect, it } from 'vitest';
import { RuleSchema } from './index.ts';

describe('RuleSchema', () => {
  it('accepts a valid L2 comment rule', () => {
    const parsed = RuleSchema.parse({
      actionType: 'comment',
      approvalLevel: 2,
      enabled: true,
      dailyLimit: 5,
      hourlyLimit: 2,
      minGapSeconds: 600,
      quietHours: { start: '23:00', end: '07:00' },
    });
    expect(parsed.version).toBe(1);
  });

  it('rejects an out-of-range approval level', () => {
    expect(() =>
      RuleSchema.parse({
        actionType: 'like',
        approvalLevel: 3,
        enabled: true,
        dailyLimit: 10,
        hourlyLimit: 5,
        minGapSeconds: 120,
        quietHours: null,
      }),
    ).toThrow();
  });
});
