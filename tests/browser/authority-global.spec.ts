import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { publicRoutes, QA_PROFILE } from './qa-profile';

const requiredWidths = [1440, 820, 390, 320] as const;
const allowedExternal = ['mailto:', 'https://www.uottawa.ca/', 'https://parkerhamilton.ca/', 'https://askwill.ca/', 'https://www.askwill.ca/'];

async function open(page: Page, route: string, captureErrors = false) {
  const errors: string[] = [];
  const onConsole = (message: ConsoleMessage) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); };
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`);
  if (captureErrors) { page.on('console', onConsole); page.on('pageerror', onPageError); }
  try {
    const response = await page.goto(route, { waitUntil: captureErrors ? 'load' : 'domcontentloaded' });
    expect(response?.status(), route).toBe(200);
    if (captureErrors) await page.waitForTimeout(75);
    return errors;
  } finally {
    if (captureErrors) { page.off('console', onConsole); page.off('pageerror', onPageError); }
  }
}

test.describe('Final-RC global release gates', () => {
  test('sitemap contains exactly the eight indexable portfolio routes', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/\/$/, ''));
    const expected = publicRoutes.map((route) => `https://parkerhamilton.ca${route === '/' ? '' : route}`);
    expect(locs.sort()).toEqual(expected.sort());
    expect(xml).not.toMatch(/wealthsimple-2026/i);
  });

  for (const route of publicRoutes) {
    test(`${route}: canonical, skip-link, link safety, assets and console are clean`, async ({ page, request, browserName }) => {
      const errors = await open(page, route, true);
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      const href = await canonical.getAttribute('href');
      expect(href).toBe(`https://parkerhamilton.ca${route === '/' ? '/' : route}`);
      // Safari on macOS uses Option-Tab for links unless full keyboard access is enabled.
    // https://support.apple.com/guide/safari/cpsh003/mac
    await page.keyboard.press(process.platform === 'darwin' && browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await expect(skip).toBeFocused();
      await skip.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();
      const unsafe = await page.locator('a[href]').evaluateAll((links, allowed) => links.flatMap((link) => {
        const href = (link as HTMLAnchorElement).getAttribute('href') ?? '';
        const bad = /(?:drive|docs)\.google\.com|localhost|127\.0\.0\.1|file:\/\/|review|staging/i.test(href);
        const external = /^https?:\/\//i.test(href) && !(allowed as string[]).some((prefix) => href.startsWith(prefix));
        return bad || external ? [href] : [];
      }), allowedExternal);
      expect(unsafe).toEqual([]);
      const assetUrls = await page.locator('img[src], video[src], source[src], track[src]').evaluateAll((nodes) => Array.from(new Set(nodes.map((node) => node.getAttribute('src')).filter((src): src is string => Boolean(src && src.startsWith('/'))))));
      for (const asset of assetUrls) {
        const response = await request.get(asset);
        expect(response.status(), `${route} -> ${asset}`).toBe(200);
        expect((await response.body()).byteLength, `${route} -> ${asset}`).toBeGreaterThan(0);
      }
      expect(errors, route).toEqual([]);
    });
  }

  for (const width of requiredWidths) {
    test(`all portfolio routes have no page-level horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
      for (const route of publicRoutes) {
        await open(page, route);
        const overflowState = await page.evaluate(() => {
          const root = document.documentElement;
          const client = root.clientWidth;
          const elements = [...document.querySelectorAll<HTMLElement>('body *')];
          const offenders = elements
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: typeof element.className === 'string' ? element.className : null,
                left: Math.round(rect.left * 100) / 100,
                right: Math.round(rect.right * 100) / 100,
                width: Math.round(rect.width * 100) / 100,
              };
            })
            .filter(({ left, right, width }) => width > 0 && (left < -1 || right > client + 1))
            .slice(0, 20);
          const internalOverflows = elements
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => {
              const style = getComputedStyle(element);
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: typeof element.className === 'string' ? element.className : null,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                overflowX: style.overflowX,
                whiteSpace: style.whiteSpace,
              };
            })
            .slice(0, 30);
          return { scroll: root.scrollWidth, client, offenders, internalOverflows };
        });
        expect(
          overflowState.scroll,
          `${route} overflow diagnostics: ${JSON.stringify({ offenders: overflowState.offenders, internalOverflows: overflowState.internalOverflows })}`,
        ).toBeLessThanOrEqual(overflowState.client + 1);
      }
    });
  }


  test('Shared Lane A homepage contracts hold across the approved responsive matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Rendered composition matrix is captured once in Chromium; full browser smoke remains separate.');
    const widths = [1440, 1280, 1024, 820, 390] as const;
    for (const width of widths) {
      await page.setViewportSize({ width, height: width >= 820 ? 900 : 844 });
      await open(page, '/');

      await expect(page.locator('body')).toHaveClass(/route-home/);
      await expect(page.locator('body')).toHaveClass(/portfolio-canvas/);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `homepage overflow at ${width}px`).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const askwillImage = page.locator('.featured-card:has(a[href="/work/askwill"]) img');
      await expect(askwillImage).toHaveAttribute('src', '/assets/projects/askwill/case-home-rebuilt-approved.png');
      expect(await askwillImage.evaluate((el) => getComputedStyle(el).objectPosition)).toMatch(/^(left top|0% 0%)$/);

      const coast = page.locator('.secondary-card:has(a[href="/work/coast-fi"]) .project-premise');
      await expect(coast).toHaveText('This tool models how early retirement contributions can give compound growth more time to work and reduce future contribution needs.');

      const about = page.locator('.about-section');
      const contact = about.locator('.split-contact');
      await expect(contact).toBeVisible();
      await expect(contact.getByRole('link', { name: 'Email me' })).toBeVisible();
      const layout = await page.evaluate(() => {
        const about = document.querySelector<HTMLElement>('.about-section')!;
        const statement = document.querySelector<HTMLElement>('.about-statement')!;
        const contact = document.querySelector<HTMLElement>('.split-contact')!;
        const heading = statement.querySelector<HTMLElement>('h2')!;
        const question = contact.querySelector<HTMLElement>('h2')!;
        const email = contact.querySelector<HTMLElement>('.home-email-action')!;
        const ab = about.getBoundingClientRect();
        const st = statement.getBoundingClientRect();
        const ct = contact.getBoundingClientRect();
        const hd = heading.getBoundingClientRect();
        const q = question.getBoundingClientRect();
        const em = email.getBoundingClientRect();
        return {
          columns: getComputedStyle(about).gridTemplateColumns,
          aboutTop: ab.top,
          statementLeft: st.left,
          contactLeft: ct.left,
          contactTop: ct.top,
          headingTop: hd.top,
          questionTop: q.top,
          emailTop: em.top,
        };
      });

      if (width >= 1200) {
        expect(layout.contactLeft).toBeGreaterThan(layout.statementLeft);
        expect(Math.abs(layout.contactTop - layout.headingTop)).toBeLessThanOrEqual(2);
        expect(Math.abs(layout.questionTop - layout.emailTop)).toBeLessThanOrEqual(10);
      } else if (width === 1024) {
        expect(Math.abs(layout.statementLeft - layout.contactLeft)).toBeLessThanOrEqual(2);
        expect(layout.contactTop).toBeGreaterThan(layout.aboutTop);
        expect(Math.abs(layout.questionTop - layout.emailTop)).toBeLessThanOrEqual(10);
      } else {
        expect(Math.abs(layout.statementLeft - layout.contactLeft)).toBeLessThanOrEqual(2);
        expect(layout.emailTop).toBeGreaterThan(layout.questionTop);
      }

      if (width >= 1280) {
        const media = await page.locator('.featured-card .project-media').evaluateAll((els) => els.map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height };
        }));
        expect(Math.max(...media.map((m) => m.top)) - Math.min(...media.map((m) => m.top))).toBeLessThanOrEqual(2);
        expect(Math.max(...media.map((m) => m.bottom)) - Math.min(...media.map((m) => m.bottom))).toBeLessThanOrEqual(2);
      }
    }
  });

  test('Shared Lane A keeps one keyboard focus stop per project card and Enter activates the project route', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Card interaction semantics are browser-standard and are exercised once in Chromium.');
    await open(page, '/');
    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(7);
    for (let index = 0; index < await cards.count(); index += 1) {
      const card = cards.nth(index);
      await expect(card.locator('a')).toHaveCount(1);
      await expect(card.locator('button, input, select, textarea')).toHaveCount(0);
    }
    const first = cards.first().locator('a.project-link');
    const href = await first.getAttribute('href');
    expect(href).toBe('/work/compound-growth');
    await first.focus();
    await expect(first).toBeFocused();
    await Promise.all([
      page.waitForURL('**/work/compound-growth'),
      page.keyboard.press('Enter'),
    ]);
    await expect(page.getByRole('heading', { level: 1, name: 'Compound Growth & Retirement Investing' })).toBeVisible();
  });

  test('G-02 matches desktop ContactBand/footer separation without resizing the band', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Shared-shell geometry is exercised once in Chromium.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/work/askwill');
    const desktop = await page.evaluate(() => {
      const contact = document.querySelector<HTMLElement>('.contact-band')!;
      const footer = document.querySelector<HTMLElement>('.site-footer')!;
      const style = getComputedStyle(contact);
      return {
        contactMarginTop: parseFloat(style.marginTop),
        contactPaddingTop: parseFloat(style.paddingTop),
        contactHeight: contact.getBoundingClientRect().height,
        footerPaddingTop: parseFloat(getComputedStyle(footer).paddingTop),
      };
    });
    expect(desktop.contactMarginTop).toBe(42);
    expect(desktop.footerPaddingTop).toBe(42);

    await page.setViewportSize({ width: 820, height: 900 });
    await open(page, '/work/askwill');
    const narrow = await page.evaluate(() => {
      const contact = document.querySelector<HTMLElement>('.contact-band')!;
      const footer = document.querySelector<HTMLElement>('.site-footer')!;
      return {
        contactPaddingTop: parseFloat(getComputedStyle(contact).paddingTop),
        contactHeight: contact.getBoundingClientRect().height,
        footerPaddingTop: parseFloat(getComputedStyle(footer).paddingTop),
      };
    });
    expect(narrow.footerPaddingTop).toBe(0);
    expect(narrow.contactPaddingTop).not.toBe(desktop.contactPaddingTop);
    expect(narrow.contactHeight).not.toBe(desktop.contactHeight);
  });

  test('Option 6 is scoped away from Wealthsimple and 404 utility surfaces', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Special-route visual scoping is exercised once in Chromium.');
    await page.setViewportSize({ width: 1440, height: 900 });

    await open(page, '/work/askwill');
    const portfolio = await page.locator('body').evaluate((body) => ({
      className: body.className,
      backgroundImage: getComputedStyle(body).backgroundImage,
    }));
    expect(portfolio.className).toContain('portfolio-canvas');
    expect(portfolio.backgroundImage).toContain('radial-gradient');

    const ws = await page.goto('/wealthsimple-2026', { waitUntil: 'domcontentloaded' });
    expect(ws?.status()).toBe(200);
    const wealthsimple = await page.locator('body').evaluate((body) => ({
      className: body.className,
      backgroundImage: getComputedStyle(body).backgroundImage,
      backgroundColor: getComputedStyle(body).backgroundColor,
    }));
    expect(wealthsimple.className).toContain('route-utility');
    expect(wealthsimple.className).not.toContain('portfolio-canvas');
    expect(wealthsimple.backgroundImage).toBe('none');
    expect(wealthsimple.backgroundColor).toBe('rgb(245, 247, 244)');

    const missing = await page.goto('/shared-lane-a-utility-regression-missing', { waitUntil: 'domcontentloaded' });
    expect(missing?.status()).toBe(404);
    const notFound = await page.locator('body').evaluate((body) => ({
      className: body.className,
      backgroundImage: getComputedStyle(body).backgroundImage,
      backgroundColor: getComputedStyle(body).backgroundColor,
    }));
    expect(notFound.className).toContain('route-utility');
    expect(notFound.backgroundImage).toBe('none');
    expect(notFound.backgroundColor).toBe('rgb(245, 247, 244)');
  });

  test('approved workbook downloads resolve with exact public bytes', async ({ request }) => {
    const crypto = await import('node:crypto');
    const checks = [
      ['/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx', '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a'],
      ['/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx', '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9'],
    ] as const;
    for (const [href, expected] of checks) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      const hash = crypto.createHash('sha256').update(await response.body()).digest('hex');
      expect(hash, href).toBe(expected);
    }
  });

  test('route source does not leak review/staging behavior through runtime URLs', async ({ page }) => {
    for (const route of publicRoutes) {
      await open(page, route);
      const html = await page.locator('html').innerHTML();
      expect(html, `${route} profile=${QA_PROFILE}`).not.toMatch(/https?:\/\/(?:drive|docs)\.google\.com|https?:\/\/(?:localhost|127\.0\.0\.1)|file:\/\//i);
    }
  });
});
