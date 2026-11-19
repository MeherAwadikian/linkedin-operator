import { expect, test } from '@playwright/test';

/**
 * Smoke pass over every classic (non-panel) route: each page must render
 * without hitting an error boundary. Keeps the redesign honest about not
 * breaking existing functionality.
 */

const ROUTES = [
  '/',
  '/campaigns',
  '/likes',
  '/posts',
  '/email-campaigns',
  '/approvals',
  '/console',
  '/stats',
  '/settings',
] as const;

for (const route of ROUTES) {
  test(`classic: ${route} renders without an error boundary`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response, `no response for ${route}`).toBeTruthy();
    expect(response!.status(), `HTTP status for ${route}`).toBeLessThan(500);
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
  });
}
