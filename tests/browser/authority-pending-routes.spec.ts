import { test, expect } from '@playwright/test';

test.describe('Owner-pending routes: generic safety/accessibility only', () => {
  test('Design Day video remains native, non-autoplay, labelled and keyboard reachable', async ({ page }) => {
    await page.goto('/work/design-day');
    const video = page.locator('video.design-video');
    await expect(video).toHaveAttribute('controls', '');
    expect(await video.evaluate((v) => (v as HTMLVideoElement).autoplay)).toBe(false);
    await expect(video).toHaveAttribute('aria-label', 'Demo of the final instrument being played.');
    await video.focus();
    await expect(video).toBeFocused();
  });

  test('Grocery disclosures preserve native keyboard-expanded state', async ({ page }) => {
    await page.goto('/work/grocery-automation');
    const summaries = page.locator('details > summary');
    const count = await summaries.count();
    for (let i = 0; i < count; i += 1) {
      const summary = summaries.nth(i); const details = summary.locator('..');
      await summary.focus(); await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
    }
  });

  test('AskWill email target is real and no empty mailto ships', async ({ page }) => {
    await page.goto('/work/askwill');
    const email = page.locator('a[href^="mailto:"]').first();
    await expect(email).toHaveCount(1);
    const href = await email.getAttribute('href');
    expect(href).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/);
  });

  test('Smith keeps calculator labels and table semantics without selecting a graph candidate', async ({ page }) => {
    await page.goto('/work/smith-manoeuvre');
    const controls = page.locator('[data-smith-calculator] input:not([type="hidden"])');
    for (let i = 0; i < await controls.count(); i += 1) {
      const control = controls.nth(i);
      const labelled = await control.evaluate((el: HTMLInputElement) => Boolean(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')));
      expect(labelled).toBe(true);
    }
    const table = page.locator('[data-smith-calculator] table').last();
    if (await table.count()) {
      await expect(table.locator('caption')).toHaveCount(1);
      expect(await table.locator('th[scope]').count()).toBeGreaterThan(0);
    }
    await expect(page.getByText(/Graph\s+[ABC]/i)).toHaveCount(0);
  });
});
