import { test, expect, type Page } from '@playwright/test';

const widths = [1440, 820, 390];

async function verifyReportingPage(page: Page, width: number) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/work/reporting-workflow');
  await expect(page).toHaveTitle('Reporting Workflow Automation — Parker Hamilton');
  await expect(page.getByRole('heading', { level: 1, name: 'Reporting Workflow Automation' })).toBeVisible();
  await expect(page.getByText('45+ min', { exact: false })).toBeVisible();
  await expect(page.getByText('Parker-reported.')).toBeVisible();
  const image = page.locator('#reporting-demo-image');
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(consoleErrors).toEqual([]);
}

test('reporting workflow remains responsive and captures review screenshots', async ({ page }, testInfo) => {
  for (const width of widths) {
    await verifyReportingPage(page, width);
    await page.screenshot({
      path: testInfo.outputPath(`reporting-workflow-${width}.jpg`),
      type: 'jpeg',
      quality: 80,
      fullPage: true,
    });
  }
});

test('the synthetic demo controls remain keyboard-accessible and do not perform a real transfer', async ({ page }) => {
  await page.goto('/work/reporting-workflow');
  const generate = page.getByRole('button', { name: '3. Generate' });
  await generate.focus();
  await expect(generate).toBeFocused();
  await expect(generate).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(generate).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#reporting-demo-image')).toHaveAttribute('src', /reporting-dashboard-generated\.png/);
  for (const name of ['1. Select', '2. Populate', '3. Generate', '4. Prepare transfer']) {
    await page.getByRole('button', { name }).click();
    await expect.poll(() => page.locator('#reporting-demo-image').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByText('Controls change the illustration only. They do not copy data, submit a report, or send a message.')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.reporting-demo-button').first().evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.001);
});
