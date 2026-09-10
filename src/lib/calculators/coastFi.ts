/**
 * Coast FI Calculator V2 — pure production calculation engine.
 *
 * Mathematical contract:
 * - all money is expressed in today's dollars;
 * - annual return is an effective real annual return;
 * - monthly contributions are constant real amounts and occur at month-end;
 * - taxes and account types are excluded;
 * - ages are represented on a month grid (whole years are valid inputs).
 *
 * This is a faithful production port of the approved V2 reference model.
 * It intentionally has no UI, storage, network, analytics, or date access.
 */

export const MAX_SUPPORTED_REAL_RETURN = 0.20;
export const HIGH_REAL_RETURN_WARNING_THRESHOLD = 0.10;
const AGE_MONTH_TOLERANCE = 1e-8;
const LOG_MAX_VALUE = Math.log(Number.MAX_VALUE);
const LOG_MIN_POSITIVE_VALUE = Math.log(Number.MIN_VALUE);

export type WarningCode = "HIGH_REAL_RETURN";
export type ErrorCode =
  | "INVALID_NUMBER"
  | "AGE_OUT_OF_RANGE"
  | "AGE_NOT_ON_MONTH_BOUNDARY"
  | "RETIREMENT_AGE_BEFORE_CURRENT_AGE"
  | "RETIREMENT_AGE_NOT_AFTER_CURRENT_AGE"
  | "TARGET_COAST_AGE_OUT_OF_RANGE"
  | "RETURN_OUT_OF_RANGE_LOW"
  | "RETURN_OUT_OF_RANGE_HIGH"
  | "NEGATIVE_PORTFOLIO"
  | "NON_POSITIVE_TARGET"
  | "NEGATIVE_MONTHLY_CONTRIBUTION"
  | "INVALID_MONTH_COUNT";

export type CalculationErrorCode = "NUMERIC_RANGE_EXCEEDED";
type CalculationRange = "OVERFLOW" | "UNDERFLOW";

export class CoastFiInputError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "CoastFiInputError";
    this.code = code;
  }
}

/**
 * The supplied values satisfy public input validation, but their mathematical
 * result cannot be represented as a finite JavaScript number.
 */
export class CoastFiCalculationError extends Error {
  readonly code: CalculationErrorCode;
  readonly range: CalculationRange;

  constructor(message: string, range: CalculationRange) {
    super(message);
    this.name = "CoastFiCalculationError";
    this.code = "NUMERIC_RANGE_EXCEEDED";
    this.range = range;
  }
}

export interface SharedInputs {
  currentAge: number;
  currentPortfolio: number;
  retirementAge: number;
  retirementTarget: number;
  annualRealReturn: number;
}

export interface AgeBreakdown {
  years: number;
  months: number;
  decimalYears: number;
  label: string;
}

export interface DurationBreakdown {
  years: number;
  months: number;
}

export interface ModeAResult {
  yearsToRetirement: number;
  requiredCoastThresholdToday: number;
  coastGapSurplus: number;
  isAboveCoastThreshold: boolean;
  projectedRetirementValueZeroContributions: number;
  warnings: WarningCode[];
}

export interface ModeBResult {
  feasible: boolean;
  reason: "NO_TIME_TO_CONTRIBUTE" | null;
  targetCoastAge: AgeBreakdown;
  contributionMonths: number;
  contributionDuration: DurationBreakdown;
  coastThresholdAtTargetAge: number;
  requiredMonthlyContribution: number | null;
  projectedBalanceAtCoastAge: number;
  targetRetirementValue: number;
  totalContributedUntilCoast: number | null;
  projectedRetirementValueIfStopAtCoast: number | null;
  warnings: WarningCode[];
}

export interface ModeCResult {
  reached: boolean;
  monthsUntilCoast: number | null;
  durationUntilCoast: DurationBreakdown | null;
  estimatedCoastAge: AgeBreakdown | null;
  projectedPortfolioAtCoast: number | null;
  coastThresholdAtCoast: number | null;
  totalContributedUntilCoast: number | null;
  projectedRetirementValueIfStopAtCoast: number | null;
  projectedRetirementValueIfContributeToRetirement: number;
  retirementTarget: number;
  warnings: WarningCode[];
}

