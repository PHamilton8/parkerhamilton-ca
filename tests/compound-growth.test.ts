import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CompoundGrowthInputError,
  compoundGrowthDefaultInput,
  calculateCompoundGrowthProjection,
  calculateEstimatedGrowthRatio,
  selectCompoundGrowthDisplayPoints,
  validateCompoundGrowthInput,
} from '../src/lib/calculators/compoundGrowth.ts';
import {
  experiment4Results,
  experimentSummary,
  fixedExperimentalProjectionRows,
} from '../src/data/compound-growth/fixedExperimentalData.ts';
import { estimatedGrowthRatioPresets } from '../src/data/compound-growth/egrPresets.ts';

const canonicalHashes = {
  'projection-data.json': '18e9f2fe67702dacfcf0c9e5afbdb141c2ff8a532d1809499acba00212bed4a9',
  'experiment-summary.json': '342f410073d22e5a1dd38f80be8757252d82b13dbe283bfa0b3d035489a58012',
  'experiment-4-results.json': '74ac7423668fd3627ce8a811c05e76ce9166a92f1fc355591ae22c65f24ef0c0',
} as const;

const expectedProjectionRows = [
  [0, 0, 0],
  [5, 6000, 7717],
  [10, 12000, 20146],
  [15, 18000, 40162],
  [20, 24000, 72399],
  [25, 30000, 124316],
  [30, 36000, 207929],
  [35, 42000, 342589],
  [40, 48000, 559461],
] as const;

