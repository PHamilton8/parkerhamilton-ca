import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

const stages = [
  { index: 0, label: '1. Select', image: '/assets/projects/reporting-workflow/reporting-dashboard-initial.png', summary: 'Choose a fictional record and staff member.' },
  { index: 1, label: '2. Populate', image: '/assets/projects/reporting-workflow/reporting-dashboard-populated.png', summary: 'Demographic and situational details populate automatically.' },
  { index: 2, label: '3. Generate', image: '/assets/projects/reporting-workflow/reporting-dashboard-generated.png', summary: 'The workflow autofills the standard reporting text, which can then be pasted into the portal.' },
  { index: 3, label: '4. Transfer', image: '/assets/projects/reporting-workflow/reporting-dashboard-transfer.png', summary: 'The program also fills in the relevant recipients, subject line, and body text. The user clicks the email button, which automatically creates a prefilled draft. The user reviews it and sends.' },
] as const;

async function open(page: any) {
  const response = await page.goto('/work/reporting-workflow', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

test.describe('Reporting Workflow V3 authority', () => {
  test.skip(!requiresAuthority('reporting'), 'Reporting V3 assertions are deferred for this QA profile.');

  test('route exposes exactly four named stage controls in one named group', async ({ page }) => {
    await open(page);
    const group = page.getByRole('group', { name: 'View the sequence' });
    await expect(group).toHaveCount(1);
    const buttons = group.getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (const stage of stages) await expect(group.getByRole('button', { name: stage.label })).toHaveCount(1);
    await expect(page.locator('[data-demo-stage][aria-pressed="true"]')).toHaveCount(1);
  });

  for (const stage of stages) {
    test(`stage ${stage.index + 1} synchronizes pressed state, viewport stage, image, alt, status, and live text`, async ({ page }) => {
      await open(page);
      const button = page.locator(`[data-demo-stage="${stage.index}"]`);
      await button.click();
      await expect(page.locator('[data-demo-stage][aria-pressed="true"]')).toHaveCount(1);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#reporting-workbook-viewport')).toHaveAttribute('data-stage', String(stage.index));
      await expect(page.locator('#reporting-demo-image')).toHaveAttribute('src', stage.image);
      const expectedAlt = await button.getAttribute('data-alt');
      expect(expectedAlt).toBeTruthy();
      await expect(page.locator('#reporting-demo-image')).toHaveAttribute('alt', expectedAlt!);
      await expect(page.locator('#reporting-demo-status')).toHaveText(stage.summary);
      await expect(page.locator('#reporting-demo-live')).toHaveText(stage.summary);
    });
  }

  test('keyboard activation produces the same state transition as pointer activation', async ({ page }) => {
    await open(page);
    const transfer = page.getByRole('button', { name: '4. Transfer' });
    await transfer.focus();
    await page.keyboard.press('Enter');
    await expect(transfer).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#reporting-workbook-viewport')).toHaveAttribute('data-stage', '3');
    await expect(page.locator('#reporting-demo-live')).toContainText('prefilled draft');
  });

  for (const width of [1440, 820, 390, 320]) {
    test(`V3 controls and workbook frame remain contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
      await open(page);
      const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);
      for (const selector of ['.reporting-demo-controls', '.reporting-workbook-frame']) {
        const rect = await page.locator(selector).boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.x).toBeGreaterThanOrEqual(-1);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
      }
    });
  }
});


test.describe('Reporting result metric semantics', () => {
  for (const width of [430, 390, 375, 360, 320]) {
    test(`number and unit groups remain intact at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
      await open(page);

      const groups = page.locator('.reporting-result-value');
      await expect(groups).toHaveCount(2);
      const geometry = await groups.evaluateAll((nodes) => nodes.map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops: number[] = [];
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          const top = Math.round(rect.top * 2) / 2;
          if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
        }
        return { lines: tops.length, text: node.textContent };
      }));

      expect(geometry).toEqual([
        { lines: 1, text: '45+ min' },
        { lines: 1, text: '< 10 min' },
      ]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
