import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const fixture = JSON.parse(
  fs.readFileSync(new URL('../fixtures/smith/smith-test-cases-v2.json', import.meta.url), 'utf8'),
);

const caseById = (id: string) => fixture.cases.find((entry: { id: string }) => entry.id === id);
const percentageFields = new Set([
  'quotedMortgageRate',
  'annualHelocRate',
  'expectedAnnualInvestmentReturn',
  'marginalTaxRateProxy',
  'deductibleInterestAssumption',
]);

const currency0 = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
});
const currency2 = new Intl.NumberFormat('en-CA', {
  style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

async function applyInputs(page: Page, inputs: Record<string, number>) {
  for (const [field, rawValue] of Object.entries(inputs)) {
    const value = percentageFields.has(field) ? rawValue * 100 : rawValue;
    await page.locator(`[data-smith-field="${field}"]`).fill(String(value));
  }
}

async function updateScenario(page: Page) {
  await page.locator('[data-update-scenario]').click();
}

async function expectNoDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test('full Smith case study keeps the audited calculator as the central interactive', async ({ page }) => {
  await page.goto('/work/smith-manoeuvre');
  await expect(page.getByRole('heading', { level: 1, name: 'Smith Manoeuvre Model' })).toBeVisible();
  await expect(page).toHaveTitle('Smith Manoeuvre Model — Parker Hamilton');
  await expect(page.getByRole('heading', { level: 2, name: 'The harder problem was making the comparison itself fair.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Try the audited public scenario model.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'The model has to satisfy invariants, not just produce a number.' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'A transparent model should show what it leaves out.' })).toBeVisible();
  await expect(page.locator('[data-smith-calculator]')).toBeVisible();

  const download = page.getByRole('link', { name: /Download the sanitized V2 demonstration workbook/ });
  await expect(download).toHaveAttribute('href', '/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx');
  await expect(download).toHaveAttribute('download', '');
  await expect(page.locator('body')).not.toContainText('Smith_Manoeuvre_Public_Sanitized.xlsx');
});

test('default Smith UI is wired to the canonical V2 engine result', async ({ page }) => {
  const standard = caseById('standard-25y-golden');
  await page.goto('/work/smith-manoeuvre');
  await updateScenario(page);
  await expect(page.locator('[data-smith-status]')).toHaveText('Scenario updated.');

  const expected = standard.expected;
  const smithNet = expected.endingSmithTaxablePortfolio - expected.endingMortgageBalance - expected.endingHelocBalance;
  const baselineNet = expected.endingBaselinePortfolio - expected.endingBaselineMortgageBalance;

  await expect(page.locator('[data-output="netDifference"]')).toHaveText(currency0.format(expected.illustrativeNetPositionDifference));
  await expect(page.locator('[data-output="smithMortgage"]')).toHaveText(currency0.format(expected.endingMortgageBalance));
  await expect(page.locator('[data-output="smithHeloc"]')).toHaveText(currency0.format(expected.endingHelocBalance));
  await expect(page.locator('[data-output="smithPortfolio"]')).toHaveText(currency0.format(expected.endingSmithTaxablePortfolio));
  await expect(page.locator('[data-output="smithNet"]')).toHaveText(currency0.format(smithNet));
  await expect(page.locator('[data-output="baselineMortgage"]')).toHaveText(currency0.format(expected.endingBaselineMortgageBalance));
  await expect(page.locator('[data-output="baselinePortfolio"]')).toHaveText(currency0.format(expected.endingBaselinePortfolio));
  await expect(page.locator('[data-output="baselineNet"]')).toHaveText(currency0.format(baselineNet));
  await expect(page.locator('[data-output="mortgageBudget"]')).toHaveText(currency2.format(expected.scheduledMonthlyMortgageBudget));
  await expect(page.locator('[data-output="helocInterest"]')).toHaveText(currency0.format(expected.cumulativeHelocInterestPaid));
  await expect(page.locator('[data-output="taxOffset"]')).toHaveText(currency0.format(expected.estimatedCumulativeTaxOffset));
  await expect(page.locator('[data-output="smithPayoff"]')).toContainText(`Month ${expected.smithMortgagePayoffMonth}`);
  await expect(page.locator('[data-output="baselinePayoff"]')).toContainText(`Month ${expected.baselineMortgagePayoffMonth}`);
  expect(Math.abs(Number(await page.locator('[data-smith-calculator]').getAttribute('data-external-cash-budget-difference')))).toBeLessThan(1e-7);
});

test('chart and accessible data table use exactly the same engine-derived yearly values', async ({ page }) => {
  await page.goto('/work/smith-manoeuvre');
  await updateScenario(page);

  const chartRows = await page.locator('[data-chart-point]').evaluateAll((nodes) => nodes.map((node) => ({
    year: (node as SVGGElement).dataset.year,
    smith: (node as SVGGElement).dataset.smith,
    baseline: (node as SVGGElement).dataset.baseline,
  })));
  const tableRows = await page.locator('[data-comparison-row]').evaluateAll((nodes) => nodes.map((node) => ({
    year: (node as HTMLTableRowElement).dataset.year,
    smith: (node as HTMLTableRowElement).dataset.smith,
    baseline: (node as HTMLTableRowElement).dataset.baseline,
  })));
  expect(chartRows).toEqual(tableRows);

  const finalPoint = chartRows.at(-1)!;
  expect(Number(finalPoint.year)).toBe(25);
  const displayedSmith = await page.locator('[data-output="smithNet"]').textContent();
  const displayedBaseline = await page.locator('[data-output="baselineNet"]').textContent();
  expect(displayedSmith).toBe(currency0.format(Number(finalPoint.smith)));
  expect(displayedBaseline).toBe(currency0.format(Number(finalPoint.baseline)));
});

test('UI mapping preserves canonical edge scenarios and neutral validation behavior', async ({ page }) => {
  await page.goto('/work/smith-manoeuvre');

  const exact65 = caseById('exact-65-start');
  await applyInputs(page, exact65.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-smith-status]')).toHaveText('Scenario updated.');
  await expect(page.locator('[data-output="maxLtv"]')).toHaveText('65.0%');
  expect(Math.abs(Number(await page.locator('[data-smith-calculator]').getAttribute('data-external-cash-budget-difference')))).toBeLessThan(1e-7);

  const noReadvancement = caseById('no-readvancement-convergence');
  await applyInputs(page, noReadvancement.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-output="netDifference"]')).toHaveText('$0');

  const zeroHeloc = caseById('zero-heloc-rate-golden');
  await applyInputs(page, zeroHeloc.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-output="helocInterest"]')).toHaveText('$0');
  await expect(page.locator('[data-output="taxOffset"]')).toHaveText('$0');

  const zeroDeductibility = caseById('zero-deductibility-golden');
  await applyInputs(page, zeroDeductibility.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-output="taxOffset"]')).toHaveText('$0');
  await expect(page.locator('[data-output="netDifference"]')).toHaveText(currency0.format(zeroDeductibility.expected.illustrativeNetPositionDifference));

  const invalidLtv = caseById('starting-ltv-over-80-invalid');
  await applyInputs(page, invalidLtv.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-smith-field="mortgageBalance"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="mortgageBalance"]')).toContainText('80%');
  await expect(page.locator('[data-smith-status]')).toHaveText('Review the highlighted fields.');

  const invalidReturn = caseById('minus-100-return-invalid');
  await applyInputs(page, invalidReturn.inputs);
  await updateScenario(page);
  await expect(page.locator('[data-smith-field="expectedAnnualInvestmentReturn"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="expectedAnnualInvestmentReturn"]')).toContainText('greater than -100%');

  await page.locator('[data-smith-field="expectedAnnualInvestmentReturn"]').fill('6');
  await page.locator('[data-smith-field="horizonYears"]').fill('41');
  await updateScenario(page);
  await expect(page.locator('[data-warning-for="horizonYears"]')).toContainText('Outside the usual calculator range');
  await expect(page.locator('[data-horizon-label]')).toHaveText('41-year scenario');

  await page.locator('[data-smith-field="horizonYears"]').fill('1001');
  await updateScenario(page);
  await expect(page.locator('[data-error-for="horizonYears"]')).toContainText('computation limit');
  await expect(page.locator('[data-smith-status]')).toHaveText('Review the highlighted field.');

  await page.locator('[data-reset-defaults]').click();
  await expect(page.locator('[data-horizon-label]')).toHaveText('25-year scenario');
  await expect(page.locator('[data-smith-status]')).toHaveText('Scenario updated.');
});

test('calculator interaction stays client-side with no value persistence or request leakage', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/work/smith-manoeuvre');
  await page.waitForLoadState('networkidle');
  const startUrl = page.url();
  const postLoadRequests: string[] = [];
  page.on('request', (request) => postLoadRequests.push(request.url()));

  await page.locator('[data-smith-field="homeValue"]').fill('710123');
  await page.locator('[data-smith-field="mortgageBalance"]').fill('400321');
  await page.locator('[data-smith-field="quotedMortgageRate"]').fill('5.1');
  await updateScenario(page);
  await expect(page.locator('[data-smith-status]')).toHaveText('Scenario updated.');
  await page.waitForTimeout(100);

  expect(page.url()).toBe(startUrl);
  expect(postLoadRequests).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  expect(consoleErrors).toEqual([]);
});

test('Smith page and tool stay keyboard-usable, reduced-motion safe, and contained down to 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/work/smith-manoeuvre');
  await expectNoDocumentOverflow(page);

  const homeValue = page.getByLabel('Home value (CAD)');
  const mortgage = page.getByLabel('Mortgage balance (CAD)');
  await homeValue.focus();
  await expect(homeValue).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(mortgage).toBeFocused();

  await page.getByLabel('Annual HELOC rate (%)').fill('0');
  await page.getByLabel('Annual HELOC rate (%)').press('Enter');
  await expect(page.locator('[data-smith-status]')).toHaveText('Scenario updated.');
  await expect(page.locator('[data-output="helocInterest"]')).toHaveText('$0');

  const updateButton = page.getByRole('button', { name: 'Update scenario' });
  expect(await updateButton.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await homeValue.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

  const details = page.getByText('View yearly comparison data', { exact: true });
  await details.click();
  const tableRegion = page.getByRole('region', { name: 'Yearly Smith and baseline net-position comparison' });
  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await expectNoDocumentOverflow(page);
});

test('full Smith page clears the required responsive containment matrix and captures review screenshots', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const widths = [1440, 1280, 1024, 820, 768, 430, 390, 360, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    await page.goto('/work/smith-manoeuvre');
    await expect(page.locator('[data-smith-calculator]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Assumptions' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Results' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'The harder problem was making the comparison itself fair.' })).toBeVisible();
    await expectNoDocumentOverflow(page);
    if ([1440, 820, 390].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`smith-manoeuvre-page-${width}.png`), fullPage: true });
    }
  }
  expect(consoleErrors).toEqual([]);
});
