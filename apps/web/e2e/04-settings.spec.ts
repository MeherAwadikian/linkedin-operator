import { expect, test } from '@playwright/test';

/**
 * Settings controls. The URL form is exercised by re-saving the CURRENT
 * values (a real round-trip through savePanelUrls with no data change). The
 * API key forms are asserted present-and-armed but never submitted: saving a
 * dummy value would overwrite the operator's real vaulted key.
 */

test('settings: page renders both sections', async ({ page }) => {
  await page.goto('/panel/settings');
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'URLs' })).toBeVisible();
});

test('settings: API key forms are present with password inputs', async ({ page }) => {
  await page.goto('/panel/settings');
  for (const label of ['Claude API key', 'Firecrawl API key']) {
    const input = page.getByLabel(label);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toBeEditable();
  }
});

test('settings: saving URLs round-trips through the server action', async ({ page }) => {
  await page.goto('/panel/settings');
  const gmail = page.getByLabel('Gmail URL');
  const linkedin = page.getByLabel('LinkedIn URL');
  // Re-save whatever is currently stored so the test mutates nothing.
  const gmailValue = await gmail.inputValue();
  const linkedinValue = await linkedin.inputValue();
  await gmail.fill(gmailValue);
  await linkedin.fill(linkedinValue);
  await page.getByRole('button', { name: 'Save URLs' }).click();
  await expect(page.getByText('URLs saved.')).toBeVisible({ timeout: 20_000 });
});
