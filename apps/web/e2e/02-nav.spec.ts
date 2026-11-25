import { expect, test } from '@playwright/test';

/** Every nav link in the panel shell routes to its page and renders the page heading. */

const LINKS = [
  { label: 'Dashboard', href: '/panel', heading: 'Ignition' },
  { label: 'Connect', href: '/panel/connect', heading: 'Connect campaign' },
  { label: 'Message', href: '/panel/message', heading: 'Message campaign' },
  { label: 'Like', href: '/panel/like', heading: 'Like campaign' },
  { label: 'Posts', href: '/panel/posts', heading: 'Posts campaign' },
  { label: 'Comment', href: '/panel/comment', heading: 'Comment campaign' },
  { label: 'Approvals', href: '/panel/approvals', heading: 'Approval queue' },
  { label: 'Settings', href: '/panel/settings', heading: 'Settings' },
] as const;

for (const link of LINKS) {
  test(`nav: ${link.label} link routes to ${link.href}`, async ({ page }) => {
    await page.goto('/panel');
    await page
      .getByRole('navigation', { name: 'Panel' })
      .getByRole('link', { name: link.label })
      .click();
    await expect(page).toHaveURL(new RegExp(`${link.href.replace(/\//g, '\\/')}$`));
    await expect(page.getByRole('heading', { level: 1, name: link.heading })).toBeVisible();
  });
}

test('nav: skip link is keyboard reachable', async ({ page }) => {
  await page.goto('/panel');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
});
