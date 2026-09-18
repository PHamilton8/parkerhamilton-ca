import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';
import { createHash } from 'node:crypto';

test.describe('Design Day accessibility gate', () => {
  test('Design Day uses the approved replacement video and a synchronized caption track', async ({ page }) => {
    await page.goto('/work/design-day');
    const video = page.locator('video.design-video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('preload', 'metadata');
    expect(await video.evaluate((v) => (v as HTMLVideoElement).autoplay)).toBe(false);
    const track = video.locator('track[kind="captions"]');
    await expect(track).toHaveCount(1);
    await expect(track).toHaveAttribute('src', '/assets/projects/design-day/design-day-working-demo.vtt');
    expect(await track.getAttribute('default')).toBeNull();
    await expect(video).toHaveAttribute('aria-describedby', 'design-video-equivalent');
    const equivalent = page.locator('#design-video-equivalent');
    await expect(equivalent).toHaveCount(1);
    await expect(equivalent).toHaveClass(/\bsr-only\b/);
    const equivalentStyle = await equivalent.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        position: style.position,
        width: style.width,
        height: style.height,
        overflow: style.overflow,
      };
    });
    expect(equivalentStyle).toEqual({ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' });
    await expect(page.locator('details.design-demo-transcript')).toHaveCount(0);
    await expect(page.getByText('Video transcript and visual description', { exact: true })).toHaveCount(0);
    await video.focus();
    await expect(video).toBeFocused();
    const duration = await video.evaluate(async (v: HTMLVideoElement) => {
      if (Number.isFinite(v.duration) && v.duration > 0) return v.duration;
      await new Promise<void>((resolve) => v.addEventListener('loadedmetadata', () => resolve(), { once: true }));
      return v.duration;
    });
    expect(duration).toBeCloseTo(8.475, 3);
    await expect(track).toHaveAttribute('srclang', 'en');
    await track.evaluate((el: HTMLTrackElement) => { el.track.mode = 'showing'; });
    await expect.poll(() => track.evaluate((el: HTMLTrackElement) => el.readyState)).toBe(2);
    const cues = await track.evaluate((el: HTMLTrackElement) => Array.from(el.track.cues ?? []).map(cue => ({ start: cue.startTime, end: cue.endTime })));
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(8.475);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  });
});

