import { test, expect, type Page } from '@playwright/test';

const widths = [1440, 820, 390];

async function verifyGroceryPage(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/work/grocery-automation');
  await expect(page).toHaveTitle('Grocery Automation — Parker Hamilton');
  await expect(page.getByRole('heading', { level: 1, name: 'Grocery Automation' })).toBeVisible();
  await expect(page.getByText('SAMPLE / DEMONSTRATION DATA — NOT LIVE PRICES')).toBeVisible();
  await expect(page.getByRole('row', { name: /Day 6/ })).toHaveCount(1);
  await expect(page.getByRole('row', { name: /Demo total/ })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(consoleErrors).toEqual([]);
}

test('grocery automation is responsive and captures route screenshots', async ({ page }, testInfo) => {
  for (const width of widths) {
    await verifyGroceryPage(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`grocery-automation-${width}.jpg`),
      type: 'jpeg',
      quality: 80,
      fullPage: true,
    });
  }
});

test('grocery sample details are keyboard-accessible and reduced-motion safe', async ({ page }) => {
  await page.goto('/work/grocery-automation');
  const summary = page.getByText('Walmart sample ingredient detail', { exact: true });
  await summary.focus();
  await expect(summary).toBeFocused();
  await expect(summary).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(summary.locator('xpath=..')).toHaveAttribute('open', '');
  await expect(page.getByRole('row', { name: /Lean ground beef/ })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('.grocery-details').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
});