export interface ModeDResult {
  contributionMonths: number;
  contributionDuration: DurationBreakdown;
  requiredMonthlyContribution: number;
  projectedCurrentPortfolioGrowth: number;
  futureValueOfContributions: number;
  projectedRetirementValue: number;
  retirementTarget: number;
  warnings: WarningCode[];
}

function assertFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new CoastFiInputError("INVALID_NUMBER", `${fieldName} must be a finite number.`);
  }
}

function assertFiniteResult(value: number, calculation: string): number {
  if (!Number.isFinite(value)) {
    throw new CoastFiCalculationError(`${calculation} exceeds the supported numeric range.`, "OVERFLOW");
  }
  return value;
}

function scalePositiveValue(value: number, exponent: number, calculation: string): number {
  if (value === 0 || exponent === 0) return value;
  const resultExponent = Math.log(value) + exponent;
  if (resultExponent > LOG_MAX_VALUE || resultExponent < LOG_MIN_POSITIVE_VALUE) {
    throw new CoastFiCalculationError(
      `${calculation} exceeds the supported numeric range.`,
      resultExponent > LOG_MAX_VALUE ? "OVERFLOW" : "UNDERFLOW",
    );
  }
  let result: number;
  if (Math.abs(exponent) < 0.5) {
    // expm1 preserves a real but very small growth/decline increment when
    // multiplying it by a large portfolio value.
    result = value + value * Math.expm1(exponent);
  } else if (exponent >= LOG_MIN_POSITIVE_VALUE && exponent <= LOG_MAX_VALUE) {
    result = value * Math.exp(exponent);
  } else {
    // The scaling factor itself is not representable, but the final value is.
    result = Math.exp(resultExponent);
  }
  result = assertFiniteResult(result, calculation);
  if (result === 0) {
    throw new CoastFiCalculationError(`${calculation} is below the supported numeric range.`, "UNDERFLOW");
  }
  return result;
}

function multiplyFinite(left: number, right: number, calculation: string): number {
  if (left === 0 || right === 0) return 0;
  const result = assertFiniteResult(left * right, calculation);
  if (result === 0) {
    throw new CoastFiCalculationError(`${calculation} is below the supported numeric range.`, "UNDERFLOW");
  }
  return result;
}

function addFinite(left: number, right: number, calculation: string): number {
  return assertFiniteResult(left + right, calculation);
}

function futureValueAtAnnualRate(
  value: number,
  annualRealReturn: number,
  years: number,
  calculation: string,
): number {
  if (value === 0 || years === 0) return value;
  return scalePositiveValue(value, Math.log1p(annualRealReturn) * years, calculation);
}

function validatePublicAnnualReturn(annualRealReturn: number): void {
  assertFinite(annualRealReturn, "Expected real annual return");
  if (annualRealReturn <= -1) {
    throw new CoastFiInputError(
      "RETURN_OUT_OF_RANGE_LOW",
      "Expected real annual return must be greater than -100%.",
    );
  }
  if (annualRealReturn > MAX_SUPPORTED_REAL_RETURN) {
    throw new CoastFiInputError(
      "RETURN_OUT_OF_RANGE_HIGH",
      "Expected real annual return must not exceed 20% in this educational calculator.",
    );
  }
}

function ageToWholeMonths(age: number, fieldName: string): number {
  assertFinite(age, fieldName);
  if (age < 18 || age > 100) {
    throw new CoastFiInputError("AGE_OUT_OF_RANGE", `${fieldName} must be between 18 and 100.`);
  }
  const exactMonths = age * 12;
  const roundedMonths = Math.round(exactMonths);
  if (Math.abs(exactMonths - roundedMonths) > AGE_MONTH_TOLERANCE) {
    throw new CoastFiInputError(
      "AGE_NOT_ON_MONTH_BOUNDARY",
      `${fieldName} must resolve to a whole number of months.`,
    );
  }
  return roundedMonths;
}

