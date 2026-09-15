import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

async function open(page: any) {
  const response = await page.goto('/work/coast-fi', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

test.describe('Coast FI locked final-RC contracts', () => {
  test.skip(!requiresAuthority('coast'), 'Coast latest-authority UI assertions are required only for final-rc.');

  test('Coast by age is first/default and reset state', async ({ page }) => {
    await open(page);
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
    await page.locator('#coast-mode-d').check();
    await page.locator('[data-reset]').click();
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
  });

  test('canonical mode outputs remain stable', async ({ page }) => {
    await open(page);
    await page.locator('#coast-mode-b').check();
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$639');
    await expect(page.locator('[data-metrics]')).toContainText('$181,290');

    await page.locator('#coast-mode-c').check();
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('52 years, 4 months');

    await page.locator('#coast-mode-d').check();
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$405');
  });

  test('no graph-study A/B/C candidate controls leak into the route', async ({ page }) => {
    await open(page);
    await expect(page.getByText(/Graph\s+[ABC]/i)).toHaveCount(0);
    await expect(page.locator('[data-chart]')).toHaveCount(1);
    await expect(page.locator('[data-chart-desc]')).toContainText('Exact selected values are also available in the table below.');
  });
});
