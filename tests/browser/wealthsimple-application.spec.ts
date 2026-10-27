import { test, expect } from '@playwright/test';

test('retired application route and dedicated assets return 404', async ({ page, request }) => {
  for (const route of ['/wealthsimple-2026', '/wealthsimple-2026/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
    await expect(page.locator('video')).toHaveCount(0);
  }
  for (const file of ['wealthsimple-application-video.mp4', 'wealthsimple-application-video-poster.webp', 'wealthsimple-application-video.vtt']) {
    expect((await request.get('/assets/application/' + file)).status()).toBe(404);
  }
  const designDay = await page.goto('/work/design-day/');
  expect(designDay?.status()).toBe(200);
  await expect(page.locator('video source')).toHaveAttribute('src', '/assets/projects/design-day/design-day-working-demo.mp4');
});