function validateShared(inputs: SharedInputs, requireFutureRetirement: boolean): {
  currentAgeMonths: number;
  retirementAgeMonths: number;
} {
  const currentAgeMonths = ageToWholeMonths(inputs.currentAge, "Current age");
  const retirementAgeMonths = ageToWholeMonths(inputs.retirementAge, "Retirement age");

  if (requireFutureRetirement && retirementAgeMonths <= currentAgeMonths) {
    throw new CoastFiInputError(
      "RETIREMENT_AGE_NOT_AFTER_CURRENT_AGE",
      "Retirement age must be greater than current age for contribution modes.",
    );
  }
  if (!requireFutureRetirement && retirementAgeMonths < currentAgeMonths) {
    throw new CoastFiInputError(
      "RETIREMENT_AGE_BEFORE_CURRENT_AGE",
      "Retirement age must be greater than or equal to current age.",
    );
  }

  assertFinite(inputs.currentPortfolio, "Current invested portfolio");
  if (inputs.currentPortfolio < 0) {
    throw new CoastFiInputError("NEGATIVE_PORTFOLIO", "Current invested portfolio must be at least $0.");
  }

  assertFinite(inputs.retirementTarget, "Retirement portfolio target");
  if (inputs.retirementTarget <= 0) {
    throw new CoastFiInputError("NON_POSITIVE_TARGET", "Retirement portfolio target must be greater than $0.");
  }

  validatePublicAnnualReturn(inputs.annualRealReturn);

  return { currentAgeMonths, retirementAgeMonths };
}

export function assumptionWarnings(annualRealReturn: number): WarningCode[] {
  validatePublicAnnualReturn(annualRealReturn);
  return annualRealReturn > HIGH_REAL_RETURN_WARNING_THRESHOLD ? ["HIGH_REAL_RETURN"] : [];
}

export function monthlyRateFromAnnualReal(annualRealReturn: number): number {
  validatePublicAnnualReturn(annualRealReturn);
  return assertFiniteResult(
    Math.expm1(Math.log1p(annualRealReturn) / 12),
    "Monthly real return",
  );
}

export function coastThreshold(
  retirementTarget: number,
  annualRealReturn: number,
  yearsRemaining: number,
): number {
  assertFinite(retirementTarget, "Retirement portfolio target");
  assertFinite(yearsRemaining, "Years remaining");
  if (retirementTarget <= 0) {
    throw new CoastFiInputError("NON_POSITIVE_TARGET", "Retirement portfolio target must be greater than $0.");
  }
  if (yearsRemaining < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Years remaining cannot be negative.");
  }
  validatePublicAnnualReturn(annualRealReturn);
  if (yearsRemaining === 0) return retirementTarget;
  return scalePositiveValue(
    retirementTarget,
    -Math.log1p(annualRealReturn) * yearsRemaining,
    "Coast threshold",
  );
}

function annuityFutureValueFactor(monthlyRate: number, months: number): number {
  if (!Number.isInteger(months) || months < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Month count must be a non-negative integer.");
  }
  if (months === 0) return 0;
  if (monthlyRate === 0) return months;
  const numerator = Math.expm1(Math.log1p(monthlyRate) * months);
  return assertFiniteResult(numerator / monthlyRate, "Contribution growth factor");
}

export function portfolioFutureValue(
  currentPortfolio: number,
  monthlyContribution: number,
  months: number,
  annualRealReturn: number,
): number {
  assertFinite(currentPortfolio, "Current invested portfolio");
  assertFinite(monthlyContribution, "Monthly contribution");
  if (currentPortfolio < 0) {
    throw new CoastFiInputError("NEGATIVE_PORTFOLIO", "Current invested portfolio must be at least $0.");
  }
  if (monthlyContribution < 0) {
    throw new CoastFiInputError("NEGATIVE_MONTHLY_CONTRIBUTION", "Monthly contribution must be at least $0.");
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Month count must be a non-negative integer.");
  }

  const monthlyRate = monthlyRateFromAnnualReal(annualRealReturn);
  const monthlyGrowthExponent = Math.log1p(monthlyRate) * months;
  const futureValueCurrent = scalePositiveValue(
    currentPortfolio,
    monthlyGrowthExponent,
    "Future value of the current portfolio",
  );
  const futureValueContributions = monthlyContribution === 0
    ? 0
    : multiplyFinite(
        monthlyContribution,
        annuityFutureValueFactor(monthlyRate, months),
        "Future value of contributions",
      );
  return addFinite(futureValueCurrent, futureValueContributions, "Projected portfolio");
}