function sha256(path: URL): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertApproximatelyEqual(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

function assertInputError(
  action: () => unknown,
  expectedCode: CompoundGrowthInputError['code'],
): void {
  assert.throws(action, (error: unknown) => error instanceof CompoundGrowthInputError
    && error.code === expectedCode);
}

test('all three copied canonical JSON sources match their recorded authoritative hashes', () => {
  for (const [filename, hash] of Object.entries(canonicalHashes)) {
    const local = new URL(`../src/data/compound-growth/sources/${filename}`, import.meta.url);
    assert.equal(sha256(local), hash, filename);
  }
});

test('every historical experimental projection row is exact stored data', () => {
  assert.equal(fixedExperimentalProjectionRows.length, expectedProjectionRows.length);
  for (const [index, [years, contributions, balance]] of expectedProjectionRows.entries()) {
    assert.deepEqual(fixedExperimentalProjectionRows[index], {
      years_invested: years,
      cumulative_contributions_cad: contributions,
      total_account_balance_cad: balance,
    });
  }
  assert.ok(experimentSummary);
  assert.ok(experiment4Results);
});

test('fixed recreation data has no dependency on the exploratory calculator', () => {
  const fixedDataSource = readFileSync(
    new URL('../src/data/compound-growth/fixedExperimentalData.ts', import.meta.url),
    'utf8',
  );
  const runtimeImports = [...fixedDataSource.matchAll(/^import\s+.+?\s+from\s+['"]([^'"]+)['"]/gm)]
    .map((match) => match[1]);
  assert.deepEqual(runtimeImports, [
    './sources/experiment-4-results.json',
    './sources/experiment-summary.json',
    './sources/projection-data.json',
  ]);
});

test('final defaults and monthly model match the exact approved 8% scenario', () => {
  assert.deepEqual(compoundGrowthDefaultInput, { startingAge: 25, retirementAge: 65, startingPortfolio: 0, monthlyContribution: 100, annualReturn: 0.08 });
  const projection = calculateCompoundGrowthProjection(compoundGrowthDefaultInput);
  assert.equal(Math.round(projection.finalBalance), 322108);
  assert.equal(projection.totalContributions, 48000);
  assert.equal(Math.round(projection.projectedInvestmentGrowth), 274108);
  assert.equal(projection.monthsInvested, 480);
  assert.equal(projection.monthlyPoints.length, 481);
  assertApproximatelyEqual((1 + projection.monthlyRate) ** 12, 1.08, 1e-14);
});

test('monthly projection agrees with independent ordinary-annuity formula across rates and horizons', () => {
  for (const annualReturn of [-0.5, 0.03, 0.08, 0.2]) {
    for (const years of [1, 7, 40, 60]) {
      const monthlyContribution = 137.25;
      const projection = calculateCompoundGrowthProjection({ startingAge: 18, retirementAge: 18 + years, monthlyContribution, annualReturn });
      // Independent closed form; implementation instead advances each month.
      const rate = Math.pow(1 + annualReturn, 1 / 12) - 1;
      const expected = monthlyContribution * (Math.pow(1 + annualReturn, years) - 1) / rate;
      assertApproximatelyEqual(projection.finalBalance, expected, Math.max(1e-7, Math.abs(expected) * 1e-11));
    }
  }
});

test('month-end timing credits the first contribution after growth and preserves every monthly ledger point', () => {
  const result = calculateCompoundGrowthProjection({ startingAge: 25, retirementAge: 26, monthlyContribution: 100, annualReturn: 0.08 });
  assert.equal(result.monthlyPoints[0].projectedBalance, 0);
  assert.equal(result.monthlyPoints[1].projectedBalance, 100);
  assertApproximatelyEqual(result.monthlyPoints[2].projectedBalance, 100 * Math.pow(1.08, 1 / 12) + 100, 1e-12);
  assert.equal(result.monthlyPoints[1].monthsInvested, 1);
  assert.equal(result.monthlyPoints[1].age, 25 + 1 / 12);
  assert.equal(result.monthlyPoints.at(-1)?.age, 26);
  assert.equal(result.totalContributions, 1200);
});

test('doubling monthly contributions doubles the approved final balance without changing fixed research', () => {
  const projection = calculateCompoundGrowthProjection({ ...compoundGrowthDefaultInput, monthlyContribution: 200 });
  assert.equal(Math.round(projection.finalBalance), 644216);
  assert.equal(projection.totalContributions, 96000);
  assert.equal(fixedExperimentalProjectionRows.at(-1)?.total_account_balance_cad, 559461);
});

test('zero return is straight-line monthly saving and zero contributions remain zero', () => {
  const result = calculateCompoundGrowthProjection({ startingAge: 25, retirementAge: 28, monthlyContribution: 100, annualReturn: 0 });
  assert.equal(result.finalBalance, 3600);
  assert.equal(result.projectedInvestmentGrowth, 0);
  assert.ok(result.monthlyPoints.every((point) => point.projectedBalance === point.monthsInvested * 100));
  const zero = calculateCompoundGrowthProjection({ ...compoundGrowthDefaultInput, monthlyContribution: 0 });
  assert.equal(zero.finalBalance, 0);
});

test('optional headless balance remains separate from visible fixed-zero UI and contributions', () => {
  const result = calculateCompoundGrowthProjection({ startingAge: 30, retirementAge: 32, startingPortfolio: 100, monthlyContribution: 0, annualReturn: 0.1 });
  assertApproximatelyEqual(result.finalBalance, 121, 1e-10);
  assert.equal(result.totalContributions, 0);
  assertApproximatelyEqual(result.projectedInvestmentGrowth, 21, 1e-10);
});

test('display intervals are exactly month zero, every five years and final month', () => {
  for (const [years, expected] of [[1, [0, 12]], [5, [0, 60]], [6, [0, 60, 72]], [40, [0, 60, 120, 180, 240, 300, 360, 420, 480]]] as const) {
    const result = calculateCompoundGrowthProjection({ ...compoundGrowthDefaultInput, retirementAge: 25 + years });
    assert.deepEqual(selectCompoundGrowthDisplayPoints(result).map((point) => point.monthsInvested), expected);
  }
});

test('invalid monthly inputs preserve typed age, contribution, range and finite-number gates', () => {
  const base = { startingAge: 25, retirementAge: 65, monthlyContribution: 100, annualReturn: 0.08 };
  const cases = [
    [{ retirementAge: 25 }, 'RETIREMENT_AGE_NOT_AFTER_STARTING_AGE'],
    [{ startingAge: 25.5 }, 'AGE_NOT_WHOLE_YEAR'],
    [{ startingAge: 17 }, 'STARTING_AGE_OUT_OF_RANGE'],
    [{ retirementAge: 81 }, 'RETIREMENT_AGE_OUT_OF_RANGE'],
    [{ startingAge: 18, retirementAge: 79 }, 'PROJECTION_HORIZON_EXCEEDS_MAXIMUM'],
    [{ startingPortfolio: -1 }, 'NEGATIVE_STARTING_PORTFOLIO'],
    [{ monthlyContribution: -1 }, 'NEGATIVE_MONTHLY_CONTRIBUTION'],
    [{ annualReturn: -1 }, 'RETURN_NOT_GREATER_THAN_NEGATIVE_ONE'],
    [{ monthlyContribution: NaN }, 'NON_FINITE_INPUT'],
    [{ annualReturn: Infinity }, 'NON_FINITE_INPUT'],
  ] as const;
  for (const [input, code] of cases) assertInputError(() => validateCompoundGrowthInput({ ...base, ...input }), code);
});

test('tiny returns stay finite and unrepresentable monthly growth fails rather than leaking Infinity', () => {
  const tiny = calculateCompoundGrowthProjection({ startingAge: 25, retirementAge: 27, monthlyContribution: 100, annualReturn: Number.MIN_VALUE });
  assert.equal(tiny.finalBalance, 2400);
  assertInputError(() => calculateCompoundGrowthProjection({ startingAge: 25, retirementAge: 27, startingPortfolio: Number.MAX_VALUE, monthlyContribution: 0, annualReturn: 1 }), 'NUMERIC_RESULT_NOT_REPRESENTABLE');
});

test('EGR presets remain neutral data and calculate the specified ratios', () => {
  const equal = estimatedGrowthRatioPresets.find((preset) => preset.id === 'equal-gains');
  const experimental = estimatedGrowthRatioPresets.find((preset) => preset.id === 'experimental-projection');
  assert.ok(equal);
  assert.ok(experimental);
  assertApproximatelyEqual(calculateEstimatedGrowthRatio(equal.estimates).ratio ?? NaN, 1);
  assertApproximatelyEqual(calculateEstimatedGrowthRatio(experimental.estimates).ratio ?? NaN, 17.5 / 6.7);
  assert.equal(calculateEstimatedGrowthRatio({ year20: 1, year30: 1, year40: 2 }).ratio, undefined);
});
