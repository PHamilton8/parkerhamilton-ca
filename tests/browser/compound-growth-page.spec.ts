import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const route = '/work/compound-growth/';

async function expectNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('full case-study narrative preserves the evidence and model boundaries', async ({ page }) => {
  await page.goto(route);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Same numbers. Different judgments.');
  await expect(page.getByText('1,248 participants')).toBeVisible();
  await expect(page.getByText('5 randomized experiments')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Can identical compound-growth retirement projections produce different judgments/i })).toBeVisible();

  await expect(page.locator('[data-experiment-four-context]')).toContainText('N = 182');
  await expect(page.locator('[data-experiment-four-context]')).toContainText('93 saw a line graph and 89 saw a table');
  await expect(page.locator('[data-experiment-four-context]')).toContainText('statistical associations rather than independently established causal steps');

  const experimentFive = page.locator('[data-experiment-five-boundary]');
  await expect(experimentFive).toContainText('1.66 vs 1.35');
  await expect(experimentFive).toContainText('1.50');
  await expect(experimentFive).toContainText('did not establish that the connected line trajectory was uniquely responsible');

  const implications = page.locator('[data-implications]');
  await expect(implications).toContainText('planned contributions, not actual deposits or realized investing behaviour');

  const modelBoundary = page.locator('[data-model-boundary]');
  await expect(modelBoundary).toContainText('$559,461');
  await expect(modelBoundary).toContainText('$531,111');
  await expect(modelBoundary).toContainText('different default endpoints are intentional');

  const order = await page.evaluate(() => {
    const implicationsNode = document.querySelector('[data-implications]');
    const explorerNode = document.querySelector('[data-explorer]');
    const boundaryNode = document.querySelector('[data-model-boundary]');
    if (!implicationsNode || !explorerNode || !boundaryNode) return { implicationsBeforeExplorer: false, explorerBeforeBoundary: false };
    return {
      implicationsBeforeExplorer: Boolean(implicationsNode.compareDocumentPosition(explorerNode) & Node.DOCUMENT_POSITION_FOLLOWING),
      explorerBeforeBoundary: Boolean(explorerNode.compareDocumentPosition(boundaryNode) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(order).toEqual({ implicationsBeforeExplorer: true, explorerBeforeBoundary: true });

  await expect(page.getByRole('link', { name: /read the thesis|download thesis|thesis pdf/i })).toHaveCount(0);
  await expect(page.locator('[data-limitations]')).toContainText('planned hypothetical monthly contribution selections rather than deposits into real accounts');
});

test('full page reflows from desktop to 320px and produces the required review captures', async ({ page }) => {
  mkdirSync('test-results', { recursive: true });
  const captureWidths = new Set([1440, 820, 390]);

  for (const width of [1440, 1280, 1024, 820, 768, 430, 390, 360, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.goto(route);
    await expect(page.locator('[data-compound-growth-page]')).toBeVisible();
    await expect(page.locator('[data-fixed-recreation]')).toBeVisible();
    await expect(page.locator('[data-explorer]')).toBeVisible();
    await expectNoDocumentOverflow(page);

    if (captureWidths.has(width)) {
      await page.screenshot({ path: `test-results/compound-growth-page-${width}.png`, fullPage: true });
    }
  }
});
