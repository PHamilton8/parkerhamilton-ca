import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

const WIDTHS = [1440, 1280, 1024, 820, 390, 320] as const;
const expectedMoreWork = [
  ['/work/smith-manoeuvre', '/assets/projects/smith-manoeuvre/smith.svg'],
  ['/work/reporting-workflow', '/assets/projects/reporting-workflow/workflow.svg'],
  ['/work/coast-fi', '/assets/projects/coast-fi/coast.svg'],
  ['/work/grocery-automation', '/assets/projects/grocery-automation/grocery.svg'],
] as const;

async function open(page: any) {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

test.describe('Homepage latest-authority locked contracts', () => {
  test.skip(!requiresAuthority('home'), 'Homepage V3 authority assertions are deferred for this QA profile.');

  test('Cathedral is exactly Frame 2 / 320 samples / nine ribbons', async ({ page }) => {
    await open(page);
    const svg = page.locator('[data-cathedral-stage] svg');
    await expect(svg).toHaveAttribute('viewBox', '0 22.5 610 446.5');
    await expect(page.locator('[data-cathedral-ribbon]')).toHaveCount(9);
    const pathStats = await page.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((path) => {
      const d = path.getAttribute('d') ?? '';
      return { finite: !/NaN|Infinity/.test(d), points: (d.match(/\bL\b/g) ?? []).length + 1 };
    }));
    expect(pathStats).toEqual(Array.from({ length: 9 }, () => ({ finite: true, points: 320 })));
  });

  test('Cathedral responds to mouse/touch pointer input and becomes static under reduced motion', async ({ page }) => {
    await open(page);
    const stage = page.locator('[data-cathedral-stage]');
    const before = await stage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d')));
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.78, box!.y + box!.height * 0.3);
    await expect.poll(async () => stage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d'))), { timeout: 2_000 }).not.toEqual(before);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(220);
    const touchBefore = await stage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d')));
    await stage.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        pointerId: 91,
        clientX: rect.left + rect.width * 0.72,
        clientY: rect.top + rect.height * 0.38,
      }));
    });
    await expect.poll(async () => stage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d'))), { timeout: 2_000 }).not.toEqual(touchBefore);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reduced = page.locator('[data-cathedral-stage]');
    await expect(reduced).toHaveAttribute('data-motion', 'reduced');
    const staticBefore = await reduced.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d')));
    const reducedBox = await reduced.boundingBox();
    expect(reducedBox).not.toBeNull();
    await page.mouse.move(reducedBox!.x + reducedBox!.width * 0.2, reducedBox!.y + reducedBox!.height * 0.8);
    await page.waitForTimeout(120);
    const staticAfter = await reduced.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((p) => p.getAttribute('d')));
    expect(staticAfter).toEqual(staticBefore);
  });

  for (const width of WIDTHS) {
    test(`Homepage locked components remain contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
      await open(page);
      const report = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const selectors = ['[data-cathedral-stage]', '.compound-media', '.secondary-grid', '.contact-band'];
        return selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
          const r = el.getBoundingClientRect();
          return { selector, left: r.left, right: r.right, width: r.width, viewport };
        }).filter((x) => x.left < -1 || x.right > x.viewport + 1 || x.width <= 0));
      });
      expect(report).toEqual([]);
    });
  }

  test('mobile H1 is the exact three-line owner state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const lines = page.locator('#hero-title .h1-line');
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0)).toHaveText('I like');
    await expect(lines.nth(1)).toHaveText('figuring');
    await expect(lines.nth(2)).toHaveText('things out.');
    const y = await lines.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(y).size).toBe(3);
  });

  test('Compound featured media uses the final paired homepage assets and legacy red/blue media is absent', async ({ page, request }) => {
    await open(page);
    const compound = page.locator('.compound-media');
    await expect(compound).toHaveCount(1);
    await expect(compound.locator('img[src="/assets/projects/compound-growth/homepage-table-v3.webp"]')).toHaveCount(1);
    await expect(compound.locator('img[src="/assets/projects/compound-growth/homepage-graph-v3.webp"]')).toHaveCount(1);
    await expect(compound.locator('img[src$="/table.webp"], img[src$="/graph.webp"]')).toHaveCount(0);
    for (const href of ['/assets/projects/compound-growth/homepage-table-v3.webp', '/assets/projects/compound-growth/homepage-graph-v3.webp']) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect((await response.body()).byteLength, href).toBeGreaterThan(1000);
    }
  });

  test('More Work cards use exactly the four owner-locked thumbnail assets', async ({ page, request }) => {
    await open(page);
    for (const [route, src] of expectedMoreWork) {
      const card = page.locator(`.secondary-card:has(a[href="${route}"])`);
      await expect(card).toHaveCount(1);
      await expect(card.locator(`img[src="${src}"]`)).toHaveCount(1);
      const response = await request.get(src);
      expect(response.status(), src).toBe(200);
      const text = await response.text();
      expect(text).toMatch(/<title\s+id="[^"]+">/);
      expect(text).toMatch(/<desc\s+id="[^"]+">/);
      const labelledBy = text.match(/aria-labelledby="([^"]+)"/)?.[1].split(/\s+/) ?? [];
      for (const id of labelledBy) expect(text).toContain(`id="${id}"`);
    }
  });

  test('Homepage canonical copy overrides have not weakened locked content', async ({ page }) => {
    await open(page);
    const compound = page.locator('.featured-card:has(a[href="/work/compound-growth"])');
    await expect(compound.locator('.project-metadata li')).toHaveText(['Behavioural Research', 'Financial Decision-Making']);
    const designDay = page.locator('.featured-card:has(a[href="/work/design-day"])');
    await expect(designDay.locator('.project-metadata li')).toHaveText(['Behavioural Research', 'Product Design']);
    const askwill = page.locator('.featured-card:has(a[href="/work/askwill"])');
    await expect(askwill.locator('.project-premise')).toHaveText('A website rethink for a family-run water-service business, covering structure, content, SEO, and QA.');
    const coast = page.locator('.secondary-card:has(a[href="/work/coast-fi"])');
    await expect(coast.getByRole('heading', { level: 3 })).toHaveText('Coast FI Calculator');
    await expect(coast.locator('.project-premise')).toHaveText('This tool models how early retirement contributions can give compound growth more time to work and reduce future contribution needs.');
    await expect(coast.locator('.project-metadata li')).toHaveText(['Financial Decision-Making', 'Modelling']);
    const smith = page.locator('.secondary-card:has(a[href="/work/smith-manoeuvre"])');
    await expect(smith.locator('.project-metadata li')).toHaveText(['Financial Decision-Making', 'Modelling']);
  });


  test('AskWill uses the owner-approved rebuilt-site asset with left/top framing', async ({ page }) => {
    await open(page);
    const askwill = page.locator('.featured-card:has(a[href="/work/askwill"])');
    const image = askwill.locator('img');
    await expect(image).toHaveAttribute('src', '/assets/projects/askwill/case-home-rebuilt-approved.png');
    expect(await image.evaluate((el) => getComputedStyle(el).objectPosition)).toMatch(/^(left top|0% 0%)$/);
  });

  test('Homepage cards expose one semantic case-study link and no nested controls', async ({ page }) => {
    await open(page);
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(7);
    for (let index = 0; index < await cards.count(); index += 1) {
      const card = cards.nth(index);
      await expect(card.locator('a.project-link')).toHaveCount(1);
      await expect(card.locator('a a, a button, button')).toHaveCount(0);
    }
  });

  test('Homepage uses the approved split About and compact Contact composition', async ({ page }) => {
    await open(page);
    await expect(page.locator('.about-section > .about-statement')).toHaveCount(1);
    await expect(page.locator('.about-statement .about-copy')).toHaveCount(1);
    const contact = page.locator('.about-section > .split-contact');
    await expect(contact).toHaveCount(1);
    await expect(contact.getByRole('heading', { name: 'Have a question?' })).toHaveCount(1);
    await expect(contact.getByRole('link', { name: 'Email me' })).toHaveCount(1);
    await expect(page.locator('.home-page > .contact-band')).toHaveCount(0);
  });

  test('skip link remains first-focus and transfers focus to main', async ({ page, browserName }) => {
    await open(page);
    // Safari on macOS uses Option-Tab for links unless full keyboard access is enabled.
    // https://support.apple.com/guide/safari/cpsh003/mac
    await page.keyboard.press(process.platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });
});


test.describe('Wave 2 Revision A Homepage rendered acceptance', () => {
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

  test('desktop Homepage corrections match the locked Revision A geometry', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Revision A pixel acceptance is Chromium-specific.');

    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const numberStyles = await page.locator('.home-page .project-number').evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return { position: style.position, top: style.top };
        }),
      );
      expect(numberStyles).toHaveLength(7);
      for (const style of numberStyles) {
        expect(style.position).toBe('relative');
        expect(style.top).toBe('-3px');
      }

      const separators = await page.locator('.home-page .project-metadata').evaluateAll((lists) =>
        lists.map((list) =>
          Array.from(list.children).map((node) => ({
            before: getComputedStyle(node, '::before').content,
            after: getComputedStyle(node, '::after').content,
          })),
        ),
      );
      expect(separators).toHaveLength(7);
      for (const items of separators) {
        expect(items.length).toBeGreaterThan(0);
        expect(['none', 'normal']).toContain(items[0].before);
        for (let i = 1; i < items.length; i += 1) expect(items[i].before).toContain('·');
        for (const item of items) expect(item.after).toBe('none');
      }

      const featuredBodyMetadataGaps = await page.locator('.home-page .featured-card').evaluateAll((cards) =>
        cards.map((card) => {
          const premise = card.querySelector('.project-premise') as HTMLElement;
          const metadata = card.querySelector('.project-metadata') as HTMLElement;
          return metadata.getBoundingClientRect().top - premise.getBoundingClientRect().bottom;
        }),
      );
      for (const gap of featuredBodyMetadataGaps) {
        expect(gap, 'featured body-to-metadata gap').toBeGreaterThanOrEqual(10);
        expect(gap, 'featured body-to-metadata gap').toBeLessThanOrEqual(24);
      }

      const compact = await page.locator('.home-page .secondary-card').evaluateAll((cards) =>
        cards.map((card) => {
          const box = (selector: string) => {
            const element = card.querySelector(selector) as HTMLElement;
            const rect = element.getBoundingClientRect();
            return {
              top: rect.top,
              bottom: rect.bottom,
              height: rect.height,
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight,
            };
          };
          return {
            premise: box('.project-premise'),
            metadata: box('.project-metadata'),
            media: box('.secondary-visual'),
            link: box('.project-link'),
          };
        }),
      );
      expect(compact).toHaveLength(4);
      const compactBodyMetadataGaps = compact.map((card) => card.metadata.top - card.premise.bottom);
      for (const gap of compactBodyMetadataGaps) {
        expect(gap, 'compact body-to-metadata gap').toBeGreaterThanOrEqual(8);
        expect(gap, 'compact body-to-metadata gap').toBeLessThanOrEqual(26);
      }
      for (const key of ['premise', 'metadata', 'media', 'link'] as const) {
        expect(spread(compact.map((card) => card[key].top)), key + ' top alignment').toBeLessThanOrEqual(2);
      }
      expect(spread(compact.map((card) => card.media.bottom)), 'compact media bottom alignment').toBeLessThanOrEqual(2);
      expect(spread(compact.map((card) => card.link.bottom)), 'Case study bottom alignment').toBeLessThanOrEqual(2);
      for (const card of compact) {
        expect(card.premise.scrollHeight).toBeLessThanOrEqual(card.premise.clientHeight + 1);
        expect(card.metadata.scrollHeight).toBeLessThanOrEqual(card.metadata.clientHeight + 1);
      }

      const compoundHeadingGeometry = await page.locator(
        '.featured-card:has(a[href="/work/compound-growth"]) h3',
      ).evaluate((node) => {
        const heading = node as HTMLElement;
        const premise = heading.closest('.featured-card')?.querySelector('.project-premise') as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(heading);
        const headingRect = heading.getBoundingClientRect();
        const premiseRect = premise.getBoundingClientRect();
        return {
          lineRects: range.getClientRects().length,
          headingBottom: headingRect.bottom,
          premiseTop: premiseRect.top,
        };
      });
      expect(compoundHeadingGeometry.lineRects).toBe(2);
      expect(compoundHeadingGeometry.premiseTop).toBeGreaterThanOrEqual(compoundHeadingGeometry.headingBottom - 1);

      const featured = await page.locator(
        '.home-page .compound-media, .home-page .design-day-media, .home-page .askwill-browser',
      ).evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        }),
      );
      expect(featured).toHaveLength(3);
      expect(spread(featured.map((item) => item.top)), 'featured visible-media top alignment').toBeLessThanOrEqual(2);
      expect(spread(featured.map((item) => item.bottom)), 'featured visible-media bottom alignment').toBeLessThanOrEqual(2);

      const about = await page.evaluate(() => {
        const heading = document.querySelector('#about-title') as HTMLElement;
        const copy = document.querySelector('.home-page .about-copy') as HTMLElement;
        const statement = document.querySelector('.home-page .about-statement') as HTMLElement;
        const contact = document.querySelector('.home-page .split-contact') as HTMLElement;
        const eyebrow = document.querySelector('.home-page .split-contact .eyebrow') as HTMLElement;
        const row = document.querySelector('.home-page .split-question-row') as HTMLElement;
        const question = document.querySelector('#home-contact-title') as HTMLElement;
        const email = document.querySelector('.home-page .home-email-action') as HTMLElement;
        const rect = (element: HTMLElement) => element.getBoundingClientRect();
        const h = rect(heading);
        const c = rect(copy);
        const panel = rect(contact);
        const e = rect(eyebrow);
        const r = rect(row);
        const q = rect(question);
        const mail = rect(email);
        return {
          borderTopWidth: getComputedStyle(statement).borderTopWidth,
          headingTop: h.top,
          copyBottom: c.bottom,
          panelTop: panel.top,
          panelBottom: panel.bottom,
          panelCenter: panel.top + panel.height / 2,
          rowCenter: r.top + r.height / 2,
          questionCenter: q.top + q.height / 2,
          emailCenter: mail.top + mail.height / 2,
          eyebrowContained: e.top >= panel.top && e.bottom <= panel.bottom,
        };
      });
      expect(about.borderTopWidth).toBe('0px');
      expect(Math.abs(about.panelTop - about.headingTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(about.panelBottom - about.copyBottom)).toBeLessThanOrEqual(2);
      expect(Math.abs(about.questionCenter - about.emailCenter)).toBeLessThanOrEqual(2);
      expect(Math.abs(about.rowCenter - about.panelCenter)).toBeLessThanOrEqual(2);
      expect(about.eyebrowContained).toBe(true);

      const heroColours = await page.evaluate(() => ({
        parent: getComputedStyle(document.querySelector('.home-page .hero h1') as HTMLElement).color,
        lines: Array.from(document.querySelectorAll('.home-page .hero h1 .h1-line')).map(
          (node) => getComputedStyle(node).color,
        ),
      }));
      expect(heroColours.parent).toBe('rgb(245, 250, 248)');
      expect(heroColours.lines).toHaveLength(3);
      expect(new Set(heroColours.lines)).toEqual(new Set(['rgb(245, 250, 248)']));

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('revision-a-home-' + width + '.png'), fullPage: true });
    }
  });

  test('Homepage remains contained at the required responsive widths', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Revision A responsive evidence is Chromium-specific.');
    for (const width of [1024, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      const columns = await page.locator('.home-page .about-section').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
      expect(columns.trim().split(/\s+/)).toHaveLength(1);
      await page.screenshot({ path: testInfo.outputPath('revision-a-home-' + width + '.png'), fullPage: true });
    }
  });
});
