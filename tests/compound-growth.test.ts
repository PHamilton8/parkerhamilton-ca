import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CompoundGrowthInputError,
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

test('annual explorer matches an independently calculated ordinary annuity result', () => {
  const projection = calculateCompoundGrowthProjection({
    startingAge: 30,
    retirementAge: 32,
    startingPortfolio: 0,
    annualContribution: 100,
    annualReturn: 0.1,
  });
  assert.equal(projection.finalBalance, 210);
  assert.equal(projection.totalContributions, 200);
  assert.equal(projection.projectedInvestmentGrowth, 10);
});

test('starting portfolio compounds independently of contributions', () => {
  const projection = calculateCompoundGrowthProjection({
    startingAge: 30,
    retirementAge: 32,
    startingPortfolio: 100,
    annualContribution: 0,
    annualReturn: 0.1,
  });
  assertApproximatelyEqual(projection.finalBalance, 121);
  assert.equal(projection.totalContributions, 0);
});

test('zero return uses the annual straight-line branch', () => {
  const projection = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 28,
    startingPortfolio: 50,
    annualContribution: 100,
    annualReturn: 0,
  });
  assert.equal(projection.finalBalance, 350);
  assert.equal(projection.projectedInvestmentGrowth, 0);
});

test('zero contribution and zero starting portfolio remain zero', () => {
  const projection = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 65,
    annualContribution: 0,
    annualReturn: 0.1,
  });
  assert.equal(projection.finalBalance, 0);
  assert.equal(projection.totalContributions, 0);
});

test('end-of-year contribution timing leaves the first contribution unearned in year one', () => {
  const oneYear = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 26,
    annualContribution: 100,
    annualReturn: 0.1,
  });
  assert.equal(oneYear.annualPoints[0]?.projectedBalance, 0);
  assert.equal(oneYear.annualPoints[1]?.projectedBalance, 100);
});

test('annual ledger and display selection preserve valid age timing', () => {
  const projection = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 31,
    annualContribution: 100,
    annualReturn: 0,
  });
  assert.deepEqual(projection.annualPoints.map((point) => point.age), [25, 26, 27, 28, 29, 30, 31]);
  assert.deepEqual(selectCompoundGrowthDisplayPoints(projection).map((point) => point.yearsInvested), [0, 5, 6]);
});

test('invalid age, portfolio, and return inputs produce typed contract errors', () => {
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25,
    retirementAge: 25,
    annualContribution: 0,
    annualReturn: 0,
  }), 'RETIREMENT_AGE_NOT_AFTER_STARTING_AGE');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25.5,
    retirementAge: 65,
    annualContribution: 0,
    annualReturn: 0,
  }), 'AGE_NOT_WHOLE_YEAR');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 17,
    retirementAge: 65,
    annualContribution: 0,
    annualReturn: 0,
  }), 'STARTING_AGE_OUT_OF_RANGE');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25,
    retirementAge: 81,
    annualContribution: 0,
    annualReturn: 0,
  }), 'RETIREMENT_AGE_OUT_OF_RANGE');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 18,
    retirementAge: 79,
    annualContribution: 0,
    annualReturn: 0,
  }), 'PROJECTION_HORIZON_EXCEEDS_MAXIMUM');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25,
    retirementAge: 65,
    startingPortfolio: -1,
    annualContribution: 0,
    annualReturn: 0,
  }), 'NEGATIVE_STARTING_PORTFOLIO');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25,
    retirementAge: 65,
    annualContribution: -1,
    annualReturn: 0,
  }), 'NEGATIVE_ANNUAL_CONTRIBUTION');
  assertInputError(() => validateCompoundGrowthInput({
    startingAge: 25,
    retirementAge: 65,
    annualContribution: 0,
    annualReturn: -1,
  }), 'RETURN_NOT_GREATER_THAN_NEGATIVE_ONE');
});

test('valid negative and tiny returns produce finite output', () => {
  const negative = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 27,
    annualContribution: 100,
    annualReturn: -0.5,
  });
  assert.equal(negative.finalBalance, 150);
  const tiny = calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 27,
    annualContribution: 100,
    annualReturn: Number.MIN_VALUE,
  });
  assert.equal(tiny.finalBalance, 200);
  assert.equal(Number.isFinite(tiny.finalBalance), true);
});

test('unrepresentable annual growth fails with a typed numeric-range error', () => {
  assertInputError(() => calculateCompoundGrowthProjection({
    startingAge: 25,
    retirementAge: 27,
    startingPortfolio: Number.MAX_VALUE,
    annualContribution: 0,
    annualReturn: 1,
  }), 'NUMERIC_RESULT_NOT_REPRESENTABLE');
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
