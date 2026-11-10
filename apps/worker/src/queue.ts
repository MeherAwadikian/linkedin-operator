import type { SupabaseClient } from '@supabase/supabase-js';

export interface JobRow {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

export type JobOutcome = 'done' | 'failed' | 'blocked' | 'cancelled';

export interface JobResult {
  status: JobOutcome;
  result?: Record<string, unknown>;
  error?: string;
}

/** A handler turns a claimed job into a completion outcome. */
export type JobHandler = (job: JobRow) => Promise<JobResult>;

/** Claim the next runnable job via the SKIP LOCKED DB function, or null. */
export async function claimNext(sb: SupabaseClient, workerId: string): Promise<JobRow | null> {
  const { data, error } = await sb.rpc('claim_next_job', { p_worker: workerId });
  if (error) throw new Error(`claim_next_job failed: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

/** Mark a job finished through the DB function. */
export async function completeJob(
  sb: SupabaseClient,
  id: string,
  outcome: JobResult,
): Promise<void> {
  const { error } = await sb.rpc('complete_job', {
    p_id: id,
    p_status: outcome.status,
    p_result: outcome.result ?? null,
    p_error: outcome.error ?? null,
  });
  if (error) throw new Error(`complete_job failed: ${error.message}`);
}

/**
 * Drain the queue: claim → handle → complete, serially, until it is empty.
 * Serial by design — exactly one LinkedIn action at a time (plan §6). Returns
 * how many jobs were processed this drain.
 */
export async function drainQueue(
  sb: SupabaseClient,
  workerId: string,
  handle: JobHandler,
): Promise<number> {
  let processed = 0;
  for (;;) {
    const job = await claimNext(sb, workerId);
    if (!job) break;
    try {
      const outcome = await handle(job);
      await completeJob(sb, job.id, outcome);
    } catch (err) {
      await completeJob(sb, job.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    processed += 1;
  }
  return processed;
}

/** Upsert the worker's heartbeat row (UI reads this for worker health). */
export async function heartbeat(
  sb: SupabaseClient,
  workerId: string,
  info: Record<string, unknown>,
  nowIso: string,
): Promise<void> {
  const { error } = await sb
    .from('worker_heartbeats')
    .upsert({ id: workerId, last_beat: nowIso, info });
  if (error) throw new Error(`heartbeat failed: ${error.message}`);
}
