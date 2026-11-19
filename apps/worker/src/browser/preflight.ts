import { chromium } from 'playwright';

export interface PreflightResult {
  ok: boolean;
  channel: 'chrome' | 'chromium' | 'none';
  detail: string;
}

/**
 * Browser-automation preflight: prove the runtime can actually launch a
 * browser before any LinkedIn job needs one. Tries the installed Google
 * Chrome first (the channel the real session uses), then Playwright's bundled
 * Chromium as a fallback. Launches headless, opens a blank page, closes.
 * Pure read-only; touches no profile dir and no site.
 */
export async function browserPreflight(): Promise<PreflightResult> {
  const attempts: Array<{ channel: 'chrome' | 'chromium'; options: { channel?: string } }> = [
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
      return { ok: true, channel: attempt.channel, detail: `launched + closed a blank page` };
    } catch (err) {
      lastError =
        err instanceof Error ? (err.message.split('\n')[0] ?? 'launch failed') : String(err);
    }
  }
  return {
    ok: false,
    channel: 'none',
    detail:
      `${lastError} - install Google Chrome (https://www.google.com/chrome) or run ` +
      `"pnpm --filter @lo/worker exec playwright install chromium" (Linux: add "playwright install-deps")`,
  };
}
