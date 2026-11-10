import { classifyLinkedInPage } from '@lo/core';
import type { Page } from 'playwright';
import { readPageSignal } from './guard.ts';

export type LoginStatus = 'active' | 'checkpoint' | 'failed';

export interface LoginResult {
  status: LoginStatus;
  detail: string;
}

/**
 * Log into LinkedIn with the owner's vaulted credential. Reuses an existing
 * session if the feed is already reachable; otherwise fills the standard login
 * form. On any checkpoint/CAPTCHA it returns `checkpoint` (the operator hands
 * off to the human) — it never attempts to solve a challenge.
 *
 * NOTE: the login selectors (#username/#password) are LinkedIn's current ones
 * and must be re-verified against the live site on first real run.
 */
export async function loginToLinkedIn(
  page: Page,
  email: string,
  password: string,
): Promise<LoginResult> {
  // Already logged in?
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  let c = classifyLinkedInPage(await readPageSignal(page));
  if (c.state === 'feed') return { status: 'active', detail: 'existing session reused' };
  if (c.blocked) return { status: 'checkpoint', detail: c.reason };

  // Fresh login.
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
