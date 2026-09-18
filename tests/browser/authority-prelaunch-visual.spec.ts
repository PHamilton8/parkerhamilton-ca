import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const smithSections = [
  { id: 'strategy-title', label: 'strategy' },
  { id: 'model-title', label: 'model' },
  { id: 'public-title', label: 'public-calculator' },
  { id: 'limits-title', label: 'limitations' },
] as const;

test.describe('Wave 2 prelaunch visual authority — Smith section intros', () => {
  test('Smith heading lockups remain grouped at 1280, 1024, and 820', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch pixel authority is Chromium-specific.');

    for (const width of [1280, 1024, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/smith-manoeuvre');
      await page.waitForLoadState('networkidle');

      for (const section of smithSections) {
        const node = page.locator(`.case-section[aria-labelledby="${section.id}"]`);
        const geometry = await node.evaluate((element) => {
          const heading = element.querySelector('.section-heading') as HTMLElement;
          const kicker = heading.querySelector('.section-kicker') as HTMLElement;
          const title = heading.querySelector('h2') as HTMLElement;
          const reading = element.querySelector('.reading-copy') as HTMLElement;
          const headingRect = heading.getBoundingClientRect();
          const kickerRect = kicker.getBoundingClientRect();
          const titleRect = title.getBoundingClientRect();
          const readingRect = reading.getBoundingClientRect();
          return {
            display: getComputedStyle(heading).display,
            kickerLeft: kickerRect.left,
            kickerBottom: kickerRect.bottom,
            titleLeft: titleRect.left,
            titleTop: titleRect.top,
            titleBottom: titleRect.bottom,
            headingBottom: headingRect.bottom,
            readingTop: readingRect.top,
          };
        });

        expect(Math.abs(geometry.kickerLeft - geometry.titleLeft), `${section.label} left-edge alignment at ${width}px`).toBeLessThanOrEqual(2);
        expect(geometry.titleTop, `${section.label} title follows kicker at ${width}px`).toBeGreaterThan(geometry.kickerBottom);
        expect(geometry.readingTop, `${section.label} body follows heading at ${width}px`).toBeGreaterThanOrEqual(geometry.titleBottom);
        if (width === 1024) expect(geometry.display, `${section.label} mid-band Smith override`).toBe('block');
      }

      const calculator = await page.locator('.calculator-intro').evaluate((element) => {
        const kicker = element.querySelector('.section-kicker') as HTMLElement;
        const title = element.querySelector('h2') as HTMLElement;
        const kickerRect = kicker.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        return {
          className: (element as HTMLElement).className,
          kickerLeft: kickerRect.left,
          titleLeft: titleRect.left,
          titleTop: titleRect.top,
          kickerBottom: kickerRect.bottom,
        };
      });
      expect(calculator.className).toContain('calculator-intro');
      expect(calculator.className).not.toContain('section-heading');
      expect(Math.abs(calculator.kickerLeft - calculator.titleLeft)).toBeLessThanOrEqual(2);
      expect(calculator.titleTop).toBeGreaterThan(calculator.kickerBottom);
    }
  });

  test('captures focused Smith 1024 section-intro evidence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Focused evidence is captured once in Chromium.');

    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto('/work/smith-manoeuvre');
    await page.waitForLoadState('networkidle');

    for (const section of smithSections) {
      await page.locator(`.case-section[aria-labelledby="${section.id}"]`).screenshot({
        path: testInfo.outputPath(`smith-1024-section-intro-${section.label}.png`),
        animations: 'disabled',
      });
    }
  });

  test('measures the smallest local H1 measures needed for Group 4', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Rendered max-width measurement is Chromium-specific.');

    async function measure(route: string, selector: string, targetLines: number, minRem: number, maxRem: number) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      return page.locator(selector).evaluate((node, input) => {
        const heading = node as HTMLElement;
        const previous = heading.style.maxWidth;
        let found: { rem: number; lines: number } | null = null;

        for (let step = Math.round(input.minRem * 20); step <= Math.round(input.maxRem * 20); step += 1) {
          const rem = step / 20;
          heading.style.maxWidth = `${rem}rem`;
          void heading.offsetWidth;
          const range = document.createRange();
          range.selectNodeContents(heading);
          const tops: number[] = [];
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            const top = Math.round(rect.top * 2) / 2;
            if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
          }
          if (tops.length === input.targetLines) {
            found = { rem, lines: tops.length };
            break;
          }
        }

        heading.style.maxWidth = previous;
        return found;
      }, { targetLines, minRem, maxRem });
    }

    const smith = await measure('/work/smith-manoeuvre', '.smith-hero h1', 1, 62, 66);
    const reporting = await measure('/work/reporting-workflow', '.reporting-hero h1', 2, 52, 65);

    expect(smith).not.toBeNull();
    expect(reporting).not.toBeNull();
    fs.writeFileSync(
      testInfo.outputPath('h1-measurements.json'),
      JSON.stringify({ viewport: 1440, smith, reporting }, null, 2),
      'utf8',
    );
  });
});


