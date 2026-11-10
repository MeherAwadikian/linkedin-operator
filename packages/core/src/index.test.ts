import { describe, expect, it } from 'vitest';
import { defaultRules } from './index.ts';

describe('defaultRules', () => {
  it('provides exactly one rule per action type', () => {
    const rules = defaultRules();
    const types = new Set(rules.map((r) => r.actionType));
    expect(types.size).toBe(rules.length);
    expect(rules.length).toBe(10);
  });

  it('gates every write action at approval level >= 1', () => {
    const rules = defaultRules();
    const writeActions = ['like', 'comment', 'post', 'message', 'connect', 'apply_easy_apply'];
    for (const a of writeActions) {
      const rule = rules.find((r) => r.actionType === a);
      expect(rule, a).toBeDefined();
      expect(rule!.approvalLevel, a).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps read-only actions at level 0', () => {
    const rules = defaultRules();
    for (const a of ['search', 'collect_feed', 'gather_profile', 'gather_company']) {
      expect(rules.find((r) => r.actionType === a)!.approvalLevel).toBe(0);
    }
  });
});
