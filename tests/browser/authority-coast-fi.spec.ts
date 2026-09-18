import { test, expect } from '@playwright/test';
import { requiresAuthority } from './qa-profile';

async function open(page: any) {
  const response = await page.goto('/work/coast-fi', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
}

async function selectMode(page: any, mode: 'a' | 'b' | 'c' | 'd') {
  // The final R4 artifact styles the native radio through its visible label.
  await page.locator(`label[for="coast-mode-${mode}"]`).click();
  await expect(page.locator(`#coast-mode-${mode}`)).toBeChecked();
}

test.describe('Coast FI locked final-RC contracts', () => {
  test.skip(!requiresAuthority('coast'), 'Coast latest-authority UI assertions are required only for final-rc.');

  test('Coast by age is first/default and reset state', async ({ page }) => {
    await open(page);
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
    await selectMode(page, 'd');
    await page.locator('[data-reset]').click();
    await expect(page.locator('#coast-mode-b')).toBeChecked();
    await expect(page.locator('#coast-target-age')).toBeVisible();
  });

  test('canonical mode outputs remain stable', async ({ page }) => {
    await open(page);
    await selectMode(page, 'a');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toHaveText('$181,290');
    await selectMode(page, 'b');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$639');
    await expect(page.locator('[data-metrics]')).toContainText('$376,889');

    await selectMode(page, 'c');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toHaveText('52 years 4 months old');

    await selectMode(page, 'd');
    await page.getByRole('button', { name: 'Calculate' }).click();
    await expect(page.locator('[data-primary-value]')).toContainText('$405');
  });

  test('no graph-study A/B/C candidate controls leak into the route', async ({ page }) => {
    await open(page);
    await expect(page.getByText(/Graph\s+[ABC]/i)).toHaveCount(0);
    await expect(page.locator('[data-chart]')).toHaveCount(1);
    await expect(page.locator('[data-chart-desc]')).toHaveText('Projection from age 30 to age 65. Projected portfolio at retirement is $1,000,000. The retirement target is $1,000,000. Target Coast age: age 45');
    const details = page.locator('details').filter({ has: page.getByText('View selected projection points', { exact: true }) });
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('table')).toBeVisible();
    expect(await details.locator('tbody tr').count()).toBeGreaterThan(0);
  });
});


test('CF-D01 keeps Coast terminal spacing route-local and preserves non-Coast ContactBand spacing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Route-local spacing matrix is exercised once in Chromium.');

  const widths = [1440, 1280, 1024, 820, 390] as const;
  const expectedNonCoastMargin = (width: number) => width <= 480 ? 18 : width <= 980 ? 28 : 42;

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 820 ? 900 : 844 });
    await open(page);

    await expect(page.locator('.case-hero__premise')).toHaveText(
      'This tool models how early retirement contributions can give compound growth more time to work and reduce future contribution needs.',
    );

    const coastGeometry = await page.evaluate(() => {
      const coast = document.querySelector<HTMLElement>('.coast-page')!;
      const limits = document.querySelector<HTMLElement>('.limits-section')!;
      const lastCopy = document.querySelector<HTMLElement>('.limits-copy > p:last-child')!;
      const contact = document.querySelector<HTMLElement>('.contact-band')!;
      return {
        coastBottomPadding: parseFloat(getComputedStyle(coast).paddingBottom),
        limitsBottomPadding: parseFloat(getComputedStyle(limits).paddingBottom),
        contactMarginTop: parseFloat(getComputedStyle(contact).marginTop),
        visibleGap: contact.getBoundingClientRect().top - lastCopy.getBoundingClientRect().bottom,
      };
    });

    expect(coastGeometry.coastBottomPadding, `Coast bottom padding at ${width}px`).toBe(0);
    expect(coastGeometry.contactMarginTop, `Coast ContactBand margin at ${width}px`).toBe(0);
    expect(
      Math.abs(coastGeometry.visibleGap - coastGeometry.limitsBottomPadding),
      `Coast terminal gap at ${width}px: ${JSON.stringify(coastGeometry)}`,
    ).toBeLessThanOrEqual(1);

    const response = await page.goto('/work/askwill', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const nonCoastMargin = await page.locator('.contact-band').evaluate(
      (el) => parseFloat(getComputedStyle(el).marginTop),
    );
    expect(nonCoastMargin, `AskWill ContactBand margin at ${width}px`).toBe(expectedNonCoastMargin(width));
  }
});
