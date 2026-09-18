import { test, expect, type Page } from '@playwright/test';

type Viewport = { width: number; height: number };

async function layoutSnapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('body > main') as HTMLElement;
    const footer = document.querySelector('body > footer') as HTMLElement;
    const video = document.querySelector('.application-video-wrap video') as HTMLElement | null;
    const mainRect = main.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect() ?? null;
    return {
      innerHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      bodyMinHeight: getComputedStyle(document.body).minHeight,
      bodyDisplay: getComputedStyle(document.body).display,
      bodyFlexDirection: getComputedStyle(document.body).flexDirection,
      mainFlexGrow: getComputedStyle(main).flexGrow,
      footerPosition: getComputedStyle(footer).position,
      mainBottom: mainRect.bottom,
      footerTop: footerRect.top,
      footerBottom: footerRect.bottom,
      videoBottom: videoRect?.bottom ?? null,
      routeUtility: document.body.classList.contains('route-utility'),
    };
  });
}

async function assertUtilityShell(page: Page) {
  const state = await layoutSnapshot(page);
  expect(state.routeUtility).toBe(true);
  expect(state.bodyMinHeight).toBe('100vh');
  expect(state.bodyDisplay).toBe('flex');
  expect(state.bodyFlexDirection).toBe('column');
  expect(Number(state.mainFlexGrow)).toBeGreaterThan(0);
  expect(state.footerPosition).toBe('static');
  expect(state.documentHeight).toBeGreaterThanOrEqual(state.innerHeight);
  expect(state.footerTop).toBeGreaterThanOrEqual(state.mainBottom - 1);
  expect(Math.abs(state.footerBottom - state.documentHeight)).toBeLessThanOrEqual(1);
  if (state.documentHeight <= state.innerHeight + 1) {
    expect(Math.abs(state.footerBottom - state.innerHeight)).toBeLessThanOrEqual(1);
  }
  return state;
}

test.describe('Utility-route viewport shell', () => {
  const notFoundViewports: Viewport[] = [
    { width: 1920, height: 1080 },
    { width: 820, height: 1180 },
    { width: 430, height: 932 },
    { width: 320, height: 568 },
  ];

  for (const viewport of notFoundViewports) {
    test(`404 footer reaches the natural page bottom at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto('/404', { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      await assertUtilityShell(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  const wealthsimpleViewports: Viewport[] = [
    { width: 820, height: 1180 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 360, height: 800 },
    { width: 320, height: 568 },
  ];

  for (const viewport of wealthsimpleViewports) {
    test(`Wealthsimple footer remains below video at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto('/wealthsimple-2026', { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);
      const state = await assertUtilityShell(page);
      expect(state.videoBottom).not.toBeNull();
      expect(state.footerTop).toBeGreaterThanOrEqual((state.videoBottom ?? 0) - 1);
      if (viewport.width === 320) expect(state.documentHeight).toBeGreaterThan(viewport.height);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('normal work routes retain non-flex body shell and route-work footer spacing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/work/askwill', { waitUntil: 'networkidle' });
    const state = await page.evaluate(() => {
      const footer = document.querySelector('body > footer') as HTMLElement;
      return {
        routeWork: document.body.classList.contains('route-work'),
        bodyDisplay: getComputedStyle(document.body).display,
        footerPaddingTop: getComputedStyle(footer).paddingTop,
      };
    });
    expect(state.routeWork).toBe(true);
    expect(state.bodyDisplay).not.toBe('flex');
    expect(state.footerPaddingTop).toBe('42px');
  });
});
