import { test, expect, type Page } from '@playwright/test';

const widths = [1440, 820, 390];

async function verifyDesignDayPage(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/work/design-day');
  await expect(page).toHaveTitle('Interactive light-based musical instrument — Parker Hamilton');
  await expect(page.getByRole('heading', { level: 1, name: 'Interactive light-based musical instrument' })).toBeVisible();
  await expect(page.getByText('Museum inspiration / reference — not our prototype.')).toBeVisible();
  await expect(page.getByText('Open 1 winner, uOttawa Design Day Winter 2023')).toBeVisible();
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(consoleErrors).toEqual([]);
}

test('Design Day is responsive and captures evidence screenshots', async ({ page }, testInfo) => {
  for (const width of widths) {
    await verifyDesignDayPage(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`design-day-${width}.jpg`),
      type: 'jpeg',
      quality: 80,
      fullPage: true,
    });
  }
});

test('Design Day video controls and media alternative are accessible', async ({ page }) => {
  await page.goto('/work/design-day');
  const video = page.locator('video.design-video');
  await expect(video).toHaveAttribute('controls', '');
  await video.focus();
  await expect(video).toBeFocused();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(3);
  await expect(page.getByText('Use the player’s controls to play, pause, or adjust the sound.')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await video.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
});
