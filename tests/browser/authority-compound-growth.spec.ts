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
    await page.getByRole('button', { name: 'Experimental projection', exact: true }).click();
    await expect(ratio).toHaveText('2.61');
  });

  test('simulator is the final monthly model: $0 start, $100/month, 8%, and monthly contribution dynamics', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: 'Create your own compound-growth scenarios', exact: true })).toBeVisible();
    await expect(page.getByText('Illustrative projection only. It does not model fees, taxes, inflation, return volatility, or changes in contributions.', { exact: true })).toBeVisible();
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
    // Simulator interaction cannot rewrite the frozen historical evidence.
    await page.locator('[data-fixed-view="table"]').click();
    const rows = page.locator('[data-fixed-panel="table"] tbody tr');
    await expect(rows).toHaveCount(9);
    for (let i = 0; i < fixedRows.length; i += 1) {
      const cells = rows.nth(i).locator('th,td');
      for (let j = 0; j < 3; j += 1) await expect(cells.nth(j)).toContainText(fixedRows[i][j]);
    }
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


  test('owner-approved removals preserve fixed evidence, point interaction, and Gate 0 wrapping', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await open(page);

    const metaLabels = await page.locator('.cg-page-meta dt').allTextContents();
    expect(metaLabels).toEqual(['Program', 'Population']);
    await expect(page.getByText('1,248 participants', { exact: true })).toHaveCount(0);

    const fixed = page.locator('[data-fixed-recreation]');
    await expect(fixed.getByText('Total account balance — $559,461', { exact: true })).toHaveCount(0);
    await expect(fixed.getByText('Your contributions — $48,000', { exact: true })).toHaveCount(0);
    await expect(fixed.locator('.cg-axis-title')).toHaveText('Years invested');

    const fixedPoints = fixed.locator('[role="button"][data-year]');
    await expect(fixedPoints).toHaveCount(18);
    const year40Balance = fixedPoints.nth(16);
    await year40Balance.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fixed-point-detail')).toContainText('40 years invested');
    await expect(page.locator('#fixed-point-detail')).toContainText('$559,461');
    await page.keyboard.press('Space');
    await expect(page.locator('#fixed-point-detail')).toContainText('$48,000');
    await expect(page.locator('#fixed-a11y-table')).toContainText('$559,461');
    await expect(page.locator('#fixed-a11y-table')).toContainText('$48,000');

    for (const selector of [
      '.cg-research-question .rq-line',
      '.cg-explorer-boundary__statement h2',
      '.cg-explorer-boundary__statement > .cg-explorer-instruction',
    ]) {
      const whiteSpace = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).whiteSpace);
      expect(whiteSpace, selector).toBe('normal');
    }
  });

  test('owner-approved wide alignment and responsive stacking match the locked layout contract', async ({ page }) => {
    const close = (left: number, right: number, tolerance = 2) => expect(Math.abs(left - right)).toBeLessThanOrEqual(tolerance);
    const box = async (selector: string) => {
      const value = await page.locator(selector).first().boundingBox();
      expect(value, selector).not.toBeNull();
      return value!;
    };

    await page.setViewportSize({ width: 1024, height: 900 });
    await open(page);

    const fixedHeading = page.locator('[data-fixed-recreation] .cg-module__heading');
    const fixedSwitch = page.locator('[data-fixed-recreation] .cg-switch');
    expect(await fixedSwitch.evaluate((element) => element.parentElement?.classList.contains('cg-module__heading'))).toBe(true);
    const toggleButtons = fixedSwitch.locator('button');
    for (let index = 0; index < await toggleButtons.count(); index += 1) {
      const toggleBox = await toggleButtons.nth(index).boundingBox();
      expect(toggleBox).not.toBeNull();
      expect(toggleBox!.width).toBeGreaterThanOrEqual(148);
      expect(toggleBox!.height).toBeGreaterThanOrEqual(49);
    }

    const upperLeft = await box('.cg-representation-head .cg-narrative__heading');
    const upperRight = await box('.cg-representation-head .cg-representation-note');
    const lowerLeft = await box('.cg-narrative--representation .cg-narrative-grid > div:nth-child(1)');
    const lowerRight = await box('.cg-narrative--representation .cg-narrative-grid > div:nth-child(2)');
    close(upperLeft.x, lowerLeft.x);
    close(upperLeft.width, lowerLeft.width);
    close(upperRight.x, lowerRight.x);
    close(upperRight.width, lowerRight.width);

    const year30 = await box('.cg-egr__points > div:nth-child(2)');
    const year40 = await box('.cg-egr__points > div:nth-child(3)');
    const ratio = await box('[data-egr-ratio]');
    const interpretation = await box('[data-egr-interpretation]');
    close(ratio.x + ratio.width / 2, year30.x + year30.width / 2);
    close(interpretation.x, year40.x);

    await page.setViewportSize({ width: 820, height: 900 });
    const headingLead = await box('[data-fixed-recreation] .cg-module__heading > div:first-child');
    const stackedSwitch = await box('[data-fixed-recreation] .cg-switch');
    expect(stackedSwitch.y).toBeGreaterThanOrEqual(headingLead.y + headingLead.height - 1);
    const stackedRepHeading = await box('.cg-representation-head .cg-narrative__heading');
    const stackedRepNote = await box('.cg-representation-head .cg-representation-note');
    expect(stackedRepNote.y).toBeGreaterThanOrEqual(stackedRepHeading.y + stackedRepHeading.height - 1);

    await page.setViewportSize({ width: 390, height: 844 });
    const phoneResult = await box('.cg-egr__result');
    const phoneRatio = await box('[data-egr-ratio]');
    const phoneInterpretation = await box('[data-egr-interpretation]');
    expect(phoneInterpretation.y).toBeGreaterThan(phoneRatio.y + phoneRatio.height - 1);
    close(phoneInterpretation.x, phoneResult.x, 3);
    close(phoneInterpretation.width, phoneResult.width, 3);

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
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
