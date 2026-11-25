import { classifyLinkedInPage } from '@lo/core';
import type { Page } from 'playwright';
import { readPageSignal } from './guard.ts';

export type LoginStatus = 'active' | 'checkpoint' | 'failed';

export interface LoginResult {
  status: LoginStatus;
  detail: string;
}

/**
 * Get LinkedIn into a logged-in state. The preferred path needs NO stored
 * credentials: if the persistent browser is already signed in (the operator
 * logged in by hand through the headful window / noVNC, or a prior session was
 * reused), we just use that. Stored email+password are optional and only used
 * to fill the login form when the session is not already authenticated.
 *
 * On any checkpoint/CAPTCHA it returns `checkpoint` (the operator hands off to
 * the human) — it never attempts to solve a challenge. If there is no live
 * session and no stored credentials, it also returns `checkpoint` asking the
 * operator to sign in through the browser.
 *
 * NOTE: the login selectors (#username/#password) are LinkedIn's current ones
 * and must be re-verified against the live site on first real run.
 */
export async function loginToLinkedIn(
  page: Page,
  email?: string | null,
  password?: string | null,
): Promise<LoginResult> {
  // Preferred: already logged in (manual sign-in via noVNC, or a reused session).
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  let c = classifyLinkedInPage(await readPageSignal(page));
  if (c.state === 'feed') return { status: 'active', detail: 'existing session reused' };
  if (c.blocked) return { status: 'checkpoint', detail: c.reason };

  // Not signed in and no stored credentials to fill the form with: ask the
  // operator to log in through the browser window instead of failing.
  if (!email || !password) {
    return {
      status: 'checkpoint',
      detail: 'not signed in — open the browser (noVNC) and log in to LinkedIn, then retry',
    };
  }

  // Fresh login with stored credentials.
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('button[type=submit]')]);
  await page.waitForTimeout(1500);

  c = classifyLinkedInPage(await readPageSignal(page));
  if (c.state === 'feed') return { status: 'active', detail: 'logged in' };
  if (c.blocked) return { status: 'checkpoint', detail: c.reason };
  return { status: 'failed', detail: `unexpected post-login state: ${c.state} (${page.url()})` };
}
