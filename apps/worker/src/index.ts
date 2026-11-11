/**
 * Automation worker — the ONLY component that (later) owns the persistent,
 * logged-in Playwright context and decrypts secrets. Not serverless.
 *
 * Phase 0 scaffold: boots, logs config, and emits a heartbeat on an interval.
 * Later issues add: Supabase job-queue claim loop (#4), secrets vault (#5),
 * Playwright login (#6), checkpoint hard-stop (#7), and the action executor.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultRules, loadMasterKey, Redactor } from '@lo/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startIngestServer } from './ingest.ts';
import { LinkedInOperator } from './operator.ts';
import { drainQueue, heartbeat, type JobResult, type JobRow } from './queue.ts';
import { createServiceClient } from './supabase.ts';

const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS ?? 5000);
const WORKER_ID = process.env.WORKER_ID ?? 'worker-local';
const INGEST_PORT = Number(process.env.WORKER_INGEST_PORT ?? 8787);
const BROWSER_DIR =
  process.env.WORKER_BROWSER_DIR ?? join(homedir(), '.linkedin-operator', 'browser-profile');
const HEADLESS = process.env.WORKER_HEADLESS === '1';

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

// Fallback for jobs the LinkedIn operator does not route/handle. `noop` is the
// intentional queue self-test. ANYTHING else reaching here is an action the
// worker cannot execute (unknown type, or the operator wasn't initialized
// because Supabase / VAULT_MASTER_KEY is missing) — fail it loudly so a queued
// action never silently looks "done" without running via browser automation.
async function handleJob(job: JobRow): Promise<JobResult> {
  if (job.type === 'noop') return { status: 'done', result: { echoed: 'noop' } };
  return {
    status: 'failed',
    error: `no executor for job type "${job.type}" — worker not fully configured (Supabase + VAULT_MASTER_KEY) or unsupported action`,
  };
}

/** Queue a LinkedIn login for every configured, not-already-open account on boot. */
async function autoOpenLinkedIn(
  sb: SupabaseClient,
  log: (event: string, data?: Record<string, unknown>) => void,
): Promise<void> {
  try {
    const { data } = await sb
      .from('accounts')
      .select('user_id,login_email,status')
      .eq('platform', 'linkedin');
    const rows = (data ?? []) as Array<{
      user_id: string;
      login_email: string | null;
      status: string;
    }>;
    for (const a of rows) {
      if (!a.login_email) continue; // no credentials yet
      if (a.status === 'active' || a.status === 'checkpoint') continue; // open, or needs a human
      await sb.from('jobs_queue').insert({ user_id: a.user_id, type: 'linkedin.login', payload: {} });
      log('worker.auto_open_linkedin', { userId: a.user_id });
    }
  } catch (err) {
    log('worker.auto_open_error', { message: err instanceof Error ? err.message : String(err) });
  }
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

  const masterRaw = process.env.VAULT_MASTER_KEY;
  const masterKey = masterRaw ? loadMasterKey(masterRaw) : null;
  const ingestToken = process.env.WORKER_INGEST_TOKEN;

  // Secret-ingest endpoint: only when the DB + master key + shared token exist.
  if (sb && masterKey && ingestToken) {
    startIngestServer({ sb, masterKey, token: ingestToken, port: INGEST_PORT, redactor, log });
  } else {
    log('worker.ingest_disabled', {
      reason: 'needs Supabase + VAULT_MASTER_KEY + WORKER_INGEST_TOKEN',
    });
  }

  // LinkedIn operator (Playwright). Handles linkedin.* jobs when the DB + master
  // key are present; otherwise those jobs fall through to the no-op handler.
  const operator =
    sb && masterKey
      ? new LinkedInOperator({ sb, masterKey, userDataDir: BROWSER_DIR, headless: HEADLESS, log })
      : null;
  log('worker.operator', { linkedin: operator ? 'ready' : 'disabled', headless: HEADLESS });

  // Auto-open LinkedIn on boot: queue a login for every account that already has
  // a configured email (and isn't mid-checkpoint), so the worker logs in on its
  // own — no manual "Connect" click. Gmail needs no browser open (it sends via
  // SMTP), so there is nothing to auto-open for it.
  if (sb && operator) {
    void autoOpenLinkedIn(sb, log);
  }

  const route = (job: JobRow): Promise<JobResult> =>
    operator &&
    (job.type.startsWith('linkedin.') ||
      job.type.startsWith('command.') ||
      job.type.startsWith('campaign.') ||
      job.type.startsWith('post_campaign.') ||
      job.type.startsWith('like_campaign.') ||
      job.type.startsWith('email'))
      ? operator.handle(job)
      : handleJob(job);

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
    const processed = await drainQueue(sb, WORKER_ID, route);
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