/**
 * Returns null only when there are zero months available and the current
 * portfolio is below the requested target. Otherwise returns a non-negative
 * required month-end contribution.
 */
export function requiredMonthlyToTarget(
  currentPortfolio: number,
  targetValue: number,
  months: number,
  annualRealReturn: number,
): number | null {
  assertFinite(currentPortfolio, "Current invested portfolio");
  if (currentPortfolio < 0) {
    throw new CoastFiInputError("NEGATIVE_PORTFOLIO", "Current invested portfolio must be at least $0.");
  }
  assertFinite(targetValue, "Target value");
  if (targetValue <= 0) {
    throw new CoastFiInputError("NON_POSITIVE_TARGET", "Target value must be greater than $0.");
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Month count must be a non-negative integer.");
  }

  const monthlyRate = monthlyRateFromAnnualReal(annualRealReturn);
  const monthlyGrowthExponent = Math.log1p(monthlyRate) * months;
  if (
    currentPortfolio > 0
    && Math.log(currentPortfolio) + monthlyGrowthExponent > LOG_MAX_VALUE
  ) {
    // The unrepresentable future portfolio is necessarily above the finite
    // target, so no contribution is required.
    return 0;
  }
  const futureValueCurrent = scalePositiveValue(
    currentPortfolio,
    monthlyGrowthExponent,
    "Future value of the current portfolio",
  );

  if (futureValueCurrent >= targetValue) return 0;
  if (months === 0) return null;

  const gap = targetValue - futureValueCurrent;
  const contributionFactor = annuityFutureValueFactor(monthlyRate, months);
  const requiredContribution = assertFiniteResult(
    gap / contributionFactor,
    "Required monthly contribution",
  );
  if (requiredContribution === 0) {
    throw new CoastFiCalculationError(
      "Required monthly contribution is below the supported numeric range.",
      "UNDERFLOW",
    );
  }
  return requiredContribution;
}

export function durationFromMonths(totalMonths: number): DurationBreakdown {
  if (!Number.isInteger(totalMonths) || totalMonths < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Month count must be a non-negative integer.");
  }
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

export function ageBreakdownFromMonths(totalAgeMonths: number): AgeBreakdown {
  if (!Number.isInteger(totalAgeMonths) || totalAgeMonths < 0) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "Age month count must be a non-negative integer.");
  }
  const years = Math.floor(totalAgeMonths / 12);
  const months = totalAgeMonths % 12;
  const label = months === 0 ? `age ${years}` : `age ${years} years ${months} months`;
  return { years, months, decimalYears: totalAgeMonths / 12, label };
}

export function whereAmINow(inputs: SharedInputs): ModeAResult {
  const { currentAgeMonths, retirementAgeMonths } = validateShared(inputs, false);
  const monthsToRetirement = retirementAgeMonths - currentAgeMonths;
  const yearsToRetirement = monthsToRetirement / 12;
  const requiredCoastThresholdToday = coastThreshold(
    inputs.retirementTarget,
    inputs.annualRealReturn,
    yearsToRetirement,
  );
  const projectedRetirementValueZeroContributions = portfolioFutureValue(
    inputs.currentPortfolio,
    0,
    monthsToRetirement,
    inputs.annualRealReturn,
  );

  return {
    yearsToRetirement,
    requiredCoastThresholdToday,
    coastGapSurplus: inputs.currentPortfolio - requiredCoastThresholdToday,
    isAboveCoastThreshold: inputs.currentPortfolio >= requiredCoastThresholdToday,
    projectedRetirementValueZeroContributions,
    warnings: assumptionWarnings(inputs.annualRealReturn),
  };
}

