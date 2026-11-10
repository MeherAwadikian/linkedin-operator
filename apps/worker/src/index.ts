/**
 * Automation worker — the ONLY component that (later) owns the persistent,
 * logged-in Playwright context and decrypts secrets. Not serverless.
 *
 * Phase 0 scaffold: boots, logs config, and emits a heartbeat on an interval.
 * Later issues add: Supabase job-queue claim loop (#4), secrets vault (#5),
 * Playwright login (#6), checkpoint hard-stop (#7), and the action executor.
 */
import { defaultRules, loadMasterKey, Redactor } from '@lo/core';
import { startIngestServer } from './ingest.ts';
import { drainQueue, heartbeat, type JobRow } from './queue.ts';
import { createServiceClient } from './supabase.ts';

const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS ?? 5000);
const WORKER_ID = process.env.WORKER_ID ?? 'worker-local';
const INGEST_PORT = Number(process.env.WORKER_INGEST_PORT ?? 8787);

/**
 * Process-wide redactor. Decrypted secrets get registered here the moment they
 * are loaded (issue #6), so they can never survive into a log line. Every log
 * call already strips credential-shaped fields by key name.
 */
export const redactor = new Redactor();

function log(event: string, data: Record<string, unknown> = {}): void {
  const safe = redactor.redact({ ts: new Date().toISOString(), event, ...data });
  console.log(JSON.stringify(safe));
}

// Phase 0 no-op handler: echoes the job type back. Real action handlers
// (search/collect/like/comment/…) land in later issues; the executor that
// enforces rules, rate limits, and the hard-coded stop-on-checkpoint policy
// sits between this and Playwright.
async function handleJob(
  job: JobRow,
): Promise<{ status: 'done'; result: Record<string, unknown> }> {
  return { status: 'done', result: { echoed: job.type } };
}

async function main(): Promise<void> {
  const sb = createServiceClient();
  log('worker.boot', {
    node: process.version,
    heartbeatMs: HEARTBEAT_MS,
    ruleCount: defaultRules().length,
    workerId: WORKER_ID,
    supabase: sb ? 'connected' : 'not configured (local heartbeat only)',
  });

  // Secret-ingest endpoint: only when the DB + master key + shared token exist.
  const masterRaw = process.env.VAULT_MASTER_KEY;
  const ingestToken = process.env.WORKER_INGEST_TOKEN;
  if (sb && masterRaw && ingestToken) {
    startIngestServer({
      sb,
      masterKey: loadMasterKey(masterRaw),
      token: ingestToken,
      port: INGEST_PORT,
      redactor,
      log,
    });
  } else {
    log('worker.ingest_disabled', {
      reason: 'needs Supabase + VAULT_MASTER_KEY + WORKER_INGEST_TOKEN',
    });
  }

  let beat = 0;
  const timer = setInterval(() => {
    beat += 1;
    void tick(beat).catch((err: unknown) => {
      log('worker.tick_error', { message: err instanceof Error ? err.message : String(err) });
    });
  }, HEARTBEAT_MS);

  async function tick(n: number): Promise<void> {
    if (!sb) {
      log('worker.heartbeat', { beat: n });
      return;
    }
    await heartbeat(sb, WORKER_ID, { beat: n }, new Date().toISOString());
    const processed = await drainQueue(sb, WORKER_ID, handleJob);
    log('worker.heartbeat', { beat: n, processed });
  }

  const shutdown = (signal: string): void => {
    clearInterval(timer);
    log('worker.shutdown', { signal });
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  log('worker.fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
