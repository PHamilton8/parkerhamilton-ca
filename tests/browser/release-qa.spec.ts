import { test, expect, type Locator, type Page } from '@playwright/test';

const routes = [
  '/',
  '/work/design-day',
  '/work/reporting-workflow',
  '/work/grocery-automation',
  '/work/askwill',
  '/work/coast-fi',
  '/work/compound-growth',
  '/work/smith-manoeuvre',
] as const;

const projectRoutes = [
  '/work/compound-growth',
  '/work/design-day',
  '/work/askwill',
  '/work/grocery-automation',
  '/work/reporting-workflow',
  '/work/smith-manoeuvre',
  '/work/coast-fi',
] as const;

const workbookDownloads = [
  {
    route: '/work/coast-fi',
    href: '/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx',
  },
  {
    route: '/work/smith-manoeuvre',
    href: '/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx',
  },
] as const;

async function monitorPageErrors(page: Page) {
  const errors: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  };
  const onPageError = (error: Error) => errors.push(`pageerror: ${error.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 160) {
  await expect(target).toHaveCount(1);
  if (await target.evaluate((element) => document.activeElement === element)) return 0;
  for (let count = 1; count <= maxTabs; count += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return count;
  }
  throw new Error(`Target did not receive sequential keyboard focus within ${maxTabs} Tab presses.`);
}

async function assertNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertNarrowInteractiveContainment(page: Page) {
  const problems = await page.locator([
    '.site-nav a',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    'video[controls]',
    'a[download]',
    'a[href^="mailto:"]',
  ].join(',')).evaluateAll((elements) => {
    const viewportWidth = document.documentElement.clientWidth;
    return elements.flatMap((element) => {
      const html = element as HTMLElement;
      if (html.closest('[hidden]')) return [];
      const style = getComputedStyle(html);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
      const rect = html.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return [];
      const clippedLeft = rect.left < -1;
      const clippedRight = rect.right > viewportWidth + 1;
      if (!clippedLeft && !clippedRight) return [];
      return [{
        tag: html.tagName.toLowerCase(),
        id: html.id,
        name: html.getAttribute('name'),
        href: html.getAttribute('href'),
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        viewportWidth,
      }];
    });
  });
  expect(problems).toEqual([]);
}

async function assertCalculatorDomIntegrity(page: Page) {
  const report = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((node) => node.id);
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const duplicateIds = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([id]) => id);

    const unlabeledControls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
      .filter((control) => control.type !== 'hidden')
      .filter((control) => !control.closest('[hidden]'))
      .filter((control) => {
        const hasNativeLabel = Boolean(control.labels?.length);
        const hasAriaLabel = Boolean(control.getAttribute('aria-label')?.trim());
        const labelledBy = control.getAttribute('aria-labelledby')?.trim();
        const hasAriaLabelledBy = Boolean(labelledBy && labelledBy.split(/\s+/).every((id) => document.getElementById(id)));
        return !hasNativeLabel && !hasAriaLabel && !hasAriaLabelledBy;
      })
      .map((control) => ({ id: control.id, name: control.getAttribute('name'), type: control.type }));

    const brokenLabelFors = Array.from(document.querySelectorAll<HTMLLabelElement>('label[for]'))
      .filter((label) => !document.getElementById(label.htmlFor))
      .map((label) => label.htmlFor);

    return { duplicateIds, unlabeledControls, brokenLabelFors };
  });

  expect(report).toEqual({ duplicateIds: [], unlabeledControls: [], brokenLabelFors: [] });
}

async function openRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), route).toBe(200);
}

test.describe('release-level QA harness hardening', () => {
  test('skip link is hidden until focused and transfers focus to main', async ({ page }) => {
    await openRoute(page, '/');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    const main = page.locator('main#main');

    const before = await skip.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.y + before!.height).toBeLessThanOrEqual(1);

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    const focused = await skip.boundingBox();
    expect(focused).not.toBeNull();
    expect(focused!.y).toBeGreaterThanOrEqual(0);

    await page.keyboard.press('Enter');
    await expect(main).toBeFocused();
  });

  test('homepage keyboard order reaches primary navigation, every case study, and contact without a trap', async ({ page }) => {
    await openRoute(page, '/');
    const targets = [
      page.getByRole('link', { name: 'Skip to main content' }),
      page.locator('a.wordmark[href="/"]'),
      page.locator('.site-nav a[href="/#work"]'),
      page.locator('.site-nav a[href="/#about"]'),
      page.locator('.site-nav a[href="/#contact"]'),
      page.locator('a[href="#work"]'),
      ...projectRoutes.map((route) => page.locator(`a[href="${route}"]`).first()),
      page.locator('a[href^="mailto:"]').first(),
    ];

    for (const target of targets) {
      await tabUntilFocused(page, target);
      await expect(target).toBeFocused();
    }
  });

  for (const route of routes) {
    test(`${route}: 320px keeps navigation, form fields, and critical controls horizontally reachable`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await openRoute(page, route);
      await assertNoDocumentOverflow(page);
      await assertNarrowInteractiveContainment(page);
      await expect(page.locator('.site-nav')).toBeVisible();
      await expect(page.locator('.site-nav a')).toHaveCount(3);
    });
  }

  test('reporting controls are sequentially keyboard reachable', async ({ page }) => {
    await openRoute(page, '/work/reporting-workflow');
    const first = page.locator('[data-demo-stage="0"]');
    const last = page.locator('[data-demo-stage="3"]');
    await tabUntilFocused(page, first);
    await tabUntilFocused(page, last);
    await tabUntilFocused(page, page.locator('a[href^="mailto:"]').first());
  });

  test('compound-growth tabs, explorer controls, and disclosure summaries are keyboard reachable', async ({ page }) => {
    await openRoute(page, '/work/compound-growth');
    const fixedGraph = page.locator('[data-fixed-view="graph"]');
    const fixedTable = page.locator('[data-fixed-view="table"]');
    await tabUntilFocused(page, fixedGraph);
    await page.keyboard.press('ArrowLeft');
    await expect(fixedTable).toBeFocused();
    await expect(fixedTable).toHaveAttribute('aria-selected', 'true');

    const summaries = page.locator('details > summary');
    await expect(summaries).toHaveCount(2);
    await tabUntilFocused(page, summaries.first());
    await tabUntilFocused(page, page.locator('#cg-starting-age'));
    const explorerTable = page.locator('[data-explorer-view="table"]');
    const explorerGraph = page.locator('[data-explorer-view="graph"]');
    await tabUntilFocused(page, explorerTable);
    await page.keyboard.press('ArrowRight');
    await expect(explorerGraph).toBeFocused();
    await expect(explorerGraph).toHaveAttribute('aria-selected', 'true');
    await tabUntilFocused(page, summaries.last());
    await tabUntilFocused(page, page.locator('a[href^="mailto:"]').first());
  });

  test('Coast FI modes and calculator actions are reachable by keyboard', async ({ page }) => {
    await openRoute(page, '/work/coast-fi');
    const modeA = page.locator('#coast-mode-a');
    const modeD = page.locator('#coast-mode-d');
    await tabUntilFocused(page, modeA);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(modeD).toBeChecked();
    await expect(modeD).toBeFocused();

    await tabUntilFocused(page, page.locator('#coast-current-age'));
    await tabUntilFocused(page, page.getByRole('button', { name: 'Calculate' }));
    await tabUntilFocused(page, page.locator('[data-reset]'));

    const summaries = page.locator('[data-coast-calculator] details > summary');
    await expect(summaries).toHaveCount(2);
    await tabUntilFocused(page, summaries.first());
    await tabUntilFocused(page, summaries.last());
    await tabUntilFocused(page, page.locator('a[href="/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx"]'));
    await tabUntilFocused(page, page.locator('a[href^="mailto:"]').first());
  });

  test('Smith calculator update/reset, disclosures, workbook, and contact are reachable by keyboard', async ({ page }) => {
    await openRoute(page, '/work/smith-manoeuvre');
    await tabUntilFocused(page, page.locator('[data-reset-defaults]'));
    await tabUntilFocused(page, page.locator('#smith-home-value'));
    await tabUntilFocused(page, page.locator('#smith-deductible-share'));
    await tabUntilFocused(page, page.locator('[data-update-scenario]'));

    const summaries = page.locator('details > summary');
    const count = await summaries.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < count; index += 1) await tabUntilFocused(page, summaries.nth(index));

    await tabUntilFocused(page, page.locator('a[href="/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx"]'));
    await tabUntilFocused(page, page.locator('a[href^="mailto:"]').first());
  });

  test('Design Day native video controls are exposed and keyboard reachable', async ({ page }) => {
    await openRoute(page, '/work/design-day');
    const video = page.locator('video.design-video');
    await expect(video).toHaveAttribute('controls', '');
    await tabUntilFocused(page, video);
    await expect(video).toBeFocused();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const media = await video.evaluate((element) => {
      const node = element as HTMLVideoElement;
      return { controls: node.controls, currentSrc: node.currentSrc };
    });
    expect(media.controls).toBe(true);
    expect(media.currentSrc).toContain('/assets/projects/design-day/design-day-working-demo.mp4');
    await tabUntilFocused(page, page.locator('a[href^="mailto:"]').first());
  });

  test('homepage monument preserves vertical scrolling and reduced-motion structure', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    let monitor = await monitorPageErrors(page);
    await openRoute(page, '/');
    const stage = page.locator('[data-cathedral-stage]');
    await expect(stage).toHaveCount(1);
    expect(await stage.evaluate((element) => getComputedStyle(element).touchAction)).toContain('pan-y');

    const touchNotCancelled = await stage.evaluate((element) => {
      const init: PointerEventInit = { bubbles: true, cancelable: true, pointerType: 'touch', clientX: 120, clientY: 160 };
      const down = element.dispatchEvent(new PointerEvent('pointerdown', init));
      const move = element.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: 220 }));
      const cancel = element.dispatchEvent(new PointerEvent('pointercancel', init));
      return down && move && cancel;
    });
    expect(touchNotCancelled).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(monitor.errors).toEqual([]);
    monitor.stop();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    monitor = await monitorPageErrors(page);
    await openRoute(page, '/');
    const reducedStage = page.locator('[data-cathedral-stage]');
    await expect(reducedStage).toHaveAttribute('data-motion', 'reduced');
    const before = await reducedStage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
    await reducedStage.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 });
    await page.waitForTimeout(100);
    const after = await reducedStage.locator('[data-cathedral-ribbon]').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
    expect(after).toEqual(before);
    expect(monitor.errors).toEqual([]);
    monitor.stop();
  });

  test('reporting interaction synchronizes pressed state, media description, visible status, and live region', async ({ page }) => {
    const monitor = await monitorPageErrors(page);
    await openRoute(page, '/work/reporting-workflow');
    const stage = page.locator('[data-demo-stage="2"]');
    const expected = await stage.evaluate((button) => ({
      image: (button as HTMLElement).dataset.image,
      alt: (button as HTMLElement).dataset.alt,
      summary: (button as HTMLElement).dataset.summary,
    }));
    await stage.click();
    await expect(stage).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-demo-stage][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#reporting-demo-image')).toHaveAttribute('src', expected.image!);
    await expect(page.locator('#reporting-demo-image')).toHaveAttribute('alt', expected.alt!);
    await expect(page.locator('#reporting-demo-status')).toHaveText(expected.summary!);
    await expect(page.locator('#reporting-demo-live')).toHaveText(expected.summary!);
    expect(monitor.errors).toEqual([]);
    monitor.stop();
  });

  test('compound fixed display, EGR preset, and separate explorer controls remain operable', async ({ page }) => {
    const monitor = await monitorPageErrors(page);
    await openRoute(page, '/work/compound-growth');

    const fixedTable = page.locator('[data-fixed-view="table"]');
    await fixedTable.click();
    await expect(fixedTable).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-fixed-panel="table"]')).not.toHaveAttribute('hidden', '');
    await expect(page.locator('[data-fixed-panel="graph"]')).toHaveAttribute('hidden', '');

    const ratio = page.locator('[data-egr-ratio]');
    const ratioBefore = await ratio.textContent();
    const equalGains = page.locator('[data-egr-preset="equal-gains"]');
    await equalGains.click();
    await expect(equalGains).toHaveAttribute('aria-pressed', 'true');
    await expect(ratio).not.toHaveText(ratioBefore ?? '');
    await expect(ratio).toHaveText('1.00');

    const explorerBalance = page.locator('[data-summary-balance]');
    const balanceBefore = await explorerBalance.textContent();
    await page.locator('#cg-annual-return').fill('7');
    await expect.poll(() => explorerBalance.textContent(), { timeout: 5_000 }).not.toBe(balanceBefore);
    const explorerGraph = page.locator('[data-explorer-view="graph"]');
    await explorerGraph.click();
    await expect(explorerGraph).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-explorer-panel="graph"]')).not.toHaveAttribute('hidden', '');

    expect(monitor.errors).toEqual([]);
    monitor.stop();
  });

  test('Coast FI mode change, calculate, reset, and projection disclosure remain operable', async ({ page }) => {
    const monitor = await monitorPageErrors(page);
    await openRoute(page, '/work/coast-fi');
    await page.getByLabel('Coast by age').check();
    const targetAge = page.locator('#coast-target-age');
    await expect(targetAge).toBeVisible();
    await targetAge.fill('50');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).not.toHaveText('');
    await expect(page.locator('[data-portfolio-path]')).not.toHaveAttribute('d', '');

    const projectionDetails = page.locator('[data-coast-calculator] .projection-table-details');
    await projectionDetails.locator('summary').click();
    await expect(projectionDetails).toHaveAttribute('open', '');
    await projectionDetails.locator('summary').click();
    await expect(projectionDetails).not.toHaveAttribute('open', '');

    await page.locator('[data-reset]').click();
    await expect(page.locator('#coast-mode-a')).toBeChecked();
    await expect(page.locator('#coast-current-age')).toHaveValue('30');
    await expect(targetAge).toBeHidden();
    expect(monitor.errors).toEqual([]);
    monitor.stop();
  });

  test('Smith update, reset, and a calculator disclosure remain operable', async ({ page }) => {
    const monitor = await monitorPageErrors(page);
    await openRoute(page, '/work/smith-manoeuvre');
    const horizon = page.locator('#smith-horizon');
    const netDifference = page.locator('[data-output="netDifference"]');
    const defaultDifference = await netDifference.textContent();

    await horizon.fill('10');
    await page.locator('[data-update-scenario]').click();
    await expect(page.locator('[data-horizon-label]')).toContainText('10');
    await expect(netDifference).not.toHaveText(defaultDifference ?? '');

    const calculatorDetails = page.locator('[data-smith-calculator] details').first();
    await expect(calculatorDetails).toHaveCount(1);
    await calculatorDetails.locator('summary').click();
    await expect(calculatorDetails).toHaveAttribute('open', '');
    await calculatorDetails.locator('summary').click();
    await expect(calculatorDetails).not.toHaveAttribute('open', '');

    await page.locator('[data-reset-defaults]').click();
    await expect(horizon).toHaveValue('25');
    await expect(netDifference).toHaveText(defaultDifference ?? '');
    expect(monitor.errors).toEqual([]);
    monitor.stop();
  });

  for (const route of routes) {
    test(`${route}: native details disclosures toggle by keyboard without console/page errors`, async ({ page }) => {
      const monitor = await monitorPageErrors(page);
      await openRoute(page, route);
      const summaries = page.locator('details > summary');
      const count = await summaries.count();
      for (let index = 0; index < count; index += 1) {
        const summary = summaries.nth(index);
        const details = summary.locator('..');
        const initiallyOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
        await tabUntilFocused(page, summary);
        await page.keyboard.press('Enter');
        await expect.poll(() => details.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(!initiallyOpen);
        await page.keyboard.press('Enter');
        await expect.poll(() => details.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(initiallyOpen);
      }
      expect(monitor.errors).toEqual([]);
      monitor.stop();
    });
  }

  for (const route of ['/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre'] as const) {
    test(`${route}: calculator DOM has unique IDs and intact visible-control label associations`, async ({ page }) => {
      await openRoute(page, route);
      await assertCalculatorDomIntegrity(page);
    });
  }

  test('homepage project links resolve to the exact public route set and no route exposes a public GitHub link', async ({ page, request }) => {
    await openRoute(page, '/');
    const hrefs = await page.locator('a[href^="/work/"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')).filter(Boolean));
    expect(Array.from(new Set(hrefs)).sort()).toEqual([...projectRoutes].sort());

    for (const route of routes) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(200);
      await openRoute(page, route);
      await expect(page.locator('a[href*="github.com"], a[href*="githubusercontent.com"]')).toHaveCount(0);
    }
  });

  for (const asset of workbookDownloads) {
    test(`${asset.route}: approved workbook download filename is present and resolves`, async ({ page, request }) => {
      await openRoute(page, asset.route);
      const link = page.locator(`a[href="${asset.href}"][download]`);
      await expect(link).toHaveCount(1);
      const response = await request.get(asset.href);
      expect(response.status()).toBe(200);
      expect((await response.body()).byteLength).toBeGreaterThan(1000);
    });
  }

  test('one representative interaction per route produces no console/page errors', async ({ page }) => {
    for (const route of routes) {
      const monitor = await monitorPageErrors(page);
      await openRoute(page, route);

      if (route === '/') {
        await page.locator('[data-cathedral-stage]').dispatchEvent('pointermove', { pointerType: 'mouse', clientX: 120, clientY: 120 });
      } else if (route === '/work/design-day') {
        await page.locator('video[controls]').focus();
      } else if (route === '/work/reporting-workflow') {
        await page.locator('[data-demo-stage="1"]').click();
      } else if (route === '/work/grocery-automation') {
        const summary = page.locator('details > summary').first();
        if (await summary.count()) {
          await summary.click();
          await summary.click();
        } else {
          await page.locator('main a').first().focus();
        }
      } else if (route === '/work/askwill') {
        const summary = page.locator('details > summary').first();
        if (await summary.count()) {
          await summary.click();
          await summary.click();
        } else {
          await page.locator('main a').first().focus();
        }
      } else if (route === '/work/coast-fi') {
        await page.getByLabel('Coast by age').check();
      } else if (route === '/work/compound-growth') {
        await page.locator('[data-fixed-view="table"]').click();
      } else if (route === '/work/smith-manoeuvre') {
        await page.locator('[data-update-scenario]').click();
      }

      expect(monitor.errors, route).toEqual([]);
      monitor.stop();
    }
  });
});
