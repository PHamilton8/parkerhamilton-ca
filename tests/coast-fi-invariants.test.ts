import assert from "node:assert/strict";
import test from "node:test";
import {
  CoastFiInputError,
  CoastFiCalculationError,
  estimatedCoastAge,
  monthlyRateFromAnnualReal,
  portfolioFutureValue,
  requiredMonthlyToCoastByAge,
  requiredMonthlyToTarget,
  retirementTargetContribution,
  whereAmINow,
} from "../src/lib/calculators/coastFi.ts";

const typicalInputs = {
  currentAge: 30,
  currentPortfolio: 100_000,
  retirementAge: 65,
  retirementTarget: 1_000_000,
  annualRealReturn: 0.05,
};

test("already-Coast mode C result is the current month before any contribution", () => {
  const result = estimatedCoastAge({ ...typicalInputs, currentAge: 40, currentPortfolio: 350_000, monthlyContribution: 500 });
  assert.equal(result.reached, true);
  assert.equal(result.monthsUntilCoast, 0);
  assert.equal(result.totalContributedUntilCoast, 0);
});

test("zero contribution can remain below the Coast threshold", () => {
  const result = estimatedCoastAge({ ...typicalInputs, monthlyContribution: 0 });
  assert.equal(result.reached, false);
  assert.ok(result.projectedRetirementValueIfContributeToRetirement < result.retirementTarget);
});

test("zero real return uses a linear end-of-month contribution branch", () => {
  assert.equal(portfolioFutureValue(100, 25, 12, 0), 400);
});

test("negative but valid real return is preserved", () => {
  assert.ok(monthlyRateFromAnnualReal(-0.01) < 0);
  const result = whereAmINow({ ...typicalInputs, currentAge: 40, currentPortfolio: 900_000, annualRealReturn: -0.01 });
  assert.ok(result.requiredCoastThresholdToday > result.projectedRetirementValueZeroContributions);
});

test("targeting the current age reports no-time infeasibility", () => {
  const result = requiredMonthlyToCoastByAge({ ...typicalInputs, currentAge: 40, currentPortfolio: 250_000, targetCoastAge: 40 });
  assert.equal(result.feasible, false);
  assert.equal(result.reason, "NO_TIME_TO_CONTRIBUTE");
  assert.equal(result.requiredMonthlyContribution, null);
});

test("invalid age ordering is rejected", () => {
  assert.throws(
    () => whereAmINow({ ...typicalInputs, retirementAge: 29 }),
    (error: unknown) => error instanceof CoastFiInputError && error.code === "RETIREMENT_AGE_BEFORE_CURRENT_AGE",
  );
});

test("Coast search returns the first eligible whole month", () => {
  const result = estimatedCoastAge({
    currentAge: 30,
    currentPortfolio: 0,
    retirementAge: 31,
    retirementTarget: 1_200,
    annualRealReturn: 0,
    monthlyContribution: 100,
  });
  assert.equal(result.reached, true);
  assert.equal(result.monthsUntilCoast, 12);
  assert.equal(result.estimatedCoastAge?.label, "age 31");
});

test("solved contribution outputs are non-negative", () => {
  const coast = requiredMonthlyToCoastByAge({ ...typicalInputs, targetCoastAge: 45 });
  const retirement = retirementTargetContribution(typicalInputs);
  assert.ok((coast.requiredMonthlyContribution ?? 0) >= 0);
  assert.ok(retirement.requiredMonthlyContribution >= 0);
});

const nearNegativeOneReturn = -0.9999999999999999;

test("mode A rejects an unrepresentable Coast threshold", () => {
  assert.throws(
    () => whereAmINow({
      currentAge: 18,
      currentPortfolio: 0,
      retirementAge: 100,
      retirementTarget: 1_000_000,
      annualRealReturn: nearNegativeOneReturn,
    }),
    (error: unknown) => error instanceof CoastFiCalculationError && error.code === "NUMERIC_RANGE_EXCEEDED",
  );
});

test("mode B rejects an unrepresentable target-age Coast threshold", () => {
  assert.throws(
    () => requiredMonthlyToCoastByAge({
      currentAge: 18,
      currentPortfolio: 0,
      retirementAge: 100,
      retirementTarget: 1_000_000,
      annualRealReturn: nearNegativeOneReturn,
      targetCoastAge: 50,
    }),
    (error: unknown) => error instanceof CoastFiCalculationError && error.code === "NUMERIC_RANGE_EXCEEDED",
  );
});

test("mode C skips unrepresentable thresholds and does not report a false crossing", () => {
  const result = estimatedCoastAge({
    currentAge: 18,
    currentPortfolio: 0,
    retirementAge: 100,
    retirementTarget: 1_000_000,
    annualRealReturn: nearNegativeOneReturn,
    monthlyContribution: 0,
  });
  assert.equal(result.reached, false);
});

test("mode C rejects an underflowing threshold that a positive portfolio has crossed", () => {
  assert.throws(
    () => estimatedCoastAge({
      currentAge: 18,
      currentPortfolio: Number.MIN_VALUE,
      retirementAge: 100,
      retirementTarget: Number.MIN_VALUE,
      annualRealReturn: 0.20,
      monthlyContribution: 0,
    }),
    (error: unknown) => error instanceof CoastFiCalculationError && error.code === "NUMERIC_RANGE_EXCEEDED",
  );
});

test("mode C does not let a tolerance turn zero into a tiny positive threshold", () => {
  const result = estimatedCoastAge({
    currentAge: 18,
    currentPortfolio: 0,
    retirementAge: 100,
    retirementTarget: Number.MIN_VALUE,
    annualRealReturn: 0.20,
    monthlyContribution: 0,
  });
  assert.equal(result.reached, false);
});

test("mode D rejects an unrepresentable projected current portfolio", () => {
  assert.throws(
    () => retirementTargetContribution({
      currentAge: 18,
      currentPortfolio: Number.MAX_VALUE,
      retirementAge: 100,
      retirementTarget: Number.MAX_VALUE,
      annualRealReturn: 0.20,
    }),
    (error: unknown) => error instanceof CoastFiCalculationError && error.code === "NUMERIC_RANGE_EXCEEDED",
  );
});

test("a nonzero portfolio projection rejects underflow", () => {
  assert.throws(
    () => portfolioFutureValue(1, 0, 984, nearNegativeOneReturn),
    (error: unknown) => error instanceof CoastFiCalculationError && error.code === "NUMERIC_RANGE_EXCEEDED",
  );
});

test("required-monthly helper validates portfolios and preserves tiny nonzero returns", () => {
  assert.throws(
    () => requiredMonthlyToTarget(Number.NaN, 1_000, 12, 0.05),
    (error: unknown) => error instanceof CoastFiInputError && error.code === "INVALID_NUMBER",
  );
  assert.throws(
    () => requiredMonthlyToTarget(-100, 1_000, 12, 0.05),
    (error: unknown) => error instanceof CoastFiInputError && error.code === "NEGATIVE_PORTFOLIO",
  );
  assert.ok(monthlyRateFromAnnualReal(1e-16) > 0);
  assert.equal(portfolioFutureValue(1e16, 0, 480, 1e-16), 1e16 + 40);
});
