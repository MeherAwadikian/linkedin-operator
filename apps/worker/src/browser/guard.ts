import { classifyLinkedInPage, type PageSignal } from '@lo/core';
import type { Page } from 'playwright';

/**
 * Thrown when the current page is a LinkedIn checkpoint/CAPTCHA/restriction.
 * The operator catches this, halts the queue, marks the account `checkpoint`,
 * and hands off to the human. It is NEVER caught-and-retried.
 */
export class CheckpointError extends Error {
  constructor(
    public readonly reason: string,
    public readonly state: string,
  ) {
    super(`checkpoint: ${reason}`);
    this.name = 'CheckpointError';
  }
}

/** Read a lightweight signal (url/title/body) from the live page for classification. */
export async function readPageSignal(page: Page): Promise<PageSignal> {
  const url = page.url();
  const title = await page.title().catch(() => '');
  let bodyText = '';
  try {
    bodyText = (await page.locator('body').innerText({ timeout: 2000 })).slice(0, 4000);
  } catch {
    // body not ready / detached — url + title are enough for the classifier.
  }
  return { url, title, bodyText };
}

/** Hard-stop guard: throws CheckpointError if the page is a known block. */
export async function assertNotBlocked(page: Page): Promise<void> {
  const c = classifyLinkedInPage(await readPageSignal(page));
  if (c.blocked) throw new CheckpointError(c.reason, c.state);
}
