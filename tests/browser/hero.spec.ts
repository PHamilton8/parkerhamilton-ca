import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const widths = [1440, 1280, 1024, 820, 768, 430, 390, 360];
const screenshotWidths = new Set([1440, 820, 390]);
const screenshotDir = path.join(process.cwd(), 'test-results', 'hero');

const installErrorCollectors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`));
  });
  return errors;
};

test('Cathedral Monument is stable across required responsive widths', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });

  await page.addInitScript(() => {
    const shifts: number[] = [];
    Object.defineProperty(window, '__heroLayoutShifts', { value: shifts });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!layoutShift.hadRecentInput && typeof layoutShift.value === 'number') shifts.push(layoutShift.value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // LayoutShift timing is supplemental evidence; unsupported browsers still run core QA.
    }
  });

  for (const width of widths) {
    const height = width <= 430 ? 844 : width <= 820 ? 1080 : 900;
    await page.setViewportSize({ width, height });
    const errors = installErrorCollectors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Researcher who builds things.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore my work', exact: true })).toBeVisible();

    const ribbons = page.locator('[data-cathedral-ribbon]');
    await expect(ribbons).toHaveCount(9);
    await expect(page.locator('[data-cathedral-stage]')).toBeVisible();

    const metrics = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('[data-cathedral-stage]');
      const paths = Array.from(document.querySelectorAll<SVGGraphicsElement>('[data-cathedral-ribbon]'));
      const stageRect = stage?.getBoundingClientRect();
      const boxes = paths.map((item) => item.getBBox());
      return {
        bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
        stageWidth: stageRect?.width ?? 0,
        stageHeight: stageRect?.height ?? 0,
        pathBoundsValid: boxes.every((box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= 580 && box.y + box.height <= 580),
      };
    });
    expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);
    expect(metrics.stageWidth).toBeGreaterThan(0);
    expect(Math.abs(metrics.stageWidth - metrics.stageHeight)).toBeLessThanOrEqual(1);
    expect(metrics.pathBoundsValid).toBe(true);
    expect(errors).toEqual([]);

    if (width === 1440) {
      await page.waitForTimeout(100);
      const performanceEvidence = await page.evaluate(() => {
        const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const scripts = resourceEntries
          .filter((entry) => entry.initiatorType === 'script')
          .map((entry) => ({
            name: new URL(entry.name).pathname,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
          }));
        const shifts = (window as Window & { __heroLayoutShifts?: number[] }).__heroLayoutShifts ?? [];
        return {
          scripts,
          totalScriptTransferSize: scripts.reduce((sum, item) => sum + item.transferSize, 0),
          totalScriptDecodedBodySize: scripts.reduce((sum, item) => sum + item.decodedBodySize, 0),
          cumulativeLayoutShift: shifts.reduce((sum, value) => sum + value, 0),
        };
      });
      fs.writeFileSync(
        path.join(screenshotDir, 'performance.json'),
        `${JSON.stringify(performanceEvidence, null, 2)}\n`,
      );
    }

    if (screenshotWidths.has(width)) {
      await page.screenshot({ path: path.join(screenshotDir, `homepage-${width}.png`), fullPage: true });
    }
  }
});

test('pointer interaction opens locally and settles exactly to the neutral state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = installErrorCollectors(page);
  await page.goto('/');
  const stage = page.locator('[data-cathedral-stage]');
  await expect(stage).toBeVisible();
  const ribbon = page.locator('[data-cathedral-ribbon="9"]');
  const initial = await ribbon.getAttribute('d');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.19);
  await page.waitForTimeout(220);
  const opened = await ribbon.getAttribute('d');
  expect(opened).not.toEqual(initial);

  await page.mouse.move(2, 2);
  await page.waitForTimeout(1100);
  await expect.poll(() => ribbon.getAttribute('d')).toBe(initial);
  expect(errors).toEqual([]);
});

test('prefers-reduced-motion keeps a coherent static resting state', async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = installErrorCollectors(page);
  await page.goto('/');
  const stage = page.locator('[data-cathedral-stage]');
  await expect(stage).toHaveAttribute('data-motion', 'reduced');
  const ribbon = page.locator('[data-cathedral-ribbon="9"]');
  const initial = await ribbon.getAttribute('d');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await page.waitForTimeout(150);
  expect(await ribbon.getAttribute('d')).toEqual(initial);
  await page.screenshot({ path: path.join(screenshotDir, 'homepage-390-reduced-motion.png'), fullPage: true });
  expect(errors).toEqual([]);
});