test.describe('Wave 2 prelaunch visual authority — route-local H1 measures', () => {
  async function renderedGeometry(page: Page, selector: string, parentSelector: string, followingSelector: string) {
    return page.locator(selector).evaluate((node, input: { parentSelector: string; followingSelector: string }) => {
      const heading = node as HTMLElement;
      const parent = heading.closest(input.parentSelector) as HTMLElement;
      const following = parent.querySelector(input.followingSelector) as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(heading);
      const tops: number[] = [];
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const top = Math.round(rect.top * 2) / 2;
        if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
      }
      const headingRect = heading.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const followingRect = following.getBoundingClientRect();
      return {
        lines: tops.length,
        headingLeft: headingRect.left,
        headingRight: headingRect.right,
        headingBottom: headingRect.bottom,
        parentLeft: parentRect.left,
        parentRight: parentRect.right,
        followingTop: followingRect.top,
      };
    }, { parentSelector, followingSelector });
  }

  test('Smith H1 is exactly one rendered line at every locked width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    for (const width of [1180, 1280, 1366, 1440, 1536, 1920, 1024, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/smith-manoeuvre');
      await page.waitForLoadState('networkidle');

      const geometry = await renderedGeometry(page, '.smith-hero h1', '.smith-hero-copy', '.hero-dek');
      expect(geometry.lines, `Smith H1 line count at ${width}px`).toBe(1);
      expect(geometry.headingLeft).toBeGreaterThanOrEqual(geometry.parentLeft - 1);
      expect(geometry.headingRight).toBeLessThanOrEqual(geometry.parentRight + 1);
      expect(geometry.followingTop, `Smith lede follows H1 at ${width}px`).toBeGreaterThan(geometry.headingBottom);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Smith horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('Smith strategy H2 stays on one line through wide desktop with measured capacity', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    const measurements: Array<{
      width: number;
      lines: number;
      renderedWidth: number;
      thresholdPx: number | null;
      h2Left: number;
      h2Right: number;
      shellLeft: number;
      shellRight: number;
      readingTop: number;
      h2Bottom: number;
    }> = [];

    for (const width of [1180, 1280, 1366, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/smith-manoeuvre');
      await page.waitForLoadState('networkidle');

      const geometry = await page.locator('.case-section[aria-labelledby="strategy-title"]').evaluate((section) => {
        const heading = section.querySelector('.section-heading') as HTMLElement;
        const h2 = heading.querySelector('h2') as HTMLElement;
        const reading = section.querySelector('.reading-copy') as HTMLElement;

        const lineCount = (node: HTMLElement) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops: number[] = [];
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            const top = Math.round(rect.top * 2) / 2;
            if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
          }
          return tops.length;
        };

        const actualLines = lineCount(h2);
        const actualHeadingRect = heading.getBoundingClientRect();
        const actualH2Rect = h2.getBoundingClientRect();
        const sectionRect = (section as HTMLElement).getBoundingClientRect();
        const readingRect = reading.getBoundingClientRect();

        const previousHeadingMax = heading.style.maxWidth;
        const previousH2Max = h2.style.maxWidth;
        let thresholdPx: number | null = null;

        // Reproduce the exact rendered type at this viewport and find the first
        // width, from the generic 46rem measure up to Smith's local 58rem cap,
        // that holds this title on one line.
        for (let px = 46 * 16; px <= 58 * 16; px += 1) {
          heading.style.maxWidth = `${px}px`;
          h2.style.maxWidth = `${px}px`;
          void h2.offsetWidth;
          if (lineCount(h2) === 1) {
            thresholdPx = px;
            break;
          }
        }

        heading.style.maxWidth = previousHeadingMax;
        h2.style.maxWidth = previousH2Max;
        void h2.offsetWidth;

        return {
          lines: actualLines,
          renderedWidth: actualHeadingRect.width,
          thresholdPx,
          h2Left: actualH2Rect.left,
          h2Right: actualH2Rect.right,
          shellLeft: sectionRect.left,
          shellRight: sectionRect.right,
          readingTop: readingRect.top,
          h2Bottom: actualH2Rect.bottom,
        };
      });

      expect(geometry.lines, `Smith strategy H2 line count at ${width}px`).toBe(1);
      expect(geometry.thresholdPx, `Smith strategy H2 measured one-line threshold at ${width}px`).not.toBeNull();
      expect(
        geometry.renderedWidth,
        `Smith strategy H2 route-local measure clears measured threshold at ${width}px`,
      ).toBeGreaterThanOrEqual((geometry.thresholdPx ?? 0) + 8);
      expect(geometry.h2Left).toBeGreaterThanOrEqual(geometry.shellLeft - 1);
      expect(geometry.h2Right).toBeLessThanOrEqual(geometry.shellRight + 1);
      expect(geometry.readingTop, `Smith strategy body follows H2 at ${width}px`).toBeGreaterThan(geometry.h2Bottom);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Smith horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);

      measurements.push({ width, ...geometry });
    }

    for (const width of [1024, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/smith-manoeuvre');
      await page.waitForLoadState('networkidle');
      const alignment = await page.locator('.case-section[aria-labelledby="strategy-title"] .section-heading').evaluate((heading) => {
        const kicker = heading.querySelector('.section-kicker') as HTMLElement;
        const h2 = heading.querySelector('h2') as HTMLElement;
        const kickerRect = kicker.getBoundingClientRect();
        const h2Rect = h2.getBoundingClientRect();
        return {
          display: getComputedStyle(heading).display,
          leftDelta: Math.abs(kickerRect.left - h2Rect.left),
          titleTop: h2Rect.top,
          kickerBottom: kickerRect.bottom,
        };
      });
      if (width === 1024) {
        expect(alignment.display, 'Smith strategy intro preserves the prior 1024 stacked override').toBe('block');
      }
      expect(alignment.leftDelta, `Smith strategy kicker/H2 alignment at ${width}px`).toBeLessThanOrEqual(2);
      expect(alignment.titleTop).toBeGreaterThan(alignment.kickerBottom);
    }

    fs.writeFileSync(
      testInfo.outputPath('smith-strategy-h2-measurements.json'),
      JSON.stringify(measurements, null, 2),
      'utf8',
    );
  });

  test('AskWill H1 is exactly one rendered line through wide desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    for (const width of [1180, 1280, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/askwill');
      await page.waitForLoadState('networkidle');

      const geometry = await renderedGeometry(page, '.askwill-hero h1', '.askwill-hero', '.askwill-lede');
      expect(geometry.lines, `AskWill H1 line count at ${width}px`).toBe(1);
      expect(geometry.headingLeft).toBeGreaterThanOrEqual(geometry.parentLeft - 1);
      expect(geometry.headingRight).toBeLessThanOrEqual(geometry.parentRight + 1);
      expect(geometry.followingTop, `AskWill lede follows H1 at ${width}px`).toBeGreaterThan(geometry.headingBottom);

      const ledeMaxWidth = await page.locator('.askwill-lede').evaluate((node) => getComputedStyle(node).maxWidth);
      expect(ledeMaxWidth).toBe('832px');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `AskWill horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('Wealthsimple H1 stays on one line without changing video geometry', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    for (const width of [1180, 1280, 1366, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/wealthsimple-2026');
      await page.waitForLoadState('networkidle');

      const geometry = await renderedGeometry(page, '.application-page h1', '.application-page', '.application-video-wrap');
      expect(geometry.lines, `Wealthsimple H1 line count at ${width}px`).toBe(1);
      expect(geometry.headingLeft).toBeGreaterThanOrEqual(geometry.parentLeft - 1);
      expect(geometry.headingRight).toBeLessThanOrEqual(geometry.parentRight + 1);
      expect(geometry.followingTop, `Wealthsimple video follows H1 at ${width}px`).toBeGreaterThan(geometry.headingBottom);

      const video = await page.locator('.application-video-wrap video').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { width: rect.width, height: rect.height, aspectRatio: rect.width / rect.height, cssAspectRatio: style.aspectRatio };
      });
      expect(video.aspectRatio).toBeCloseTo(16 / 9, 2);
      expect(video.cssAspectRatio).toBe('16 / 9');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Wealthsimple horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('Reporting H1 is exactly two rendered lines at every locked width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    for (const width of [1440, 1280, 1024, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/reporting-workflow');
      await page.waitForLoadState('networkidle');

      const geometry = await renderedGeometry(page, '.reporting-hero h1', '.reporting-hero', '.reporting-result');
      expect(geometry.lines, `Reporting H1 line count at ${width}px`).toBe(2);
      expect(geometry.headingLeft).toBeGreaterThanOrEqual(geometry.parentLeft - 1);
      expect(geometry.headingRight).toBeLessThanOrEqual(geometry.parentRight + 1);
      expect(geometry.followingTop, `Reporting result follows H1 at ${width}px`).toBeGreaterThan(geometry.headingBottom);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Reporting horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('owner-accepted Design Day and Grocery 1440 H1 wraps remain unchanged', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch line-count authority is Chromium-specific.');

    for (const item of [
      { route: '/work/design-day', selector: 'h1', expectedLines: 2, label: 'Design Day' },
      { route: '/work/grocery-automation', selector: 'h1', expectedLines: 2, label: 'Grocery Automation' },
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(item.route);
      await page.waitForLoadState('networkidle');
      const lines = await page.locator(item.selector).evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops: number[] = [];
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          const top = Math.round(rect.top * 2) / 2;
          if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
        }
        return tops.length;
      });
      expect(lines, `${item.label} approved 1440 line count`).toBe(item.expectedLines);
    }
  });

  test('captures final Smith and Reporting hero evidence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Focused evidence is captured once in Chromium.');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/work/smith-manoeuvre');
    await page.waitForLoadState('networkidle');
    await page.locator('.smith-hero').screenshot({
      path: testInfo.outputPath('smith-1440-hero.png'),
      animations: 'disabled',
    });

    await page.goto('/work/reporting-workflow');
    await page.waitForLoadState('networkidle');
    await page.locator('.reporting-hero').screenshot({
      path: testInfo.outputPath('reporting-1440-hero.png'),
      animations: 'disabled',
    });
  });
});
