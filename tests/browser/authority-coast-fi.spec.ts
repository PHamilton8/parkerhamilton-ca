import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

async function open(page: any) {
  const response = await page.goto('/work/coast-fi', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

async function selectMode(page: any, mode: 'a' | 'b' | 'c' | 'd') {
  // The final R4 artifact styles the native radio through its visible label.
  await page.locator(`label[for="coast-mode-${mode}"]`).click();
  await expect(page.locator(`#coast-mode-${mode}`)).toBeChecked();
}

test.describe('Coast FI locked final-RC contracts', () => {
  test.skip(!requiresAuthority('coast'), 'Coast latest-authority UI assertions are required only for final-rc.');

  test('Coast by age is first/default and reset state', async ({ page }) => {
    await open(page);
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
    await selectMode(page, 'd');
    await page.locator('[data-reset]').click();
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
  });

  test('canonical mode outputs remain stable', async ({ page }) => {
    await open(page);
    await selectMode(page, 'a');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toHaveText('$181,290');
    await selectMode(page, 'b');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$639');
    await expect(page.locator('[data-metrics]')).toContainText('$376,889');

    await selectMode(page, 'c');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toHaveText('52 years 4 months old');

    await selectMode(page, 'd');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$405');
  });

  test('no graph-study A/B/C candidate controls leak into the route', async ({ page }) => {
    await open(page);
    await expect(page.getByText(/Graph\s+[ABC]/i)).toHaveCount(0);
    await expect(page.locator('[data-chart]')).toHaveCount(1);
    await expect(page.locator('[data-chart-desc]')).toHaveText('Projection from age 30 to age 65. Projected portfolio at retirement is $1,000,000. The retirement target is $1,000,000. Target Coast age: age 45');
    const details = page.locator('details').filter({ has: page.getByText('View selected projection points', { exact: true }) });
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('table')).toBeVisible();
    expect(await details.locator('tbody tr').count()).toBeGreaterThan(0);
  });
});
