import { test, expect, type Locator } from '@playwright/test';
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

test.describe('Final Grocery / AskWill / Smith authority gates', () => {
  test.skip(!requiresAuthority('designDay'), 'Final route assertions are required only for final-rc.');

  test('Grocery Automation contains the final owner-approved content boundary', async ({ page }) => {
    await page.goto('/work/grocery-automation');
    await expect(page.getByRole('heading', { name: 'The workflow' })).toBeVisible();
    const rules = page.locator('[aria-label="House Rules treatment C"]');
    await expect(rules).toBeVisible();
    await expect(rules.locator('h3')).toHaveText(['Scale', 'Preferences', 'Constraints', 'Pantry']);
    await expect(rules.locator('p')).toHaveText([
      'Exactly 6 dinners for 9 adult portions.',
      'Chicken thighs, ground beef, Greek and Mexican flavours.',
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


test.describe('Wave 2 Revision A AskWill rendered acceptance', () => {
  test('Business fact stays on one desktop line without colliding with Result', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Revision A pixel acceptance is Chromium-specific.');

    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/work/askwill');
      await page.waitForLoadState('networkidle');

      const facts = page.locator('.askwill-facts > div');
      await expect(facts).toHaveCount(2);
      const business = facts.nth(0).locator('dd');
      await expect(business).toHaveText('Family-run water-treatment and well-services business');
      const businessGeometry = await business.evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return {
          lineRects: range.getClientRects().length,
          whiteSpace: getComputedStyle(node).whiteSpace,
          scrollWidth: (node as HTMLElement).scrollWidth,
          clientWidth: (node as HTMLElement).clientWidth,
        };
      });
      expect(businessGeometry.lineRects).toBe(1);
      expect(businessGeometry.whiteSpace).toBe('normal');
      expect(businessGeometry.scrollWidth).toBeLessThanOrEqual(businessGeometry.clientWidth + 1);

      const cellGeometry = await facts.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
      );
      expect(cellGeometry[0].right).toBeLessThanOrEqual(cellGeometry[1].left + 1);
      await expect(facts.nth(1).locator('dt')).toHaveText('Result');
      await expect(facts.nth(1).locator('dd')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

      await page.screenshot({ path: testInfo.outputPath('revision-a-askwill-' + width + '.png'), fullPage: true });
    }
  });

  test('AskWill fact layout remains responsive and overflow-free', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Revision A responsive evidence is Chromium-specific.');
    for (const width of [1024, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/work/askwill');
      await page.waitForLoadState('networkidle');
      const business = page.locator('.askwill-facts > div').nth(0).locator('dd');
      await expect(business).toHaveText('Family-run water-treatment and well-services business');
      expect(await business.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('revision-a-askwill-' + width + '.png'), fullPage: true });
    }
  });
});


// These owner-requested line starts are target-specific: viewport 1440px.
// Keep the complete text lock and measure natural browser lines, not containers.
async function renderedLines(locator: Locator) {
  return locator.evaluate((element) => {
    const lines: Array<{ top: number; words: string[] }> = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        const top = range.getBoundingClientRect().top;
        let line = lines.find((item) => Math.abs(item.top - top) < 1);
        if (!line) { line = { top, words: [] }; lines.push(line); }
        line.words.push(match[0]);
      }
    }
    return lines.map((line) => line.words.join(' '));
  });
}

test('Grocery JSON copy has no single-word costs line at 1440px', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Owner line-position targets use pinned Chromium at 1440px; cross-engine content and interaction gates remain separate.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/work/grocery-automation', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const paragraph = page.locator('.json-split .section-copy p').first();
  await expect(paragraph).toHaveText('The first version returned the menu as a block of text. It was easy enough for a person to read, but difficult for Python to turn reliably into an Excel workbook. I changed the response to structured JSON with separate fields for stores, days, meals, ingredients, instructions, and costs.');
  await expect(paragraph.locator('br')).toHaveCount(0);
  const lines = await renderedLines(paragraph);
  expect(lines.at(-1)).toMatch(/\S+\s+costs\.$/);
  expect(lines).not.toContain('costs.');
  const alignment = await page.locator('.json-split').evaluate((element) => ({
    gridLeft: element.getBoundingClientRect().left,
    titleLeft: element.querySelector('#json-title')!.getBoundingClientRect().left,
  }));
  expect(alignment.titleLeft - alignment.gridLeft).toBeGreaterThanOrEqual(764.25);
});

