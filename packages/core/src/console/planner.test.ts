import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest, LlmResponse } from '../llm/index.ts';
import { extractJsonObject, planCommand } from './planner.ts';

function fake(reply: string, refused = false): LlmProvider {
  return {
    name: 'anthropic',
    async complete(_req: LlmRequest): Promise<LlmResponse> {
      return { text: reply, model: 'claude-opus-4-8', provider: 'anthropic', refused };
    },
  };
}

describe('extractJsonObject', () => {
  it('parses fenced JSON', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('throws when there is no object', () => {
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});

describe('planCommand', () => {
  it('parses a valid multi-step plan', async () => {
    const reply = JSON.stringify({
      steps: [
        { action: 'search', inputs: { query: 'medtech recruiters UAE' }, rationale: 'find them' },
        { action: 'gather_profile', inputs: { profile_url: 'x' }, rationale: 'enrich' },
      ],
    });
    const { plan, refused } = await planCommand(fake(reply), 'find 10 medtech recruiters');
    expect(refused).toBe(false);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]!.action).toBe('search');
  });

  it('fails closed on a hallucinated action name', async () => {
    const reply = JSON.stringify({ steps: [{ action: 'delete_account', inputs: {} }] });
    await expect(planCommand(fake(reply), 'do something weird')).rejects.toThrow(/invalid plan/);
  });

  it('defaults inputs/rationale and tolerates prose around the JSON', async () => {
    const reply = 'Here is the plan:\n```json\n{"steps":[{"action":"collect_feed"}]}\n```\nDone.';
    const { plan } = await planCommand(fake(reply), 'sweep my feed');
    expect(plan.steps[0]!.action).toBe('collect_feed');
    expect(plan.steps[0]!.inputs).toEqual({});
    expect(plan.steps[0]!.rationale).toBe('');
  });

  it('returns an empty plan on refusal', async () => {
    const { plan, refused } = await planCommand(fake('', true), 'x');
    expect(refused).toBe(true);
    expect(plan.steps).toHaveLength(0);
  });
});
