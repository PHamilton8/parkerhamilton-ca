import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

test.describe('Final Design Day / Grocery / AskWill / Smith authority gates', () => {
  test.skip(!requiresAuthority('designDay'), 'Final route assertions are required only for final-rc.');

  test('Design Day uses the approved replacement video and a synchronized caption track', async ({ page }) => {
    await page.goto('/work/design-day');
    const video = page.locator('video.design-video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('preload', 'metadata');
    expect(await video.evaluate((v) => (v as HTMLVideoElement).autoplay)).toBe(false);
    const track = video.locator('track[kind="captions"]');
    await expect(track).toHaveCount(1);
    await expect(track).toHaveAttribute('src', '/assets/projects/design-day/design-day-working-demo.vtt');
    const duration = await video.evaluate(async (v: HTMLVideoElement) => {
      if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
      await new Promise<void>((resolve) => v.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      return v.duration;
    });
    expect(duration).toBeGreaterThan(8.4);
    expect(duration).toBeLessThan(8.55);
  });

  test('Grocery Automation contains the final owner-approved content boundary', async ({ page }) => {
    await page.goto('/work/grocery-automation');
    await expect(page.getByRole('heading', { name: 'The workflow' })).toBeVisible();
    await expect(page.getByText(/House Rules C/i)).toBeVisible();
    await expect(page.getByText(/Sample data/i)).toHaveCount(0);
    const summaries = page.locator('details > summary');
    for (let i = 0; i < await summaries.count(); i += 1) {
      const summary = summaries.nth(i);
      const details = summary.locator('..');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
    }
  });

  test('AskWill reflects the final Sep-14 owner state with a real rebuilt-site link and no removed comparison sections', async ({ page }) => {
    await page.goto('/work/askwill');
    const askWill = page.locator('a[href^="https://askwill.ca"], a[href^="https://www.askwill.ca"]').first();
    await expect(askWill).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Structure, SEO,\s*and hosting/i })).toBeVisible();
    await expect(page.getByText(/Water Softener Repair comparison/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Other changes' })).toHaveCount(0);
    const mail = page.locator('a[href^="mailto:"]').first();
    await expect(mail).toHaveCount(1);
    expect(await mail.getAttribute('href')).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/);
  });

  test('Smith ships only Graph A with the Emerald ladder and keeps its modelling-assumption boundary', async ({ page }) => {
    await page.goto('/work/smith-manoeuvre');
    await expect(page.getByText(/Graph A\s*[—-]\s*Multi-series balances/i)).toBeVisible();
    await expect(page.getByText(/Graph B/i)).toHaveCount(0);
    await expect(page.getByText(/Graph C/i)).toHaveCount(0);
    await expect(page.getByText(/Option [23]/i)).toHaveCount(0);
    await expect(page.getByText(/100%.*deductible.*model(?:l)?ing assumption/i)).toBeVisible();
    const controls = page.locator('[data-smith-calculator] input:not([type="hidden"])');
    for (let i = 0; i < await controls.count(); i += 1) {
      const labelled = await controls.nth(i).evaluate((el: HTMLInputElement) => Boolean(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')));
      expect(labelled).toBe(true);
    }
    await expect(page.getByText(/owner review|choose graph|select option/i)).toHaveCount(0);
  });
});
