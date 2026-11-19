#!/usr/bin/env node
// Browser-automation preflight used by setup/verify.ps1 (and runnable by hand:
//   node setup/preflight-browser.mjs
// from the repo root). Must run with apps/worker's node_modules resolvable, so
// it imports playwright from apps/worker explicitly. Launches headless Chrome
// (channel the worker uses), falls back to bundled Chromium, opens and closes
// a blank page, and prints a single JSON status line:
//   {"event":"browser.ready","channel":"chrome"}      exit 0
//   {"event":"browser.preflight_failed","detail":..}  exit 1
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerRequire = createRequire(join(repoRoot, 'apps', 'worker', 'package.json'));

let chromium;
try {
  ({ chromium } = workerRequire('playwright'));
} catch {
  console.log(
    JSON.stringify({
      event: 'browser.preflight_failed',
      detail: 'playwright not installed - run: pnpm install',
    }),
  );
  process.exit(1);
}

const attempts = [
  { channel: 'chrome', options: { channel: 'chrome' } },
  { channel: 'chromium', options: {} },
];
let lastError = 'unknown';
for (const attempt of attempts) {
  try {
    const browser = await chromium.launch({ ...attempt.options, headless: true });
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.close();
    await browser.close();
    console.log(JSON.stringify({ event: 'browser.ready', channel: attempt.channel }));
    process.exit(0);
  } catch (err) {
    lastError = err instanceof Error ? err.message.split('\n')[0] : String(err);
  }
}
console.log(
  JSON.stringify({
    event: 'browser.preflight_failed',
    detail:
      `${lastError} - install Google Chrome (https://www.google.com/chrome) or run ` +
      '"pnpm --filter @lo/worker exec playwright install chromium"',
  }),
);
process.exit(1);
