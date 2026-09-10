const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/lib/calculators/smithManoeuvre.ts');
const fixturePath = path.join(root, 'tests/fixtures/smith/smith-test-cases-v2.json');
const buildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smith-manoeuvre-engine-'));

function cleanup() {
  fs.rmSync(buildDirectory, { recursive: true, force: true });
}

try {
  const compile = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      source,
      '--target', 'ES2022',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--skipLibCheck',
      '--outDir', buildDirectory,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (compile.status !== 0) {
    throw new Error(`Unable to compile production Smith engine:\n${compile.stdout}\n${compile.stderr}`);
  }

  // The fixture suite always executes the compiled production module, never a
  // reference-model copy or fixture-specific implementation.
  const engine = require(path.join(buildDirectory, 'smithManoeuvre.js'));
  const {
    EPSILON,
    REVOLVING_LTV_MAX,
    levelMonthlyPayment,
    monthlyHelocRateFromAnnualRate,
    monthlyInvestmentReturnFromEffectiveAnnualReturn,
    mortgageMonthlyRateFromCanadianQuotedRate,
    runSmithScenario,
    SmithComputationLimitError,
    validateSmithInputs,
  } = engine;
  const suite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const fixtureHash = crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');
  assert.equal(fixtureHash, '533e3118da10e1df92e60451ed8164093af48b36d66169b5e06f48d2b36527cc', 'Smith fixture must remain byte-identical to canonical V2 JSON');
  const tolerance = suite.numericTolerance;

  function closeEnough(actual, expected) {
    const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= tolerance * scale;
  }

  function allFinite(result) {
    const topLevelNumbers = Object.values(result).filter((value) => typeof value === 'number');
    return topLevelNumbers.every(Number.isFinite)
      && result.periods.every((period) => Object.values(period).every(
        (value) => typeof value !== 'number' || Number.isFinite(value),
      ));
  }

  function assertTaxOffsetSchedule(result) {
    let annualInterest = 0;
    for (const period of result.periods) {
      annualInterest += period.helocInterestPaid;
      if (period.monthOfYear === 12) {
        const expected = annualInterest
          * result.inputs.deductibleInterestAssumption
          * result.inputs.marginalTaxRateProxy;
        assert.ok(closeEnough(period.estimatedTaxOffset, expected), `month ${period.month}: annual tax offset mismatch`);
        annualInterest = 0;
      } else {
        assert.ok(Math.abs(period.estimatedTaxOffset) <= tolerance, `month ${period.month}: tax offset occurred before year end`);
      }
    }
  }

  function assertPeriodInvariants(result) {
    assert.equal(result.periods.length, result.inputs.horizonYears * 12, 'period count must be deterministic');
    assertTaxOffsetSchedule(result);
    for (const [index, period] of result.periods.entries()) {
      assert.equal(period.month, index + 1, 'month numbering must be sequential');
      assert.equal(period.monthOfYear, (index % 12) + 1, 'month-of-year must be sequential');
      assert.ok(period.newHelocDraw <= period.actualPrincipalReduction + tolerance, `month ${period.month}: draw exceeded actual principal reduction`);
      assert.ok(period.newHelocDraw <= tolerance || period.smithSecuredLtv <= REVOLVING_LTV_MAX + tolerance, `month ${period.month}: draw exceeded 65% capacity`);
      assert.ok(period.smithClosingMortgage >= -EPSILON, `month ${period.month}: Smith mortgage became negative`);
      assert.ok(period.baselineClosingMortgage >= -EPSILON, `month ${period.month}: baseline mortgage became negative`);
      assert.ok(period.smithClosingHeloc >= -EPSILON, `month ${period.month}: HELOC became negative`);
      assert.ok(closeEnough(period.smithExternalCash, period.baselineExternalCash), `month ${period.month}: external cash budgets differ`);
    }
    assert.ok(closeEnough(result.externalCashBudgetDifference, 0), 'cumulative external cash budgets differ');
    assert.ok(closeEnough(
      result.smithNetFinancialPosition,
      result.endingSmithTaxablePortfolio - result.endingMortgageBalance - result.endingHelocBalance,
    ), 'Smith net position identity failed');
    assert.ok(closeEnough(
      result.baselineNetFinancialPosition,
      result.endingBaselinePortfolio - result.endingBaselineMortgageBalance,
    ), 'baseline net position identity failed');
    assert.ok(closeEnough(
      result.illustrativeNetPositionDifference,
      result.smithNetFinancialPosition - result.baselineNetFinancialPosition,
    ), 'illustrative net-position difference identity failed');
  }

  function check(name, result) {
    const periods = result.periods;
    switch (name) {
      case 'finite': return allFinite(result) ? null : 'Non-finite number found.';
      case 'noNegativeBalances': return periods.every((period) => period.smithClosingMortgage >= -tolerance && period.smithClosingHeloc >= -tolerance && period.baselineClosingMortgage >= -tolerance && period.smithClosingPortfolio >= -tolerance && period.baselineClosingPortfolio >= -tolerance) ? null : 'A debt or portfolio balance became negative.';
      case 'noNegativeDebtBalances': return periods.every((period) => period.smithClosingMortgage >= -tolerance && period.smithClosingHeloc >= -tolerance && period.baselineClosingMortgage >= -tolerance) ? null : 'A debt balance became negative.';
      case 'drawNeverExceedsActualPrincipalReduction': return periods.every((period) => period.newHelocDraw <= period.actualPrincipalReduction + tolerance) ? null : 'A HELOC draw exceeded actual mortgage principal reduction.';
      case 'newDrawNeverBreaches65':
      case 'drawOnlyAtOrBelow65': return periods.every((period) => period.newHelocDraw <= tolerance || period.smithSecuredLtv <= REVOLVING_LTV_MAX + tolerance) ? null : 'Positive new revolving borrowing occurred above the 65% envelope.';
      case 'cashBudgetEqual': return Math.abs(result.externalCashBudgetDifference) <= tolerance && periods.every((period) => Math.abs(period.smithExternalCash - period.baselineExternalCash) <= tolerance) ? null : `External cash budgets differ by ${result.externalCashBudgetDifference}.`;
      case 'mortgagePaidEarly': return result.smithMortgagePayoffMonth !== null && result.baselineMortgagePayoffMonth !== null && result.smithMortgagePayoffMonth < result.baselineMortgagePayoffMonth ? null : 'Smith mortgage did not pay off before baseline mortgage.';
      case 'mortgagePaid': return result.smithMortgagePayoffMonth !== null && result.endingMortgageBalance <= tolerance ? null : 'Smith mortgage was not paid within the scenario horizon.';
      case 'taxOffsetPositive': return result.estimatedCumulativeTaxOffset > tolerance ? null : 'Expected positive estimated tax offset.';
      case 'taxOffsetZero': return Math.abs(result.estimatedCumulativeTaxOffset) <= tolerance ? null : 'Estimated tax offset was not zero.';
      case 'taxOffsetIdentity': {
        const expected = result.cumulativeHelocInterestPaid * result.inputs.deductibleInterestAssumption * result.inputs.marginalTaxRateProxy;
        return closeEnough(result.estimatedCumulativeTaxOffset, expected) ? null : 'Tax-offset identity mismatch.';
      }
      case 'helocInterestZero': return Math.abs(result.cumulativeHelocInterestPaid) <= tolerance ? null : 'HELOC interest was not zero.';
      case 'firstMonthDrawZero': return Math.abs(periods[0]?.newHelocDraw ?? 0) <= tolerance ? null : 'First-month draw should be zero.';
      case 'noDrawEntireHorizon': return periods.every((period) => Math.abs(period.newHelocDraw) <= tolerance) ? null : 'Expected no HELOC draws.';
      case 'converges': return Math.abs(result.endingHelocBalance) <= tolerance && closeEnough(result.endingMortgageBalance, result.endingBaselineMortgageBalance) && closeEnough(result.endingSmithTaxablePortfolio, result.endingBaselinePortfolio) && closeEnough(result.smithNetFinancialPosition, result.baselineNetFinancialPosition) ? null : 'No-readvancement scenario did not converge to baseline.';
      case 'endingLtvAtMost65': return result.endingSecuredLtv <= REVOLVING_LTV_MAX + tolerance ? null : `Ending secured LTV ${result.endingSecuredLtv} exceeds 65%.`;
      case 'newDrawPositive': return periods.some((period) => period.newHelocDraw > tolerance) ? null : 'Expected at least one positive HELOC draw.';
      case 'postPayoffInvestmentPositive': return periods.some((period) => period.smithUnusedMortgageBudgetInvestment > tolerance) && periods.some((period) => period.baselineUnusedMortgageBudgetInvestment > tolerance) ? null : 'Expected former mortgage-budget cash to be invested after payoff.';
      case 'taxOffsetToPortfolioPositive': return periods.some((period) => period.taxOffsetToPortfolio > tolerance) ? null : 'Expected a post-mortgage tax offset to be invested in the Smith portfolio.';
      case 'allZeroScenario': return Math.abs(result.scheduledMonthlyMortgageBudget) <= tolerance && Math.abs(result.endingMortgageBalance) <= tolerance && Math.abs(result.endingHelocBalance) <= tolerance && Math.abs(result.endingSmithTaxablePortfolio) <= tolerance && Math.abs(result.endingBaselineMortgageBalance) <= tolerance && Math.abs(result.endingBaselinePortfolio) <= tolerance ? null : 'Zero-starting-mortgage scenario produced non-zero balances.';
      case 'golden': return null;
      default: return `Unknown check: ${name}`;
    }
  }

  const failures = [];
  for (const testCase of suite.cases) {
    try {
      const result = runSmithScenario(testCase.inputs);
      if (testCase.expectErrorIncludes) {
        failures.push(`${testCase.id}: expected an error containing '${testCase.expectErrorIncludes}'.`);
        continue;
      }
      assertPeriodInvariants(result);
      for (const name of testCase.checks ?? []) {
        const failure = check(name, result);
        if (failure) failures.push(`${testCase.id}: ${name}: ${failure}`);
      }
      for (const [key, expected] of Object.entries(testCase.expected ?? {})) {
        const actual = result[key];
        if (expected === null ? actual !== null : typeof actual !== 'number' || !closeEnough(actual, expected)) {
          failures.push(`${testCase.id}: golden ${key} mismatch; expected ${expected}, got ${actual}.`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!testCase.expectErrorIncludes || !message.includes(testCase.expectErrorIncludes)) {
        failures.push(`${testCase.id}: ${message}`);
      }
    }
  }

  // Focused pure-helper guardrails and fixed V2 conversion conventions.
  assert.equal(validateSmithInputs({ homeValue: 1, mortgageBalance: 0, quotedMortgageRate: 0, remainingAmortizationYears: 1, annualHelocRate: 0, expectedAnnualInvestmentReturn: 0, horizonYears: 1, marginalTaxRateProxy: 0, deductibleInterestAssumption: 0 }).length, 0);
  assert.match(validateSmithInputs({ homeValue: 1, mortgageBalance: 0, quotedMortgageRate: 0, remainingAmortizationYears: 1, annualHelocRate: 0, expectedAnnualInvestmentReturn: 0, horizonYears: Number.MAX_SAFE_INTEGER, marginalTaxRateProxy: 0, deductibleInterestAssumption: 0 }).join(' '), /safe positive whole number of months/);
  const manualRangeResult = runSmithScenario({ homeValue: 1, mortgageBalance: 0, quotedMortgageRate: 0, remainingAmortizationYears: 1, annualHelocRate: 0, expectedAnnualInvestmentReturn: 0, horizonYears: 41, marginalTaxRateProxy: 0, deductibleInterestAssumption: 0 });
  assert.equal(manualRangeResult.periods.length, 492, 'a reasonable manual horizon beyond the soft UI range must remain valid');
  assert.throws(
    () => runSmithScenario({ homeValue: 1, mortgageBalance: 0, quotedMortgageRate: 0, remainingAmortizationYears: 1, annualHelocRate: 0, expectedAnnualInvestmentReturn: 0, horizonYears: 1001, marginalTaxRateProxy: 0, deductibleInterestAssumption: 0 }),
    (error) => error instanceof SmithComputationLimitError && error.code === 'SIMULATION_LIMIT_EXCEEDED',
  );
  assert.throws(() => mortgageMonthlyRateFromCanadianQuotedRate(-0.01), /cannot be negative/);
  assert.throws(() => monthlyHelocRateFromAnnualRate(-0.01), /cannot be negative/);
  assert.throws(() => monthlyInvestmentReturnFromEffectiveAnnualReturn(-1), /greater than -100%/);
  assert.throws(() => levelMonthlyPayment(1, 0, 0), /months must be positive/);
  assert.ok(closeEnough(mortgageMonthlyRateFromCanadianQuotedRate(0.05), Math.pow(1.025, 1 / 6) - 1));
  assert.ok(closeEnough(monthlyHelocRateFromAnnualRate(0.06), 0.005));
  assert.ok(closeEnough(monthlyInvestmentReturnFromEffectiveAnnualReturn(0.06), Math.pow(1.06, 1 / 12) - 1));

  if (failures.length > 0) {
    throw new Error(`Smith V2 fixture failures (${failures.length}):\n${failures.join('\n')}`);
  }
  console.log(`Smith V2 production suite passed: ${suite.cases.length}/${suite.cases.length} canonical scenarios plus period and helper invariants.`);
} finally {
  cleanup();
}
