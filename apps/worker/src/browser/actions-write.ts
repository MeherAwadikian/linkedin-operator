import type { Page } from 'playwright';

/**
 * Phase 3 write-action primitives. ⚠️ The LinkedIn selectors here are UNVERIFIED
 * — written from LinkedIn's typical DOM and MUST be tuned against the live site
 * on first run (do it headful, watching each action). Every function is
 * defensive: if it can't find its control it returns {ok:false} with a clear
 * detail rather than clicking something wrong, and it verifies the result where
 * it can (readback). These run only after the approval gate + dry-run check in
 * the operator, so nothing reaches here without the user approving it.
 */
export interface WriteResult {
  ok: boolean;
  detail: string;
}

async function firstVisible(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) return loc;
  }
  return null;
}

/** Like the post on the current page. Idempotent if already liked. */
export async function likePost(page: Page): Promise<WriteResult> {
  const btn = await firstVisible(page, [
    'button[aria-label^="React Like" i]',
    'button[aria-label*="Like" i]:not([aria-label*="comment" i])',
    'button:has-text("Like")',
  ]);
  if (!btn) return { ok: false, detail: 'like button not found (selector needs tuning)' };
  if ((await btn.getAttribute('aria-pressed')) === 'true')
    return { ok: true, detail: 'already liked' };
  await btn.click();
  await page.waitForTimeout(800);
  const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
  return { ok: pressed !== 'false', detail: `clicked like (aria-pressed=${pressed})` };
}

/** Comment on the post on the current page with the approved text. */
export async function commentPost(page: Page, text: string): Promise<WriteResult> {
  const trigger = await firstVisible(page, [
    'button[aria-label*="Comment" i]',
    'button:has-text("Comment")',
  ]);
  if (trigger) await trigger.click().catch(() => {});
  const box = await firstVisible(page, [
    'div.comments-comment-box__form .ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ]);
  if (!box) return { ok: false, detail: 'comment box not found (selector needs tuning)' };
  await box.click();
  await box.type(text, { delay: 20 });
  const submit = await firstVisible(page, [
    'button.comments-comment-box__submit-button',
    'button:has-text("Post")',
  ]);
  if (!submit) return { ok: false, detail: 'comment submit not found (selector needs tuning)' };
  await submit.click();
  await page.waitForTimeout(1200);
  const posted = await page
    .getByText(text.slice(0, 40))
    .count()
    .catch(() => 0);
  return {
    ok: posted > 0,
    detail: posted > 0 ? 'comment posted (verified in DOM)' : 'comment submitted (unverified)',
  };
}

/** Publish a feed post with the approved text (navigates to /feed first). */
export async function postUpdate(page: Page, text: string): Promise<WriteResult> {
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  const start = await firstVisible(page, [
    'button:has-text("Start a post")',
    'button[aria-label*="Start a post" i]',
  ]);
  if (!start) return { ok: false, detail: 'start-a-post button not found (selector needs tuning)' };
  await start.click();
  const box = await firstVisible(page, [
    'div.ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ]);
  if (!box) return { ok: false, detail: 'post editor not found (selector needs tuning)' };
  await box.click();
  await box.type(text, { delay: 15 });
  const submit = await firstVisible(page, [
    'button.share-actions__primary-action',
    'button:has-text("Post")',
  ]);
  if (!submit) return { ok: false, detail: 'post submit not found (selector needs tuning)' };
  await submit.click();
  await page.waitForTimeout(1500);
  return { ok: true, detail: 'post submitted (verify in the feed)' };
}

/** Send a message in the already-open thread with the approved text. */
export async function sendMessage(page: Page, text: string): Promise<WriteResult> {
  const box = await firstVisible(page, [
    'div.msg-form__contenteditable[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ]);
  if (!box) return { ok: false, detail: 'message box not found (selector needs tuning)' };
  await box.click();
  await box.type(text, { delay: 15 });
  const send = await firstVisible(page, [
    'button.msg-form__send-button',
    'button[type="submit"]:has-text("Send")',
  ]);
  if (!send) return { ok: false, detail: 'send button not found (selector needs tuning)' };
  await send.click();
  await page.waitForTimeout(1000);
  return { ok: true, detail: 'message sent (verify in the thread)' };
}

/** Send a connection request from the profile on the current page, optional note. */
export async function connectProfile(page: Page, note?: string): Promise<WriteResult> {
  const connect = await firstVisible(page, [
    'button[aria-label*="Invite" i][aria-label*="connect" i]',
    'button:has-text("Connect")',
  ]);
  if (!connect) return { ok: false, detail: 'connect button not found (selector needs tuning)' };
  await connect.click();
  await page.waitForTimeout(600);

  if (note) {
    const addNote = await firstVisible(page, [
      'button[aria-label*="Add a note" i]',
      'button:has-text("Add a note")',
    ]);
    if (addNote) {
      await addNote.click();
      const noteBox = await firstVisible(page, [
        'textarea#custom-message',
        'textarea[name="message"]',
      ]);
      if (noteBox) await noteBox.type(note, { delay: 15 });
    }
  }
  const send = await firstVisible(page, [
    'button[aria-label*="Send invitation" i]',
    'button[aria-label="Send now"]',
    'button:has-text("Send")',
  ]);
  if (!send)
    return { ok: false, detail: 'send-invitation button not found (selector needs tuning)' };
  await send.click();
  await page.waitForTimeout(1000);
  return { ok: true, detail: 'connection request sent (verify on the profile)' };
}
