import { describe, expect, it } from 'vitest';
import { initialJobStatus, isWriteAction, resolveApprovalLevel } from './approval.ts';

describe('isWriteAction', () => {
  it('classifies write vs read-only actions', () => {
    for (const a of [
      'like',
      'comment',
      'post',
      'message',
      'connect',
      'apply_easy_apply',
    ] as const) {
      expect(isWriteAction(a), a).toBe(true);
    }
    for (const a of ['search', 'collect_feed', 'gather_profile', 'gather_company'] as const) {
      expect(isWriteAction(a), a).toBe(false);
    }
  });
});

describe('resolveApprovalLevel', () => {
  it('passes the configured level through when not in dry-run', () => {
    expect(resolveApprovalLevel('like', 1, false)).toBe(1);
    expect(resolveApprovalLevel('search', 0, false)).toBe(0);
  });

  it('forces every write action to L2 in dry-run', () => {
    expect(resolveApprovalLevel('like', 1, true)).toBe(2);
    expect(resolveApprovalLevel('comment', 0, true)).toBe(2);
    expect(resolveApprovalLevel('post', 2, true)).toBe(2);
  });

  it('leaves read-only actions untouched in dry-run', () => {
    expect(resolveApprovalLevel('search', 0, true)).toBe(0);
    expect(resolveApprovalLevel('collect_feed', 0, true)).toBe(0);
  });
});

describe('initialJobStatus', () => {
  it('maps levels to the right starting status', () => {
    expect(initialJobStatus(0)).toBe('approved');
    expect(initialJobStatus(1)).toBe('approved');
    expect(initialJobStatus(2)).toBe('awaiting_approval');
  });
});