test.describe('Final Grocery / AskWill / Smith / Wealthsimple authority gates', () => {
  test.skip(!requiresAuthority('designDay'), 'Final route assertions are required only for final-rc.');

  test('Wealthsimple final owner-confirmed native captions load, stay within the exact media, and preserve verbatim wording', async ({ page, request }, testInfo) => {
    await page.goto('/wealthsimple-2026');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wealthsimple 2027 - Parker Hamilton');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, noarchive');
    await expect(page.locator('.contact-band')).toHaveCount(0);
    const video = page.locator('video');
    const track = video.locator('track[kind="captions"]');
    await expect(track).toHaveCount(1);
    await expect(track).toHaveAttribute('srclang', 'en');
    await expect(track).toHaveAttribute('src', '/assets/application/wealthsimple-application-video.vtt');
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => Number.isFinite(el.duration))).toBe(true);
    // The exact MP4 has 101.652s container/audio and 101.6348667s video.
    // WebKit reports the rounded video stream; the other engines report the container.
    expect(await video.evaluate((el: HTMLVideoElement) => el.duration)).toBeCloseTo(testInfo.project.name === 'webkit' ? 101.635 : 101.652, 3);
    for (const [url, hash] of [
      ['/assets/application/wealthsimple-application-video.mp4', '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14'],
      ['/assets/application/wealthsimple-application-video-poster.webp', 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec'],
    ]) {
      const asset = await request.get(url);
      expect(asset.status()).toBe(200);
      expect(createHash('sha256').update(await asset.body()).digest('hex')).toBe(hash);
    }
    // Native caption preferences may initially disable the default track.
    // Select English explicitly, as a viewer can using the native player.
    await track.evaluate((el: HTMLTrackElement) => { el.track.mode = 'showing'; });
    await expect.poll(() => track.evaluate((el: HTMLTrackElement) => el.readyState)).toBe(2);
    const cues = await track.evaluate((el: HTMLTrackElement) => Array.from(el.track.cues ?? []).map(cue => ({ start: cue.startTime, end: cue.endTime, text: (cue as VTTCue).text })));
    expect(cues.length).toBeGreaterThan(0);
    let priorEnd = 0;
    for (const cue of cues) {
      expect(cue.start).toBeGreaterThanOrEqual(priorEnd);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(101.652);
      priorEnd = cue.end;
    }
    const transcript = cues.map(cue => cue.text).join(' ').replace(/\s+/g, ' ');
    expect(transcript).toContain('a six experiment program');
    expect(transcript).toContain('Five experiments later, my family still groans when the compound growth soapbox comes out.');
    expect(transcript).not.toMatch(/BLOCKED|NOT RELEASE AUTHORITY|\[in\/out\]/i);
    await video.evaluate(async (el: HTMLVideoElement) => { el.muted = true; await el.play(); });
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
    await video.evaluate((el: HTMLVideoElement) => el.pause());
  });

  test('Grocery Automation contains the final owner-approved content boundary', async ({ page }) => {
    await page.goto('/work/grocery-automation');
    await expect(page.getByRole('heading', { name: 'The workflow' })).toBeVisible();
    const rules = page.locator('[aria-label="House Rules treatment C"]');
    await expect(rules).toBeVisible();
    await expect(rules.locator('h3')).toHaveText(['Scale', 'Preferences', 'Constraints', 'Pantry']);
    await expect(rules.locator('p')).toHaveText([
      'Exactly 6 dinners for 9 adult portions.',
      'Chicken thighs, ground beef, tacos, smash burgers, Greek and Mexican flavours.',
      "Pork-free and shellfish-free, and no expensive proteins just because they happened to be on sale (sorry beef tenderloin, $2 off per kilo still doesn't make you a budget protein).",
      'Basic oil, seasonings, salt, pepper, oregano, and garlic powder were already available.',
    ]);
    await expect(page.getByText(/Sample data/i)).toHaveCount(0);
    // The exact authority has separate desktop and mobile sample presentations.
    // Exercise every visible disclosure in both responsive presentations.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const summaries = page.locator('details > summary:visible');
      await expect(summaries).toHaveCount(2);
      for (let i = 0; i < await summaries.count(); i += 1) {
      const summary = summaries.nth(i);
      const details = summary.locator('..');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
      }
    }
  });

  test('AskWill reflects the final Sep-14 owner state with a real rebuilt-site link and no removed comparison sections', async ({ page }) => {
    await page.goto('/work/askwill');
    const askWill = page.locator('a.askwill-live-link');
    await expect(askWill).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      await expect(askWill.nth(i)).toHaveAttribute('href', 'https://askwill.ca/');
      await expect(askWill.nth(i)).toHaveAttribute('target', '_blank');
      await expect(askWill.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(page.getByRole('heading', { name: /Structure, SEO,\s*and hosting/i })).toBeVisible();
    await expect(page.getByText(/Water Softener Repair/i)).toHaveCount(0);
    await expect(page.locator('[data-kind="repair"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Other changes' })).toHaveCount(0);
    const mail = page.locator('a[href^="mailto:"]').first();
    await expect(mail).toHaveCount(1);
    expect(await mail.getAttribute('href')).toMatch(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/);
  });

  test('Smith ships only Graph A with the Emerald ladder and keeps its modelling-assumption boundary', async ({ page }) => {
    await page.goto('/work/smith-manoeuvre');
    await expect(page.getByRole('heading', { name: 'Multi-series balances', exact: true })).toBeVisible();
    const chart = page.locator('[data-chart-a]');
    await expect(chart).toHaveCount(1);
    await expect(chart.locator('[data-chart-path]')).toHaveCount(5);
    for (const [key, color, dash] of [
      ['smithClosingMortgage', '#5A7D67', '7 5'],
      ['smithClosingHeloc', '#14A76C', '7 5'],
      ['smithClosingPortfolio', '#0B4A33', ''],
      ['baselineClosingMortgage', '#9AA29F', '3 4'],
      ['baselineClosingPortfolio', '#232A28', ''],
    ]) {
      const line = chart.locator(`[data-chart-path="${key}"]`);
      await expect(line).toHaveAttribute('stroke', color);
      expect((await line.getAttribute('d'))?.length).toBeGreaterThan(0);
      expect(await line.getAttribute('stroke-dasharray') ?? '').toBe(dash);
    }
    await expect(page.getByText(/Graph B/i)).toHaveCount(0);
    await expect(page.getByText(/Graph C/i)).toHaveCount(0);
    await expect(page.getByText(/Option [23]/i)).toHaveCount(0);
    await page.getByText('Detailed assumptions and limitations', { exact: true }).click();
    await expect(page.getByText('The estimated tax offset is only an illustration. The public UI fixes the model assumption at 100% of modeled HELOC interest eligible before applying the marginal tax-rate proxy. Actual deductibility depends on the use and tracing of borrowed funds, income-earning purpose, legal obligations, record keeping, and other tax rules. This calculator does not determine tax eligibility.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-smith-field="deductibleInterestAssumption"]')).toHaveCount(0);
    await expect(page.locator('[data-smith-calculator]')).toHaveAttribute('data-fixed-deductible-interest-assumption', '1');
    const details = page.locator('details').filter({ has: page.getByText('View yearly model data', { exact: true }) });
    await details.locator('summary').click();
    const table = details.locator('table');
    await expect(table.locator('caption')).toHaveText('Exact annual/end-horizon values sampled from the existing monthly model states');
    await expect(table.locator('thead th[scope="col"]')).toHaveText(['Year', 'Smith mortgage', 'HELOC balance', 'Smith portfolio', 'Baseline mortgage', 'Baseline portfolio', 'Smith net position', 'Baseline net position']);
    await expect(details.locator('[role="region"]')).toHaveAttribute('tabindex', '0');
    expect(await table.locator('tbody th[scope="row"]').count()).toBeGreaterThan(1);
    const controls = page.locator('[data-smith-calculator] input:not([type="hidden"])');
    for (let i = 0; i < await controls.count(); i += 1) {
      const labelled = await controls.nth(i).evaluate((el: HTMLInputElement) => Boolean(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')));
      expect(labelled).toBe(true);
    }
    await expect(page.getByText(/owner review|choose graph|select option/i)).toHaveCount(0);
  });
});
