import { test, expect, type Page } from '@playwright/test';

const route = '/work/coast-fi';

async function setNumber(page: Page, label: string, value: number) {
  const input = page.getByLabel(label, { exact: false });
  await input.fill(String(value));
}

async function calculate(page: Page) {
  await page.getByRole('button', { name: 'Calculate' }).click();
}

test('Coast FI tool renders responsively and captures candidate screenshots', async ({ page }, testInfo) => {
  for (const width of [1440, 820, 390, 320]) {
    const errors: string[] = [];
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: 'Coast FI / Net Worth Calculator' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Coast FI calculator' })).toBeVisible();
    await expect(page.getByText('Required Coast threshold today')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(errors).toEqual([]);
    if ([1440, 820, 390].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`coast-fi-tool-${width}.png`), fullPage: true });
    }
  }
});

test('all four modes use the audited engine outputs and required display rounding', async ({ page }) => {
  await page.goto(route);

  await expect(page.locator('[data-primary-value]')).toHaveText('$181,290');
  await expect(page.getByText(/about \$81,290 below the Coast threshold/i)).toBeVisible();

  await page.locator('#coast-mode-b').check();
  await calculate(page);
  await expect(page.locator('[data-primary-value]')).toHaveText('About $639 / month');
  await expect(page.locator('[data-primary-note]')).toContainText('Exact model value: $638.15 per month');
  await expect(page.locator('[data-metrics]').getByText('$376,889').first()).toBeVisible();

  await page.locator('#coast-mode-c').check();
  await setNumber(page, 'Monthly contribution', 500);
  await calculate(page);
  await expect(page.getByText(/projected portfolio first reaches the Coast threshold at about age 52 years 4 months/i)).toBeVisible();
  await expect(page.locator('[data-primary-value]')).toHaveText('age 52 years 4 months');
  await expect(page.locator('[data-metrics]').getByText('$539,488').first()).toBeVisible();

  await page.locator('#coast-mode-d').check();
  await calculate(page);
  await expect(page.getByText('Retirement-target contribution')).toBeVisible();
  await expect(page.locator('[data-primary-note]')).toContainText('Exact model value:');
});

test('validation preserves entered values and handles edge cases without console failures', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(route);

  await setNumber(page, 'Current invested portfolio', 123456);
  await setNumber(page, 'Expected real annual return', 21);
  await calculate(page);
  await expect(page.getByText(/greater than −100% and no more than 20%/)).toBeVisible();
  await expect(page.getByLabel('Current invested portfolio')).toHaveValue('123456');

  await setNumber(page, 'Expected real annual return', 0);
  await calculate(page);
  await expect(page.locator('[data-primary-value]')).toHaveText('$1,000,000');

  await setNumber(page, 'Expected real annual return', 12);
  await calculate(page);
  await expect(page.getByText('High return assumption')).toBeVisible();

  await setNumber(page, 'Expected real annual return', -1);
  await calculate(page);
  await expect(page.getByText('Required Coast threshold today')).toBeVisible();

  await page.locator('#coast-mode-b').check();
  await setNumber(page, 'Target Coast age', 30);
  await calculate(page);
  await expect(page.getByText('No contribution window')).toBeVisible();

  await page.locator('#coast-mode-c').check();
  await setNumber(page, 'Monthly contribution', 0);
  await calculate(page);
  await expect(page.getByText(/does not reach the Coast threshold before retirement/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mode selector and controls are keyboard-operable and reduced-motion compatible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);

  const modeA = page.locator('#coast-mode-a');
  await modeA.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#coast-mode-b')).toBeChecked();
  await expect(page.getByLabel('Target Coast age')).toBeVisible();

  await page.getByLabel('Current age').focus();
  await expect(page.getByLabel('Current age')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Target retirement age')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('financial inputs remain client-side and are not persisted, logged, or placed in the URL', async ({ page }) => {
  const requests: string[] = [];
  const consoleMessages: string[] = [];
  await page.goto(route);
  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => consoleMessages.push(message.text()));

  const beforeUrl = page.url();
  await setNumber(page, 'Current invested portfolio', 987654);
  await setNumber(page, 'Retirement portfolio target', 2345678);
  await calculate(page);
  await page.waitForTimeout(100);

  expect(page.url()).toBe(beforeUrl);
  expect(requests).toEqual([]);
  expect(consoleMessages.join('\n')).not.toContain('987654');
  expect(consoleMessages.join('\n')).not.toContain('2345678');
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