export function requiredMonthlyToCoastByAge(
  inputs: SharedInputs & { targetCoastAge: number },
): ModeBResult {
  const { currentAgeMonths, retirementAgeMonths } = validateShared(inputs, true);
  const targetCoastAgeMonths = ageToWholeMonths(inputs.targetCoastAge, "Target Coast age");
  if (targetCoastAgeMonths < currentAgeMonths || targetCoastAgeMonths > retirementAgeMonths) {
    throw new CoastFiInputError(
      "TARGET_COAST_AGE_OUT_OF_RANGE",
      "Target Coast age must be between current age and retirement age.",
    );
  }

  const contributionMonths = targetCoastAgeMonths - currentAgeMonths;
  const yearsRemainingAtCoast = (retirementAgeMonths - targetCoastAgeMonths) / 12;
  const coastThresholdAtTargetAge = coastThreshold(
    inputs.retirementTarget,
    inputs.annualRealReturn,
    yearsRemainingAtCoast,
  );
  const requiredMonthlyContribution = requiredMonthlyToTarget(
    inputs.currentPortfolio,
    coastThresholdAtTargetAge,
    contributionMonths,
    inputs.annualRealReturn,
  );

  const feasible = requiredMonthlyContribution !== null;
  const projectedBalanceAtCoastAge = feasible
    ? portfolioFutureValue(
        inputs.currentPortfolio,
        requiredMonthlyContribution!,
        contributionMonths,
        inputs.annualRealReturn,
      )
    : inputs.currentPortfolio;

  const totalContributedUntilCoast = feasible
    ? multiplyFinite(
        requiredMonthlyContribution!,
        contributionMonths,
        "Total contributions until Coast",
      )
    : null;
  const projectedRetirementValueIfStopAtCoast = feasible
    ? futureValueAtAnnualRate(
        projectedBalanceAtCoastAge,
        inputs.annualRealReturn,
        yearsRemainingAtCoast,
        "Projected retirement value after coasting",
      )
    : null;

  return {
    feasible,
    reason: feasible ? null : "NO_TIME_TO_CONTRIBUTE",
    targetCoastAge: ageBreakdownFromMonths(targetCoastAgeMonths),
    contributionMonths,
    contributionDuration: durationFromMonths(contributionMonths),
    coastThresholdAtTargetAge,
    requiredMonthlyContribution,
    projectedBalanceAtCoastAge,
    targetRetirementValue: inputs.retirementTarget,
    totalContributedUntilCoast,
    projectedRetirementValueIfStopAtCoast,
    warnings: assumptionWarnings(inputs.annualRealReturn),
  };
}

export function estimatedCoastAge(
  inputs: SharedInputs & { monthlyContribution: number },
): ModeCResult {
  const { currentAgeMonths, retirementAgeMonths } = validateShared(inputs, true);
  assertFinite(inputs.monthlyContribution, "Monthly contribution");
  if (inputs.monthlyContribution < 0) {
    throw new CoastFiInputError(
      "NEGATIVE_MONTHLY_CONTRIBUTION",
      "Monthly contribution must be at least $0.",
    );
  }

  const monthsToRetirement = retirementAgeMonths - currentAgeMonths;
  const projectedRetirementValueIfContributeToRetirement = portfolioFutureValue(
    inputs.currentPortfolio,
    inputs.monthlyContribution,
    monthsToRetirement,
    inputs.annualRealReturn,
  );

  for (let monthIndex = 0; monthIndex <= monthsToRetirement; monthIndex += 1) {
    const absoluteAgeMonths = currentAgeMonths + monthIndex;
    const yearsRemaining = (retirementAgeMonths - absoluteAgeMonths) / 12;
    const projectedPortfolio = portfolioFutureValue(
      inputs.currentPortfolio,
      inputs.monthlyContribution,
      monthIndex,
      inputs.annualRealReturn,
    );
    let threshold: number;
    try {
      threshold = coastThreshold(
        inputs.retirementTarget,
        inputs.annualRealReturn,
        yearsRemaining,
      );
    } catch (error) {
      // An unrepresentably high positive threshold cannot be reached by the
      // finite portfolio above. Later months may still have a finite threshold.
      if (error instanceof CoastFiCalculationError && error.range === "OVERFLOW") continue;
      // An underflowing positive threshold is already crossed by any positive
      // portfolio, but cannot be returned as a valid result value.
      if (error instanceof CoastFiCalculationError && projectedPortfolio === 0) continue;
      throw error;
    }

    // Tiny tolerance prevents a purely floating-point miss at exact equality.
    const comparisonTolerance = threshold * 1e-12;
    if (
      projectedPortfolio >= threshold
      || threshold - projectedPortfolio <= comparisonTolerance
    ) {
      return {
        reached: true,
        monthsUntilCoast: monthIndex,
        durationUntilCoast: durationFromMonths(monthIndex),
        estimatedCoastAge: ageBreakdownFromMonths(absoluteAgeMonths),
        projectedPortfolioAtCoast: projectedPortfolio,
        coastThresholdAtCoast: threshold,
        totalContributedUntilCoast: multiplyFinite(
          inputs.monthlyContribution,
          monthIndex,
          "Total contributions until Coast",
        ),
        projectedRetirementValueIfStopAtCoast: futureValueAtAnnualRate(
          projectedPortfolio,
          inputs.annualRealReturn,
          yearsRemaining,
          "Projected retirement value after coasting",
        ),
        projectedRetirementValueIfContributeToRetirement,
        retirementTarget: inputs.retirementTarget,
        warnings: assumptionWarnings(inputs.annualRealReturn),
      };
    }
  }

  return {
    reached: false,
    monthsUntilCoast: null,
    durationUntilCoast: null,
    estimatedCoastAge: null,
    projectedPortfolioAtCoast: null,
    coastThresholdAtCoast: null,
    totalContributedUntilCoast: null,
    projectedRetirementValueIfStopAtCoast: null,
    projectedRetirementValueIfContributeToRetirement,
    retirementTarget: inputs.retirementTarget,
    warnings: assumptionWarnings(inputs.annualRealReturn),
  };
}

