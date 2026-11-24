import { defineConfig, devices } from '@playwright/test';
import { collectEnv } from './e2e/env.ts';

/**
 * E2E config: boots the real Next dev server (no mocks in the web tier) and
 * drives every panel control in Chromium.
 *
 * Env comes from `collectEnv()`: process.env, then apps/web/.env.local, then
 * apps/worker/.env (Supabase URL + service key), then the repo root
 * .env.operator-login (no-login operator). With those, the middleware
 * auto-signs-in the fixed operator and every page is reachable without a
 * login flow. Missing env fails fast with a clear message instead of 500s.
 *
 * Single worker + serial files: tests share one live database, and the
 * dashboard START test must run before the form tests create [E2E] drafts.
 */
const PORT = Number(process.env.E2E_PORT ?? 3105);
const env = collectEnv();

// Drive the installed Google Chrome by default (the same channel the worker
// uses; no browser download needed). Set E2E_BROWSER_CHANNEL="" to use
// Playwright's bundled Chromium instead (e.g. on CI without Chrome).
const CHANNEL = process.env.E2E_BROWSER_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: CHANNEL || undefined } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env,
  },
});
