import { test, expect, type Page } from '@playwright/test';

const responsiveWidths = [1440, 1024, 820, 430, 390, 360];

async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe('Wealthsimple noindex auxiliary application route', () => {
  test('is reachable, responsive, minimal, and correctly noindexed', async ({ page }, testInfo) => {
    const widths = testInfo.project.name === 'chromium' ? responsiveWidths : [390];

    for (const width of widths) {
      await page.setViewportSize({ width, height: width >= 820 ? 900 : 844 });
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const requestOrigins = new Set<string>();
      const onConsole = (message: any) => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = (error: Error) => pageErrors.push(error.message);
      const onRequest = (request: any) => requestOrigins.add(new URL(request.url()).origin);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('request', onRequest);

      const response = await page.goto('/wealthsimple-2026', { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: 'Wealthsimple 2027 - Parker Hamilton' })).toBeVisible();
      await expect(page).toHaveTitle('Wealthsimple 2027 — Parker Hamilton');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, noarchive');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://parkerhamilton.ca/wealthsimple-2026');
      await expect(page.locator('.contact-band')).toHaveCount(0);
      await expect(page.locator('video')).toHaveCount(1);

      const video = page.locator('video');
      await expect(video).toHaveAttribute('controls', '');
      await expect(video).toHaveAttribute('playsinline', '');
      await expect(video).toHaveAttribute('preload', 'metadata');
      await expect(video).toHaveAttribute('poster', '/assets/application/wealthsimple-application-video-poster.webp');
      await expect(video.locator('source')).toHaveAttribute('src', '/assets/application/wealthsimple-application-video.mp4');
      expect(await video.evaluate((element) => (element as HTMLVideoElement).autoplay)).toBe(false);

      const ratio = await video.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width / rect.height;
      });
      expect(ratio).toBeGreaterThan(1.76);
      expect(ratio).toBeLessThan(1.80);
      await assertNoDocumentOverflow(page);

      expect([...requestOrigins].every((origin) => origin === 'http://127.0.0.1:4321')).toBe(true);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('request', onRequest);
    }
  });

  test('stays out of the sitemap and portfolio UI, with healthy local media assets', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const sitemapText = await sitemap.text();
    expect(sitemapText).not.toContain('/wealthsimple-2026');
    expect((sitemapText.match(/<url>/g) ?? []).length).toBe(8);

    const home = await request.get('/');
    expect(home.status()).toBe(200);
    expect(await home.text()).not.toContain('/wealthsimple-2026');

    const poster = await request.get('/assets/application/wealthsimple-application-video-poster.webp');
    expect(poster.status()).toBe(200);
    expect((await poster.body()).byteLength).toBeGreaterThan(50_000);

    const video = await request.get('/assets/application/wealthsimple-application-video.mp4');
    expect(video.status()).toBe(200);
    expect((await video.body()).byteLength).toBeGreaterThan(20_000_000);
  });
});
