import { test, expect, type Page, type TestInfo } from '@playwright/test';

const widths = [1440, 1280, 1024, 820, 768, 430, 390, 360, 320];
const screenshotWidths = new Set([1440, 820, 390]);

async function verifyAskWill(page: Page, width: number, testInfo: TestInfo) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/work/askwill');
  await expect(page.getByRole('heading', { level: 1, name: "Rebuilding AskWill's digital presence" })).toBeVisible();
  await expect(page).toHaveTitle("Rebuilding AskWill's digital presence — Parker Hamilton");
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.askwill-panel img')).toHaveCount(6);
  await expect(page.getByRole('heading', { level: 3, name: 'Services' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Water Softener Repair' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Contact' })).toBeVisible();
  await expect(page.getByText('final-stage rebuild preview', { exact: false }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/staging/i);
  await expect(page.locator('body')).toContainText('AI-assisted development tooling');

  for (const image of await page.locator('.askwill-panel img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(browserErrors).toEqual([]);

  if (screenshotWidths.has(width)) {
    await page.screenshot({ path: testInfo.outputPath(`askwill-${width}.png`), fullPage: true });
  }
}

test('AskWill case study passes responsive route, asset, and provenance QA', async ({ page }, testInfo) => {
  for (const width of widths) await verifyAskWill(page, width, testInfo);
});

test('AskWill keeps the site keyboard entry path and reduced-motion behavior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work/askwill');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});
