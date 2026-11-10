/**
 * Automation worker — the ONLY component that (later) owns the persistent,
 * logged-in Playwright context and decrypts secrets. Not serverless.
 *
 * Phase 0 scaffold: boots, logs config, and emits a heartbeat on an interval.
 * Later issues add: Supabase job-queue claim loop (#4), secrets vault (#5),
 * Playwright login (#6), checkpoint hard-stop (#7), and the action executor.
 */
import { defaultRules } from '@lo/core';

const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS ?? 5000);

function log(event: string, data: Record<string, unknown> = {}): void {
  // Structured line logging. A redaction layer is added in issue #5 before any
  // secret ever reaches this path.
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

async function main(): Promise<void> {
  log('worker.boot', {
    node: process.version,
    heartbeatMs: HEARTBEAT_MS,
    ruleCount: defaultRules().length,
  });

  let beat = 0;
  const timer = setInterval(() => {
    beat += 1;
    log('worker.heartbeat', { beat });
  }, HEARTBEAT_MS);

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
