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
      // Premise blocks may sit slightly higher/lower within their deterministic row so
      // the body-to-metadata rhythm stays compact; metadata/media/link rows remain aligned.
      for (const key of ['metadata', 'media', 'link'] as const) {
        expect(spread(compact.map((card) => card[key].top)), key + ' top alignment').toBeLessThanOrEqual(2);
      }
      expect(spread(compact.map((card) => card.media.bottom)), 'compact media bottom alignment').toBeLessThanOrEqual(2);
      expect(spread(compact.map((card) => card.link.bottom)), 'Case study bottom alignment').toBeLessThanOrEqual(2);
      for (const card of compact) {
        expect(card.premise.scrollHeight).toBeLessThanOrEqual(card.premise.clientHeight + 1);
        expect(card.metadata.scrollHeight).toBeLessThanOrEqual(card.metadata.clientHeight + 1);
      }

      if (width === 1280) {
        for (const route of ['/work/smith-manoeuvre', '/work/coast-fi']) {
          const firstTwoTagTops = await page.locator(
            '.secondary-card:has(a[href="' + route + '"]) .project-metadata li',
          ).evaluateAll((nodes) =>
            nodes.slice(0, 2).map((node) => node.getBoundingClientRect().top),
          );
          expect(firstTwoTagTops).toHaveLength(2);
          expect(
            Math.abs(firstTwoTagTops[0] - firstTwoTagTops[1]),
            route + ' first two metadata tags share a line at 1280',
          ).toBeLessThanOrEqual(1);
        }
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


test.describe('Wave 2 prelaunch visual repairs — compact title capacity', () => {
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

  test('Smith compact title clears its premise while deterministic rows remain aligned', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch pixel authority is Chromium-specific.');

    for (const width of [981, 1024, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const smith = page.locator('.secondary-card:has(a[href="/work/smith-manoeuvre"])');
      const smithGeometry = await smith.evaluate((card) => {
        const titleBand = card.querySelector('.title-band') as HTMLElement;
        const heading = card.querySelector('h3') as HTMLElement;
        const premise = card.querySelector('.project-premise') as HTMLElement;
        const titleRect = titleBand.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();
        const premiseRect = premise.getBoundingClientRect();
        return {
          titleBottom: titleRect.bottom,
          headingBottom: headingRect.bottom,
          premiseTop: premiseRect.top,
          titleScrollHeight: titleBand.scrollHeight,
          titleClientHeight: titleBand.clientHeight,
        };
      });

      expect(
        smithGeometry.premiseTop - smithGeometry.headingBottom,
        `Smith h3 → premise clearance at ${width}px`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        smithGeometry.titleBottom,
        `Smith title-band contains h3 at ${width}px`,
      ).toBeGreaterThanOrEqual(smithGeometry.headingBottom - 1);
      expect(
        smithGeometry.titleScrollHeight,
        `Smith title-band has no internal overflow at ${width}px`,
      ).toBeLessThanOrEqual(smithGeometry.titleClientHeight + 1);

      const rows = await page.locator('.home-page .secondary-card').evaluateAll((cards) =>
        cards.map((card) => {
          const metadata = card.querySelector('.project-metadata') as HTMLElement;
          const media = card.querySelector('.secondary-visual') as HTMLElement;
          const link = card.querySelector('.project-link') as HTMLElement;
          const metadataRect = metadata.getBoundingClientRect();
          const mediaRect = media.getBoundingClientRect();
          const linkRect = link.getBoundingClientRect();
          return {
            metadataTop: metadataRect.top,
            mediaTop: mediaRect.top,
            mediaBottom: mediaRect.bottom,
            linkTop: linkRect.top,
          };
        }),
      );

      expect(rows).toHaveLength(4);
      expect(spread(rows.map((row) => row.metadataTop)), `compact metadata alignment at ${width}px`).toBeLessThanOrEqual(2);
      expect(spread(rows.map((row) => row.mediaTop)), `compact media top alignment at ${width}px`).toBeLessThanOrEqual(2);
      expect(spread(rows.map((row) => row.mediaBottom)), `compact media bottom alignment at ${width}px`).toBeLessThanOrEqual(2);
      expect(spread(rows.map((row) => row.linkTop)), `compact CTA alignment at ${width}px`).toBeLessThanOrEqual(2);

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.documentWidth, `no horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewportWidth + 1);

      for (const route of ['/work/grocery-automation', '/work/reporting-workflow', '/work/coast-fi']) {
        const card = page.locator(`.secondary-card:has(a[href="${route}"])`);
        const clearance = await card.evaluate((node) => {
          const heading = node.querySelector('h3') as HTMLElement;
          const premise = node.querySelector('.project-premise') as HTMLElement;
          return premise.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
        });
        expect(clearance, `${route} title → premise clearance at ${width}px`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});


test.describe('Wave 2 prelaunch visual repairs — featured media contract', () => {
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

  test('desktop media surfaces share the actual desktop seam', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch pixel authority is Chromium-specific.');

    for (const width of [981, 1024, 1025]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const surfaces = await page.locator(
        '.home-page .compound-media, .home-page .design-day-media, .home-page .askwill-browser',
      ).evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        }),
      );

      expect(surfaces).toHaveLength(3);
      expect(spread(surfaces.map((item) => item.top)), `visible media top spread at ${width}px`).toBeLessThanOrEqual(2);
      expect(spread(surfaces.map((item) => item.bottom)), `visible media bottom spread at ${width}px`).toBeLessThanOrEqual(2);
      for (const surface of surfaces) {
        expect(surface.width).toBeGreaterThan(0);
        expect(surface.height).toBeGreaterThan(0);
      }

      const designFit = await page.locator('.design-day-media img').evaluate((node) => getComputedStyle(node).objectFit);
      expect(designFit).toBe('cover');

      const askwillPosition = await page.locator('.askwill-browser > img').evaluate((node) => getComputedStyle(node).objectPosition);
      expect(['left top', '0% 0%']).toContain(askwillPosition);
    }
  });

  test('stacked media determines parent height and clears the CTA', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch pixel authority is Chromium-specific.');

    const cards = [
      { route: '/work/compound-growth', surface: '.compound-media' },
      { route: '/work/design-day', surface: '.design-day-media' },
      { route: '/work/askwill', surface: '.askwill-browser' },
    ];

    for (const width of [980, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      for (const item of cards) {
        const card = page.locator(`.featured-card:has(a[href="${item.route}"])`);
        const geometry = await card.evaluate((node, surfaceSelector) => {
          const surface = node.querySelector(surfaceSelector as string) as HTMLElement;
          const media = node.querySelector('.project-media') as HTMLElement;
          const link = node.querySelector('.project-link') as HTMLElement;
          const cardRect = (node as HTMLElement).getBoundingClientRect();
          const mediaRect = media.getBoundingClientRect();
          const surfaceRect = surface.getBoundingClientRect();
          const linkRect = link.getBoundingClientRect();
          return {
            cardLeft: cardRect.left,
            cardRight: cardRect.right,
            cardBottom: cardRect.bottom,
            mediaBottom: mediaRect.bottom,
            surfaceLeft: surfaceRect.left,
            surfaceRight: surfaceRect.right,
            surfaceBottom: surfaceRect.bottom,
            linkTop: linkRect.top,
          };
        }, item.surface);

        expect(geometry.linkTop - geometry.surfaceBottom, `${item.route} media → CTA gap at ${width}px`).toBeGreaterThanOrEqual(8);
        expect(geometry.mediaBottom, `${item.route} parent contains media at ${width}px`).toBeGreaterThanOrEqual(geometry.surfaceBottom - 1);
        expect(geometry.surfaceBottom, `${item.route} media stays inside card at ${width}px`).toBeLessThanOrEqual(geometry.cardBottom + 1);
        expect(geometry.surfaceLeft, `${item.route} media left edge at ${width}px`).toBeGreaterThanOrEqual(geometry.cardLeft - 1);
        expect(geometry.surfaceRight, `${item.route} media right edge at ${width}px`).toBeLessThanOrEqual(geometry.cardRight + 1);
      }

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.documentWidth, `no horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewportWidth + 1);

      const designFit = await page.locator('.design-day-media img').evaluate((node) => getComputedStyle(node).objectFit);
      expect(designFit).toBe('cover');
      const askwillPosition = await page.locator('.askwill-browser > img').evaluate((node) => getComputedStyle(node).objectPosition);
      expect(['left top', '0% 0%']).toContain(askwillPosition);
    }
  });

  test('critical Homepage seams stay overflow-free and use the correct two-regime contract', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Prelaunch pixel authority is Chromium-specific.');

    for (const width of [390, 820, 821, 980, 981, 1024, 1025, 1100, 1101, 1180, 1181, 1280, 1312, 1313, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.documentWidth, `no document overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewportWidth + 1);

      if (width >= 981) {
        const surfaces = await page.locator(
          '.home-page .compound-media, .home-page .design-day-media, .home-page .askwill-browser',
        ).evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        }));
        expect(spread(surfaces.map((item) => item.top)), `desktop media top spread at ${width}px`).toBeLessThanOrEqual(2);
        expect(spread(surfaces.map((item) => item.bottom)), `desktop media bottom spread at ${width}px`).toBeLessThanOrEqual(2);
      } else {
        const clearances = await page.locator('.home-page .featured-card').evaluateAll((nodes) =>
          nodes.map((node) => {
            const surface = node.querySelector('.compound-media, .design-day-media, .askwill-browser') as HTMLElement;
            const link = node.querySelector('.project-link') as HTMLElement;
            return link.getBoundingClientRect().top - surface.getBoundingClientRect().bottom;
          }),
        );
        for (const clearance of clearances) expect(clearance, `stacked media → CTA gap at ${width}px`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  test('writes focused Homepage evidence crops from repaired source', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Focused evidence is captured once in Chromium.');

    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('.featured-grid').screenshot({ path: testInfo.outputPath('homepage-1024-selected-work.png'), animations: 'disabled' });
    await page.locator('.secondary-grid').screenshot({ path: testInfo.outputPath('homepage-1024-more-work.png'), animations: 'disabled' });

    for (const width of [820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('.featured-grid').screenshot({
        path: testInfo.outputPath(`homepage-${width}-featured-cards.png`),
        animations: 'disabled',
      });
    }
  });
});


test.describe('Final prelaunch V2 — Homepage hero split threshold', () => {
  test('hero remains stacked through 1023 and preserves the approved 1024+ split', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Homepage seam authority is Chromium-specific.');

    const cases = [
      { width: 980, expectedLines: 1, expectedColumns: 1, expectedFont: 54, expectedMonument: 260 },
      { width: 981, expectedLines: 1, expectedColumns: 1, expectedFont: 54, expectedMonument: 260 },
      { width: 1023, expectedLines: 1, expectedColumns: 1, expectedFont: 54, expectedMonument: 260 },
      { width: 1024, expectedLines: 3, expectedColumns: 2, expectedFont: 80, expectedMonument: 440 },
      { width: 1025, expectedLines: 3, expectedColumns: 2, expectedFont: 80, expectedMonument: 440 },
      { width: 1180, expectedLines: 3, expectedColumns: 2, expectedFont: 80, expectedMonument: 440 },
    ] as const;

    for (const item of cases) {
      await page.setViewportSize({ width: item.width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const geometry = await page.locator('.home-page .hero').evaluate((hero) => {
        const h1 = hero.querySelector('h1') as HTMLElement;
        const copy = hero.querySelector('.hero-copy') as HTMLElement;
        const visual = hero.querySelector('.hero-visual-zone') as HTMLElement;
        const monument = hero.querySelector('.hero-monument-zone') as HTMLElement;
        const thirdLine = h1.querySelectorAll('.h1-line')[2] as HTMLElement;

        const lineCount = (node: Node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops: number[] = [];
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            const top = Math.round(rect.top * 2) / 2;
            if (!tops.some((value) => Math.abs(value - top) <= 0.5)) tops.push(top);
          }
          return tops.length;
        };

        const heroRect = (hero as HTMLElement).getBoundingClientRect();
        const copyRect = copy.getBoundingClientRect();
        const visualRect = visual.getBoundingClientRect();
        const columns = getComputedStyle(hero).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);

        return {
          titleLines: lineCount(h1),
          thirdSpanLines: lineCount(thirdLine),
          columns: columns.length,
          fontSize: parseFloat(getComputedStyle(h1).fontSize),
          monumentHeight: monument.getBoundingClientRect().height,
          hero: { left: heroRect.left, right: heroRect.right, top: heroRect.top, bottom: heroRect.bottom },
          copy: { left: copyRect.left, right: copyRect.right, top: copyRect.top, bottom: copyRect.bottom },
          visual: { left: visualRect.left, right: visualRect.right, top: visualRect.top, bottom: visualRect.bottom },
        };
      });

      expect(geometry.titleLines, `hero title lines at ${item.width}px`).toBe(item.expectedLines);
      expect(geometry.thirdSpanLines, `"things out." remains cohesive at ${item.width}px`).toBe(1);
      expect(geometry.columns, `hero column count at ${item.width}px`).toBe(item.expectedColumns);
      expect(geometry.fontSize, `hero H1 font at ${item.width}px`).toBeCloseTo(item.expectedFont, 1);
      expect(geometry.monumentHeight, `monument height at ${item.width}px`).toBeCloseTo(item.expectedMonument, 0);

      expect(geometry.visual.left).toBeGreaterThanOrEqual(geometry.hero.left - 1);
      expect(geometry.visual.right).toBeLessThanOrEqual(geometry.hero.right + 1);
      expect(geometry.visual.top).toBeGreaterThanOrEqual(geometry.hero.top - 1);
      expect(geometry.visual.bottom).toBeLessThanOrEqual(geometry.hero.bottom + 1);

      if (item.expectedColumns === 1) {
        expect(geometry.visual.top, `stacked visual follows copy at ${item.width}px`).toBeGreaterThanOrEqual(geometry.copy.bottom - 1);
      } else {
        expect(geometry.visual.left, `split visual clears copy at ${item.width}px`).toBeGreaterThan(geometry.copy.right);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `Homepage horizontal overflow at ${item.width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('captures fresh hero seam evidence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Focused evidence is captured once in Chromium.');
    for (const width of [980, 981, 1023, 1024, 1025]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.locator('.home-page .hero').screenshot({
        path: testInfo.outputPath(`homepage-hero-${width}.png`),
        animations: 'disabled',
      });
    }
  });
});
