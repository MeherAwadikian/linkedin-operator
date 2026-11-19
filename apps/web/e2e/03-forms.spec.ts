import { expect, test, type Page } from '@playwright/test';

/**
 * Every campaign form stages a draft through its real server action against
 * the real database. Each submission uses an "[E2E]" marker so the global
 * teardown deletes the rows afterwards; the drafts are never launched (the
 * START exercise runs before this file and skips when anything is staged).
 */

const STAMP = `[E2E] qa ${new Date().toISOString().slice(0, 16)}`;

async function submitAndExpectRow(page: Page, title: string) {
  await page.getByRole('button', { name: /Stage for launch|Stage/ }).click();
  await expect(
    page.getByText('Campaign staged. Push START on the dashboard to launch.'),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByTestId('campaign-list').getByText(title.slice(0, 60), { exact: false }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

test('form: Connect campaign submit creates a draft row', async ({ page }) => {
  await page.goto('/panel/connect');
  const title = `${STAMP} connect`;
  await page.locator('textarea[name="audience"]').fill(title);
  await page.locator('textarea[name="notes"]').fill('Hi {name}, test note.');
  await page.locator('input[name="max_targets"]').fill('1');
  await submitAndExpectRow(page, title);
});

test('form: Message campaign submit creates a draft row', async ({ page }) => {
  await page.goto('/panel/message');
  const title = `${STAMP} message`;
  await page.locator('textarea[name="brief"]').fill(title);
  await page.locator('textarea[name="audience"]').fill('QA audience');
  await page.locator('input[name="max_targets"]').fill('1');
  await submitAndExpectRow(page, title);
});

test('form: Like campaign submit creates a draft row', async ({ page }) => {
  await page.goto('/panel/like');
  const title = `${STAMP} like`;
  await page.locator('textarea[name="criteria"]').fill(title);
  await page.locator('input[name="max_likes"]').fill('1');
  await submitAndExpectRow(page, title);
});

test('form: Post campaign submit creates a draft row', async ({ page }) => {
  await page.goto('/panel/posts');
  const title = `${STAMP} post`;
  await page.locator('textarea[name="brief"]').fill(title);
  const count = page.locator('input[name="post_count"]');
  if (await count.count()) await count.fill('1');
  await submitAndExpectRow(page, title);
});

test('form: Comment campaign submit creates a draft row', async ({ page }) => {
  await page.goto('/panel/comment');
  const title = `${STAMP} comment`;
  await page.locator('textarea[name="brief"]').fill(title);
  await page.locator('textarea[name="audience"]').fill('QA audience');
  await page.locator('input[name="max_comments"]').fill('1');
  await submitAndExpectRow(page, title);
});

test('form: number above the daily safe limit shows the redline warning', async ({ page }) => {
  await page.goto('/panel/connect');
  await page.locator('input[name="max_targets"]').fill('50');
  await expect(page.getByText('Redline warning:')).toBeVisible();
});
