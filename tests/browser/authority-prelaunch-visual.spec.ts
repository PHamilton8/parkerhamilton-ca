import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const smithSections = [
  { id: 'strategy-title', label: 'strategy' },
  { id: 'model-title', label: 'model' },
  { id: 'public-title', label: 'public-calculator' },
  { id: 'limits-title', label: 'limitations' },
] as const;

function uniqueLineTops(rects: DOMRectList | DOMRect[]) {
  const tops: number[] = [];
  for (const rect of Array.from(rects)) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const top = Math.round(rect.top * 2) / 2;
    if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
  }
  return tops;
}

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
