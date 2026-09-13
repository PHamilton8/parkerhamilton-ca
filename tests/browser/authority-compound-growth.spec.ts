import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

const fixedRows = [
  ['0', '$0', '$0'], ['5', '$6,000', '$7,717'], ['10', '$12,000', '$20,146'],
  ['15', '$18,000', '$40,162'], ['20', '$24,000', '$72,399'], ['25', '$30,000', '$124,316'],
  ['30', '$36,000', '$207,929'], ['35', '$42,000', '$342,589'], ['40', '$48,000', '$559,461'],
] as const;

async function open(page: any) {
  const response = await page.goto('/work/compound-growth', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

test.describe('Compound Growth canonical final-RC contracts', () => {
  test.skip(!requiresAuthority('compound'), 'Compound canonical browser assertions are required only for final-rc.');

  test('fixed table contains exactly the nine historical rows', async ({ page }) => {
    await open(page);
    await page.locator('[data-fixed-view="table"]').click();
    const rows = page.locator('[data-fixed-panel="table"] tbody tr');
    await expect(rows).toHaveCount(9);
    for (let i = 0; i < fixedRows.length; i += 1) {
      const cells = rows.nth(i).locator('th,td');
      for (let j = 0; j < 3; j += 1) await expect(cells.nth(j)).toContainText(fixedRows[i][j]);
    }
  });

  test('EGR presets round-trip 2.61 to 1.00 to 2.61', async ({ page }) => {
    await open(page);
    const ratio = page.locator('[data-egr-ratio]');
    await expect(ratio).toHaveText('2.61');
    await page.locator('[data-egr-preset="equal-gains"]').click();
    await expect(ratio).toHaveText('1.00');
    const correct = page.locator('[data-egr-preset="correct"], [data-egr-preset="compound"]');
    if (await correct.count()) {
      await correct.first().click();
    } else {
      await page.locator('[data-egr-preset]').first().click();
    }
    await expect(ratio).toHaveText('2.61');
  });

  test('explorer stays separate from experiment data and uses canonical default/edited trajectories', async ({ page }) => {
    await open(page);
    await expect(page.getByText('This adjustable projection is separate from the experiments and was not tested in them.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-summary-balance]')).toContainText('$531,111');
    await expect(page.locator('[data-summary-contributions]')).toContainText('$48,000');
    await page.locator('#cg-annual-contribution').fill('2400');
    await expect(page.locator('[data-summary-balance]')).toContainText('$1,062,222');
    await expect(page.locator('[data-summary-contributions]')).toContainText('$96,000');
  });

  test('fixed and explorer tabsets expose complete roving-tab semantics', async ({ page }) => {
    await open(page);
    for (const prefix of ['fixed', 'explorer']) {
      const tabs = page.locator(`[data-${prefix}-view]`);
      await expect(tabs).toHaveCount(2);
      await expect(tabs.first()).toHaveAttribute('role', 'tab');
      await tabs.first().focus();
      await page.keyboard.press('End');
      await expect(tabs.last()).toBeFocused();
      await page.keyboard.press('Home');
      await expect(tabs.first()).toBeFocused();
    }
  });
});
