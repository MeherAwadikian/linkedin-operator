import { chromium, type BrowserContext, type Page } from 'playwright';

/**
 * Persistent browser session (plan §2, §5). ONE logged-in context, owned by the
 * worker. Uses the installed Google Chrome via `channel: 'chrome'` so there is
 * no separate Chromium download, and a stable `userDataDir` so the LinkedIn
 * session survives restarts.
 *
 * No fingerprint manipulation, stealth plugins, or automation-flag hiding —
 * default Chrome, by design (the ethical guardrail: operate transparently, do
 * not engineer to defeat detection).
 */
export interface SessionOptions {
  userDataDir: string;
  /** Headful by default so a 2FA/checkpoint hand-off is visible to the operator. */
  headless?: boolean;
  /** Installed browser channel; 'chrome' avoids the Chromium download. */
  channel?: string;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function launchSession(opts: SessionOptions): Promise<Session> {
  const context = await chromium.launchPersistentContext(opts.userDataDir, {
    headless: opts.headless ?? false,
    channel: opts.channel ?? 'chrome',
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    close: () => context.close(),
  };
}