test('Home Grocery card starts its I and and lines as requested at 1440px', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Owner line-position targets use pinned Chromium at 1440px; cross-engine content and interaction gates remain separate.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const paragraph = page.locator('.secondary-card[data-project-slug="grocery-automation"] .project-premise');
  await expect(paragraph).toHaveText('To automate a recurring task at work, I built a Python workflow that turns weekly flyer data into menu options and grocery lists.');
  await expect(paragraph.locator('br')).toHaveCount(0);
  expect(await renderedLines(paragraph)).toEqual([
    'To automate a recurring task at work,',
    'I built a Python workflow that turns',
    'weekly flyer data into menu options',
    'and grocery lists.',
  ]);
});

test('approved mobile contact and footer treatment covers portfolio routes only', async ({ page }) => {
  for (const route of ['/', '/work/askwill', '/work/grocery-automation', '/work/design-day', '/work/compound-growth', '/work/reporting-workflow', '/work/smith-manoeuvre', '/work/coast-fi']) {
    for (const width of [390, 560]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route, { waitUntil: 'load' });
      await expect(page.locator('.site-footer-inner')).toHaveCSS('color', 'rgb(95, 111, 117)');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/wealthsimple-2026', { waitUntil: 'load' });
  await expect(page.locator('body')).not.toHaveClass(/approved-mobile-contact/);
  await expect(page.locator('.site-footer-inner')).not.toHaveCSS('color', 'rgb(95, 111, 117)');
});


test('remaining case pages match the approved mobile contact geometry and retain email keyboard access', async ({ page }) => {
  for (const width of [320, 390, 560]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = async () => page.evaluate(() => {
      const band = document.querySelector('.contact-band')!;
      const title = band.querySelector('h2')!.getBoundingClientRect();
      const email = band.querySelector('a')!.getBoundingClientRect();
      const b = band.getBoundingClientRect();
      const footer = document.querySelector('.site-footer-inner')!;
      const f = footer.getBoundingClientRect();
      return { bandWidth: b.width, bandHeight: b.height, titleX: title.x - b.x,
        titleY: title.y - b.y, emailX: email.x - b.x, emailY: email.y - b.y,
        emailHeight: email.height, footerWidth: f.width, footerHeight: f.height,
        footerFlow: getComputedStyle(footer).flexDirection,
        footerColor: getComputedStyle(footer).color };
    });
    await page.goto('/work/askwill', { waitUntil: 'load' });
    const approved = await metrics();
    for (const route of ['design-day', 'compound-growth', 'reporting-workflow', 'smith-manoeuvre', 'coast-fi']) {
      await page.goto(`/work/${route}`, { waitUntil: 'load' });
      const actual = await metrics();
      for (const key of Object.keys(approved) as (keyof typeof approved)[]) {
        // Firefox rects at different document Y positions differ by < 0.001px.
        if (typeof approved[key] === 'number') expect(actual[key]).toBeCloseTo(approved[key] as number, 2);
        else expect(actual[key]).toBe(approved[key]);
      }
      const email = page.locator('.contact-band').getByRole('link', { name: 'Email me', exact: true });
      await expect(email).toHaveAttribute('href', /^mailto:/);
      await email.focus();
      await expect(email).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('.site-footer-inner > span').nth(1)).toHaveText('Ottawa, Canada');
    }
  }
});

test('Grocery mobile iteration heading has three lines, breathing room, and a compact contact gap', async ({ page }) => {
  for (const width of [320, 390, 430, 560]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/work/grocery-automation', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#grocery-build-title')).toHaveText('Getting from working code to a useful file');
    expect(await renderedLines(page.locator('#grocery-build-title'))).toEqual([
      'Getting from', 'working code', 'to a useful file',
    ]);
    const layout = await page.evaluate(() => {
      const section = document.querySelector('[aria-labelledby="grocery-build-title"]')!;
      const title = section.querySelector('h2')!.getBoundingClientRect();
      const first = section.querySelector('.section-copy p')!.getBoundingClientRect();
      const last = section.querySelector('.section-copy p:last-child')!.getBoundingClientRect();
      const contact = document.querySelector('.contact-band')!.getBoundingClientRect();
      return { headingGap: first.top - title.bottom, contactGap: contact.top - last.bottom,
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(layout.headingGap).toBeCloseTo(20, 0);
    expect(layout.contactGap).toBeCloseTo(45, 0);
    expect(layout.overflow).toBeLessThanOrEqual(1);
  }
});
