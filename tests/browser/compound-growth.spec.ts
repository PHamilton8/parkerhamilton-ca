import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const route = '/work/compound-growth/';
const fixedRows = [
  { year: 0, contributions: 0, balance: 0 },
  { year: 5, contributions: 6000, balance: 7717 },
  { year: 10, contributions: 12000, balance: 20146 },
  { year: 15, contributions: 18000, balance: 40162 },
  { year: 20, contributions: 24000, balance: 72399 },
  { year: 25, contributions: 30000, balance: 124316 },
  { year: 30, contributions: 36000, balance: 207929 },
  { year: 35, contributions: 42000, balance: 342589 },
  { year: 40, contributions: 48000, balance: 559461 },
];

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('fixed recreation is immutable and keyboard switchable', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(route);

  const graphTab = page.getByRole('tab', { name: 'Line graph', exact: true }).first();
  const tableTab = page.getByRole('tab', { name: 'Table', exact: true }).first();
  await expect(graphTab).toHaveAttribute('aria-selected', 'true');

  const graphRows = await page.locator('.cg-fixed-point.cg-point--balance').evaluateAll((nodes) =>
    nodes.map((node) => ({
      year: Number((node as SVGElement).dataset.year),
      contributions: Number((node as SVGElement).dataset.contributions),
      balance: Number((node as SVGElement).dataset.balance),
    })),
  );
  expect(graphRows).toEqual(fixedRows);

  await graphTab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tableTab).toBeFocused();
  await expect(tableTab).toHaveAttribute('aria-selected', 'true');

  const tableValues = await page.locator('#fixed-panel-table tbody tr').evaluateAll((rows) => rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '');
    const money = (value: string) => Number(value.replace(/[^0-9.-]/g, ''));
    return { year: Number(cells[0]), contributions: money(cells[1]), balance: money(cells[2]) };
  }));
  expect(tableValues).toEqual(fixedRows);

  await page.getByLabel('Annual contribution').fill('9000');
  await page.waitForTimeout(180);
  const rowsAfterExplorerChange = await page.locator('#fixed-panel-table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '')));
  expect(rowsAfterExplorerChange.at(-1)).toEqual(['40', '$48,000', '$559,461']);
  expect(consoleErrors).toEqual([]);
});

test('EGR, Experiment 4, and five-study evidence stay on the canonical claims boundary', async ({ page }) => {
  await page.goto(route);
  await expect(page.locator('[data-egr-ratio]')).toHaveText('2.61');
  await expect(page.locator('[data-egr-source]')).toContainText('not a participant mean');

  await page.getByRole('button', { name: 'Equal gains' }).click();
  await expect(page.locator('[data-egr-ratio]')).toHaveText('1.00');
  await expect(page.locator('[data-egr-source]')).toHaveText('Illustrative equal-gains example — not participant data.');

  const studies = page.locator('[data-study-card]');
  await expect(studies).toHaveCount(5);
  await expect(studies.nth(3)).toContainText('A significant serial indirect effect was consistent with the proposed pathway.');
  await expect(studies.nth(4)).toContainText('did not establish that the connected line trajectory was uniquely responsible');
  await expect(page.locator('[data-study-progression]')).not.toContainText('Experiment 6');

  await expect(page.locator('[data-result-row="egr"]')).toContainText('1.25');
  await expect(page.locator('[data-result-row="egr"]')).toContainText('1.65');
  await expect(page.locator('[data-result-row="egr"]')).toContainText('2.61');
  await expect(page.locator('[data-result-row="growth-confidence"]')).toContainText('57.39');
  await expect(page.locator('[data-result-row="growth-confidence"]')).toContainText('67.89');
  await expect(page.locator('[data-result-row="achievability"]')).toContainText('59.19');
  await expect(page.locator('[data-result-row="achievability"]')).toContainText('72.59');
  await expect(page.locator('[data-result-row="planned-contributions"]')).toContainText('$154.92');
  await expect(page.locator('[data-result-row="planned-contributions"]')).toContainText('$195.59');
  await expect(page.getByText(/actual behaviour/i)).toHaveCount(0);

  const marker = page.getByRole('button', { name: /Growth confidence, line graph condition mean 67.89/ });
  await marker.focus();
  await expect(page.locator('#experiment-four-detail')).toContainText('SD 23.98');
  await marker.click();
  await expect(marker).toHaveClass(/is-selected/);
  await page.keyboard.press('Escape');
  await expect(marker).not.toHaveClass(/is-selected/);
});

test('separate annual explorer uses end-of-year annual timing, zero-return branch, validation, and no leakage', async ({ page }) => {
  const nonLocalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) nonLocalRequests.push(request.url());
  });
  await page.goto(route);

  const explorer = page.locator('[data-explorer]');
  await expect(explorer).toContainText('These adjustable projections were not tested in the experiments.');
  await expect(page.getByLabel('Starting age')).toHaveValue('25');
  await expect(page.getByLabel('Retirement age')).toHaveValue('65');
  await expect(page.getByLabel('Annual contribution')).toHaveValue('1200');
  await expect(page.getByLabel('Assumed annual return')).toHaveValue('10');
  await expect(explorer.locator('[data-summary-years]')).toHaveText('40');
  await expect(explorer.locator('[data-summary-contributions]')).toHaveText('$48,000');
  await expect(explorer.locator('[data-summary-balance]')).toHaveText('$531,111');

  await page.getByLabel('Starting age').fill('30');
  await page.getByLabel('Retirement age').fill('32');
  await page.getByLabel('Annual contribution').fill('100');
  await page.getByLabel('Assumed annual return').fill('10');
  await page.waitForTimeout(180);
  await expect(explorer.locator('[data-summary-years]')).toHaveText('2');
  await expect(explorer.locator('[data-summary-contributions]')).toHaveText('$200');
  await expect(explorer.locator('[data-summary-balance]')).toHaveText('$210');
  await expect(explorer.locator('[data-explorer-table] tbody tr')).toHaveCount(3);

  await page.getByLabel('Assumed annual return').fill('0');
  await page.waitForTimeout(180);
  await expect(explorer.locator('[data-summary-balance]')).toHaveText('$200');

  const stableBalance = await explorer.locator('[data-summary-balance]').textContent();
  await page.getByLabel('Retirement age').fill('30');
  await page.waitForTimeout(180);
  await expect(explorer.locator('[data-error-for="retirementAge"]')).not.toBeEmpty();
  await expect(explorer.locator('[data-summary-balance]')).toHaveText(stableBalance || '');

  await page.getByLabel('Retirement age').fill('32');
  await page.waitForTimeout(180);
  const explorerGraphTab = page.getByRole('tab', { name: 'Line graph', exact: true }).last();
  await explorerGraphTab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Table', exact: true }).last()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(explorerGraphTab).toBeFocused();
  await expect(page.locator('[data-explorer-chart] .cg-explorer-point')).toHaveCount(6);

  expect(nonLocalRequests).toEqual([]);
});

test('responsive layouts stay inside the 320px boundary and produce review captures', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 820 ? 900 : 844 });
    await page.goto(route);
    await expect(page.locator('[data-compound-growth-suite]')).toBeVisible();
    await expectNoDocumentOverflow(page);
    if (width !== 320) {
      await page.screenshot({ path: `test-results/compound-growth-tools-${width}.png`, fullPage: true });
    }
  }
});
