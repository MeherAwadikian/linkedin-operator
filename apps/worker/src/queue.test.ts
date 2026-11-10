import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { drainQueue, type JobRow } from './queue.ts';

function fakeJob(id: string, type = 'noop'): JobRow {
  return { id, user_id: 'u', type, payload: {}, status: 'queued', attempts: 0 };
}

/** Minimal fake of the bits of SupabaseClient the queue uses (rpc only). */
function fakeClient(queue: JobRow[]) {
  const completed: Array<{ id: string; status: string; error: string | null }> = [];
  const sb = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'claim_next_job') return { data: queue.shift() ?? null, error: null };
      if (fn === 'complete_job') {
        completed.push({
          id: args.p_id as string,
          status: args.p_status as string,
          error: (args.p_error as string | null) ?? null,
        });
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  } as unknown as SupabaseClient;
  return { sb, completed };
}

describe('drainQueue', () => {
  it('claims and completes every job until the queue is empty', async () => {
    const { sb, completed } = fakeClient([fakeJob('a'), fakeJob('b')]);
    const processed = await drainQueue(sb, 'w1', async () => ({ status: 'done' }));
    expect(processed).toBe(2);
    expect(completed.map((c) => c.id)).toEqual(['a', 'b']);
    expect(completed.every((c) => c.status === 'done')).toBe(true);
  });

  it('marks a job failed when its handler throws, and keeps draining', async () => {
    const { sb, completed } = fakeClient([fakeJob('x'), fakeJob('y')]);
    const processed = await drainQueue(sb, 'w1', async (job) => {
      if (job.id === 'x') throw new Error('boom');
      return { status: 'done' };
    });
    expect(processed).toBe(2);
    expect(completed.find((c) => c.id === 'x')).toMatchObject({ status: 'failed', error: 'boom' });
    expect(completed.find((c) => c.id === 'y')).toMatchObject({ status: 'done' });
  });

  it('does nothing on an empty queue', async () => {
    const { sb, completed } = fakeClient([]);
    expect(await drainQueue(sb, 'w1', async () => ({ status: 'done' }))).toBe(0);
    expect(completed).toHaveLength(0);
  });
});
