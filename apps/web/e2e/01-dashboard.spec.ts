import { expect, test } from '@playwright/test';

/**
 * Dashboard controls. Runs FIRST (file order, single worker) so the START
 * exercise happens before the form specs stage any [E2E] drafts.
 */

test('dashboard: hero communicates the product and shows worker status', async ({ page }) => {
  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: 'Ignition' })).toBeVisible();
  await expect(
    page.getByText('Stage connect, message, like, post, and comment campaigns'),
  ).toBeVisible();
  await expect(page.getByTestId('worker-status')).toBeVisible();
  await expect(page.getByText('Human approval on every write')).toBeVisible();
});

test('dashboard: all five campaign stat cards render and link out', async ({ page }) => {
  await page.goto('/panel');
  for (const [key, href] of [
    ['connect', '/panel/connect'],
    ['message', '/panel/message'],
    ['like', '/panel/like'],
    ['posts', '/panel/posts'],
    ['comment', '/panel/comment'],
  ] as const) {
    const card = page.getByTestId(`stat-${key}`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', href);
  }
});

test('dashboard: stat card click navigates to the campaign page', async ({ page }) => {
  await page.goto('/panel');
  await page.getByTestId('stat-connect').click();
  await expect(page).toHaveURL(/\/panel\/connect$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Connect campaign' })).toBeVisible();
});

test('dashboard: pit lane section renders (empty state or job rows)', async ({ page }) => {
  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: 'Pit lane (recent jobs)' })).toBeVisible();
});

test('dashboard: START button fires the main run (queues linkedin.login)', async ({ page }) => {
  test.skip(process.env.E2E_SKIP_START === '1', 'E2E_SKIP_START=1');
  await page.goto('/panel');
  const start = page.getByTestId('start-button');
  await expect(start).toBeVisible({ timeout: 30_000 });
  await expect(start).toBeEnabled();

  // Safety: if the operator already has real campaigns staged, clicking START
  // would launch them. Only fire when nothing is staged (then the run is just
  // a linkedin.login refresh, the worker's no-op-safe path).
  const staged = await page
    .locator('[data-testid^="stat-"] span[aria-label]')
    .evaluateAll((els) =>
      els.reduce((sum, el) => sum + Number(el.getAttribute('aria-label') ?? 0), 0),
    );
  test.skip(staged > 0, `${staged} real campaign(s) staged; not firing START over live drafts`);

  await start.click();
  await expect(page.getByText(/Firing the engine|Run ignited/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Run ignited. Queued campaigns are rolling.')).toBeVisible({
    timeout: 30_000,
  });
});
