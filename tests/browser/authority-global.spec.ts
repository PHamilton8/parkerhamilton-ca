import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { publicRoutes, QA_PROFILE } from './qa-profile';

const requiredWidths = [1440, 820, 390, 320] as const;
const allowedExternal = ['mailto:', 'https://www.uottawa.ca/', 'https://parkerhamilton.ca/'];

async function open(page: Page, route: string, captureErrors = false) {
  const errors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  };
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`);

  if (captureErrors) {
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
  }

  try {
    const response = await page.goto(route, { waitUntil: captureErrors ? 'load' : 'domcontentloaded' });
    expect(response?.status(), route).toBe(200);
    if (captureErrors) await page.waitForTimeout(75);
    return errors;
  } finally {
    if (captureErrors) {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }
  }
}

test.describe('Final-RC global release gates', () => {
  test('sitemap contains exactly the eight canonical public HTML routes', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/\/$/, ''));
    const expected = publicRoutes.map((route) => `https://parkerhamilton.ca${route === '/' ? '' : route}`);
    expect(locs.sort()).toEqual(expected.sort());
  });

  for (const route of publicRoutes) {
    test(`${route}: canonical, skip-link, link safety, assets and console are clean`, async ({ page, request }) => {
      const errors = await open(page, route, true);
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      const href = await canonical.getAttribute('href');
      expect(href).toBe(`https://parkerhamilton.ca${route === '/' ? '/' : route}`);

      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await skip.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();

      const unsafe = await page.locator('a[href]').evaluateAll((links, allowed) => links.flatMap((link) => {
        const href = (link as HTMLAnchorElement).getAttribute('href') ?? '';
        const bad = /(?:drive|docs)\.google\.com|localhost|127\.0\.0\.1|file:\/\/|review|staging/i.test(href);
        const external = /^https?:\/\//i.test(href) && !(allowed as string[]).some((prefix) => href.startsWith(prefix));
        return bad || external ? [href] : [];
      }), allowedExternal);
      expect(unsafe).toEqual([]);

      const assetUrls = await page.locator('img[src], video[src], source[src]').evaluateAll((nodes) => Array.from(new Set(nodes.map((node) => node.getAttribute('src')).filter((src): src is string => Boolean(src && src.startsWith('/'))))));
      for (const asset of assetUrls) {
        const response = await request.get(asset);
        expect(response.status(), `${route} -> ${asset}`).toBe(200);
        expect((await response.body()).byteLength, `${route} -> ${asset}`).toBeGreaterThan(0);
      }
      expect(errors, route).toEqual([]);
    });
  }

  for (const width of requiredWidths) {
    test(`all routes have no page-level horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
      for (const route of publicRoutes) {
        await open(page, route);
        const dims = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(dims.scroll, route).toBeLessThanOrEqual(dims.client + 1);
      }
    });
  }

  test('approved workbook downloads resolve with exact public bytes', async ({ request }) => {
    const crypto = await import('node:crypto');
    const checks = [
      ['/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx', '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a'],
      ['/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx', '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9'],
    ] as const;
    for (const [href, expected] of checks) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      const hash = crypto.createHash('sha256').update(await response.body()).digest('hex');
      expect(hash, href).toBe(expected);
    }
  });

  test('route source does not leak review/staging behavior through runtime URLs', async ({ page }) => {
    for (const route of publicRoutes) {
      await open(page, route);
      const html = await page.locator('html').innerHTML();
      expect(html, `${route} profile=${QA_PROFILE}`).not.toMatch(/https?:\/\/(?:drive|docs)\.google\.com|https?:\/\/(?:localhost|127\.0\.0\.1)|file:\/\//i);
    }
  });
});
