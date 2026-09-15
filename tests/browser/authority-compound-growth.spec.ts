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

test.describe('Compound Growth final monthly-simulator contracts', () => {
  test.skip(!requiresAuthority('compound'), 'Compound final browser assertions are required only for final-rc.');

  test('fixed research evidence contains exactly the nine canonical historical rows', async ({ page }) => {
    await open(page);
    await page.locator('[data-fixed-view="table"]').click();
    const rows = page.locator('[data-fixed-panel="table"] tbody tr');
    await expect(rows).toHaveCount(9);
    for (let i = 0; i < fixedRows.length; i += 1) {
      const cells = rows.nth(i).locator('th,td');
      for (let j = 0; j < 3; j += 1) await expect(cells.nth(j)).toContainText(fixedRows[i][j]);
    }
  });

  test('EGR correct and equal-gains presets preserve 2.61 and 1.00 references', async ({ page }) => {
    await open(page);
    const ratio = page.locator('[data-egr-ratio]');
    await expect(ratio).toHaveText('2.61');
    await page.locator('[data-egr-preset="equal-gains"]').click();
    await expect(ratio).toHaveText('1.00');
    const correct = page.locator('[data-egr-preset="correct"], [data-egr-preset="compound"]');
    await correct.first().click();
    await expect(ratio).toHaveText('2.61');
  });

  test('simulator is the final monthly model: $0 start, $100/month, 8%, and monthly contribution dynamics', async ({ page }) => {
    await open(page);
    await expect(page.getByText(/separate from the experiments/i)).toBeVisible();
    await expect(page.locator('#cg-monthly-contribution')).toHaveValue('100');
    await expect(page.locator('#cg-annual-return')).toHaveValue('8');
    await expect(page.getByText(/starting invested balance is fixed at \$0/i)).toBeVisible();
    await expect(page.getByText(/equivalent monthly rate/i)).toBeVisible();
    await expect(page.locator('[data-summary-balance]')).toContainText('$322,108');
    await expect(page.locator('[data-summary-contributions]')).toContainText('$48,000');
    await page.locator('#cg-monthly-contribution').fill('200');
    await expect(page.locator('[data-summary-balance]')).toContainText('$644,216');
    await expect(page.locator('[data-summary-contributions]')).toContainText('$96,000');
    await expect(page.locator('body')).not.toContainText('$531,111');
  });

  test('fixed and simulator tabsets expose complete roving-tab semantics', async ({ page }) => {
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

  test('static study cards are not meaningless tab stops', async ({ page }) => {
    await open(page);
    const cards = page.locator('[data-study-card]');
    expect(await cards.count()).toBe(5);
    for (let i = 0; i < await cards.count(); i += 1) await expect(cards.nth(i)).not.toHaveAttribute('tabindex', '0');
  });

  test('invalid simulator input exposes aria-invalid and a programmatically associated field error', async ({ page }) => {
    await open(page);
    const input = page.locator('#cg-starting-age');
    await input.fill('17');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const idRefs = await input.evaluate((el: HTMLInputElement) =>
      `${el.getAttribute('aria-describedby') ?? ''} ${el.getAttribute('aria-errormessage') ?? ''}`.trim().split(/\s+/).filter(Boolean));
    expect(idRefs.length).toBeGreaterThan(0);
    let associatedText = '';
    for (const id of idRefs) associatedText += ` ${await page.locator(`#${id}`).textContent() ?? ''}`;
    expect(associatedText.trim().length).toBeGreaterThan(0);
  });

  test('interactive graph points have at least 24 by 24 CSS-pixel hit targets on phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const fixedPoints = page.locator('[data-fixed-panel="graph"] [role="button"][data-year]');
    expect(await fixedPoints.count()).toBeGreaterThan(0);
    for (let i = 0; i < await fixedPoints.count(); i += 1) {
      const box = await fixedPoints.nth(i).boundingBox();
      expect(box, `fixed graph point ${i} must have a hit box`).not.toBeNull();
      expect(box!.width, `fixed graph point ${i} width`).toBeGreaterThanOrEqual(24);
      expect(box!.height, `fixed graph point ${i} height`).toBeGreaterThanOrEqual(24);
    }
    await page.locator('[data-explorer-view="graph"]').click();
    const explorerPoints = page.locator('[data-explorer-panel="graph"] [role="button"][data-age]');
    expect(await explorerPoints.count()).toBeGreaterThan(0);
    for (let i = 0; i < await explorerPoints.count(); i += 1) {
      const box = await explorerPoints.nth(i).boundingBox();
      expect(box, `simulator graph point ${i} must have a hit box`).not.toBeNull();
      expect(box!.width, `simulator graph point ${i} width`).toBeGreaterThanOrEqual(24);
      expect(box!.height, `simulator graph point ${i} height`).toBeGreaterThanOrEqual(24);
    }
  });
});
