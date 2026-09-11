import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const routes = [
  { key: 'home', path: '/', h1: 'I like figuring things out.', title: 'Parker Hamilton' },
  { key: 'design-day', path: '/work/design-day', h1: 'Design Day 2023', title: 'Design Day 2023 — Parker Hamilton' },
  { key: 'reporting-workflow', path: '/work/reporting-workflow', h1: 'Automating a Reporting Workflow', title: 'Automating a Reporting Workflow — Parker Hamilton' },
  { key: 'grocery-automation', path: '/work/grocery-automation', h1: 'Grocery Automation', title: 'Grocery Automation — Parker Hamilton' },
  { key: 'askwill', path: '/work/askwill', h1: 'Rebuilding AskWill.ca', title: 'Rebuilding AskWill.ca — Parker Hamilton' },
  { key: 'coast-fi', path: '/work/coast-fi', h1: 'Coast FI / Net Worth Calculator', title: 'Coast FI / Net Worth Calculator — Parker Hamilton' },
  { key: 'compound-growth', path: '/work/compound-growth', h1: 'Compound Growth & Retirement Investing', title: 'Compound Growth & Retirement Investing — Parker Hamilton' },
  { key: 'smith-manoeuvre', path: '/work/smith-manoeuvre', h1: 'Smith Manoeuvre Model', title: 'Smith Manoeuvre Model — Parker Hamilton' },
] as const;

const inspectWidths = [1440, 1280, 1024, 820, 768, 430, 390, 360, 320];
const baselineWidths = new Set([1440, 820, 390]);
const baselineRoot = path.join(process.cwd(), 'artifacts', 'baseline');

async function collectPageErrors(page: Page) {
  const errors: string[] = [];
  const onConsole = (message: any) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); };
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function activateLazyMedia(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(120);
}

async function assertImagesHealthy(page: Page) {
  const broken = await page.locator('img').evaluateAll((images) => images
    .filter((image) => {
      const element = image as HTMLImageElement;
      return !element.complete || element.naturalWidth === 0;
    })
    .map((image) => image.getAttribute('src')));
  expect(broken).toEqual([]);
}

async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe('copy-locked integrated visual-review baseline', () => {
  for (const route of routes) {
    test(`${route.key}: responsive baseline and screenshots`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'Canonical baseline screenshots are captured once in Chromium.');
      for (const width of inspectWidths) {
        await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
        const monitor = await collectPageErrors(page);
        const response = await page.goto(route.path, { waitUntil: 'networkidle' });
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: route.h1 })).toBeVisible();
        await expect(page).toHaveTitle(route.title);
        await assertNoDocumentOverflow(page);

        if (baselineWidths.has(width)) {
          await activateLazyMedia(page);
          await assertImagesHealthy(page);
          await page.evaluate(() => window.scrollTo(0, 0));
          const directory = path.join(baselineRoot, route.key);
          fs.mkdirSync(directory, { recursive: true });
          await page.screenshot({ path: path.join(directory, `${route.key}-${width}.png`), fullPage: true, animations: 'disabled' });
        }

        expect(monitor.errors).toEqual([]);
        monitor.stop();
      }
    });
  }

  test('keyboard, skip link, internal navigation, and site utility routes work', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await skipLink.press('Enter');
    await expect(page.locator('main')).toBeFocused();

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const sitemapText = await sitemap.text();
    for (const route of routes) expect(sitemapText).toContain(route.path === '/' ? 'https://parkerhamilton.ca/' : `https://parkerhamilton.ca${route.path}`);

    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap: https://parkerhamilton.ca/sitemap.xml');

    const notFound = await page.goto('/this-route-does-not-exist');
    expect(notFound?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('project interactions and downloadable assets remain functional', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'State screenshots are captured once in Chromium.');
    fs.mkdirSync(path.join(baselineRoot, 'states'), { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/work/reporting-workflow');
    const generate = page.getByRole('button', { name: '3. Generate' });
    await generate.click();
    await expect(generate).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#reporting-demo-status')).toContainText('autofills the standard reporting text');
    await page.screenshot({ path: path.join(baselineRoot, 'states', 'reporting-generated-1440.png'), fullPage: true, animations: 'disabled' });

    await page.goto('/work/coast-fi');
    const coastByAge = page.getByLabel('Coast by age');
    await coastByAge.check();
    await expect(page.getByRole('spinbutton', { name: 'Target Coast age', exact: true })).toBeVisible();
    await expect(page.getByText('The model estimates a monthly contribution of about', { exact: false })).toBeVisible();
    await page.screenshot({ path: path.join(baselineRoot, 'states', 'coast-by-age-1440.png'), fullPage: true, animations: 'disabled' });

    await page.goto('/work/compound-growth');
    const tableTab = page.getByRole('tab', { name: 'Table' }).first();
    await tableTab.click();
    await expect(tableTab).toHaveAttribute('aria-selected', 'true');
    const equalGains = page.getByRole('button', { name: 'Equal gains' });
    await equalGains.click();
    await expect(page.getByText('1.00 = equal perceived gains across the two intervals.')).toBeVisible();
    const explorerGraph = page.getByRole('tab', { name: 'Line graph' }).last();
    await explorerGraph.click();
    await expect(explorerGraph).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: path.join(baselineRoot, 'states', 'compound-interactions-1440.png'), fullPage: true, animations: 'disabled' });

    await page.goto('/work/smith-manoeuvre');
    await expect(page.getByText('Illustrative net-position difference', { exact: true })).toBeVisible();
    const details = page.locator('details').filter({ has: page.getByText('Year-by-year details', { exact: true }) }).first();
    if (await details.count()) await details.locator('summary').click();
    await page.screenshot({ path: path.join(baselineRoot, 'states', 'smith-default-1440.png'), fullPage: true, animations: 'disabled' });

    for (const asset of [
      '/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx',
      '/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx',
      '/assets/projects/design-day/design-day-working-demo.mp4',
    ]) {
      const response = await request.get(asset);
      expect(response.status(), asset).toBe(200);
      expect((await response.body()).byteLength, asset).toBeGreaterThan(1000);
    }
  });

  test('all routes smoke-test in each configured browser', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of routes) {
      const monitor = await collectPageErrors(page);
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: route.h1 })).toBeVisible();
      await assertNoDocumentOverflow(page);
      expect(monitor.errors).toEqual([]);
      monitor.stop();
    }
  });
});
