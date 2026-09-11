import { test, expect, type Page } from '@playwright/test';

const widths = [1440, 1280, 1024, 820, 768, 430, 390, 360];
const routes = [
  ['compound-growth', 'Compound Growth & Retirement Investing', 'Same numbers. Different judgments.'],
  ['design-day', 'Interactive light-based musical instrument', 'Interactive light-based musical instrument'],
  ['askwill', "Rebuilding AskWill's digital presence", "Rebuilding AskWill's digital presence"],
  ['grocery-automation', 'Grocery Automation', 'Grocery Automation'],
  ['reporting-workflow', 'Reporting Workflow Automation', 'Reporting Workflow Automation'],
  ['smith-manoeuvre', 'Smith Manoeuvre Model', 'Smith Manoeuvre Model'],
  ['coast-fi', 'Coast FI / Net Worth Calculator', 'Coast FI / Net Worth Calculator'],
] as const;

async function visitHome(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/');
  for (const img of await page.locator('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    await expect.poll(() => img.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.thesis-layered figure')).toHaveCount(2);
  for (const figure of await page.locator('.thesis-layered figure').all()) await expect(figure).toBeVisible();
  await expect(page.locator('.hero-visual-zone')).toBeVisible();
  await expect(page.locator('text=LinkedIn will be added when the verified public URL is supplied.')).toHaveCount(0);
  await expect(page.locator('.browser-bar')).toContainText('askwill.ca');
  await expect(page.locator('.browser-bar')).not.toContainText(/staging/i);
  await expect(page.getByRole('heading', {level: 3, name: "Rebuilding AskWill's digital presence"})).toBeVisible();
  await expect(page.getByRole('heading', {level: 3, name: 'Line Graphs, Compound Growth & Retirement Judgments'})).toBeVisible();
  const brokenImages = await page.locator('img').evaluateAll((images) => images
    .filter((image) => {
      const element = image as HTMLImageElement;
      return !element.complete || element.naturalWidth === 0;
    })
    .map((image) => image.getAttribute('src')));
  expect(brokenImages).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(consoleErrors).toEqual([]);
}

test('the production Astro homepage passes responsive smoke checks', async ({ page }, testInfo) => {
  for (const width of widths) {
    await visitHome(page, width);
    if ([1440, 820, 390].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`homepage-${width}.png`), fullPage: true });
    }
  }
});

test('the production app provides keyboard, focus, and reduced-motion support', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Parker Hamilton, home' })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});

test('all project routes render the expected document and hero titles', async ({ page }) => {
  for (const [slug, documentTitle, heroTitle] of routes) {
    await page.goto(`/work/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toBeVisible();
    await expect(page).toHaveTitle(`${documentTitle} — Parker Hamilton`);
  }
});