export function projectedRetirementValue(
  inputs: SharedInputs,
  monthlyContribution = 0,
): number {
  const { currentAgeMonths, retirementAgeMonths } = validateShared(inputs, false);
  assertFinite(monthlyContribution, "Monthly contribution");
  if (monthlyContribution < 0) {
    throw new CoastFiInputError(
      "NEGATIVE_MONTHLY_CONTRIBUTION",
      "Monthly contribution must be at least $0.",
    );
  }
  const monthsToRetirement = retirementAgeMonths - currentAgeMonths;
  return portfolioFutureValue(
    inputs.currentPortfolio,
    monthlyContribution,
    monthsToRetirement,
    inputs.annualRealReturn,
  );
}

export function retirementTargetContribution(inputs: SharedInputs): ModeDResult {
  const { currentAgeMonths, retirementAgeMonths } = validateShared(inputs, true);
  const contributionMonths = retirementAgeMonths - currentAgeMonths;
  const requiredMonthlyContribution = requiredMonthlyToTarget(
    inputs.currentPortfolio,
    inputs.retirementTarget,
    contributionMonths,
    inputs.annualRealReturn,
  );

  // Contribution modes always have at least one month, so null is impossible here.
  if (requiredMonthlyContribution === null) {
    throw new CoastFiInputError("INVALID_MONTH_COUNT", "No contribution months are available.");
  }

  const monthlyRate = monthlyRateFromAnnualReal(inputs.annualRealReturn);
  const projectedCurrentPortfolioGrowth = portfolioFutureValue(
    inputs.currentPortfolio,
    0,
    contributionMonths,
    inputs.annualRealReturn,
  );
  const futureValueOfContributions = requiredMonthlyContribution === 0
    ? 0
    : multiplyFinite(
        requiredMonthlyContribution,
        annuityFutureValueFactor(monthlyRate, contributionMonths),
        "Future value of contributions",
      );

  return {
    contributionMonths,
    contributionDuration: durationFromMonths(contributionMonths),
    requiredMonthlyContribution,
    projectedCurrentPortfolioGrowth,
    futureValueOfContributions,
    projectedRetirementValue: addFinite(
      projectedCurrentPortfolioGrowth,
      futureValueOfContributions,
      "Projected retirement value",
    ),
    retirementTarget: inputs.retirementTarget,
    warnings: assumptionWarnings(inputs.annualRealReturn),
  };
}
