import type { EstimatedGrowthRatioEstimates } from '../../data/compound-growth/egrPresets';

export const compoundGrowthDefaultInput = {
  startingAge: 25,
  retirementAge: 65,
  startingPortfolio: 0,
  monthlyContribution: 100,
  annualReturn: 0.08,
} as const;

export type CompoundGrowthInputErrorCode =
  | 'NON_FINITE_INPUT'
  | 'AGE_NOT_WHOLE_YEAR'
  | 'STARTING_AGE_OUT_OF_RANGE'
  | 'RETIREMENT_AGE_OUT_OF_RANGE'
  | 'RETIREMENT_AGE_NOT_AFTER_STARTING_AGE'
  | 'PROJECTION_HORIZON_EXCEEDS_MAXIMUM'
  | 'NEGATIVE_STARTING_PORTFOLIO'
  | 'NEGATIVE_MONTHLY_CONTRIBUTION'
  | 'RETURN_NOT_GREATER_THAN_NEGATIVE_ONE'
  | 'NUMERIC_RESULT_NOT_REPRESENTABLE';

export class CompoundGrowthInputError extends RangeError {
  readonly code: CompoundGrowthInputErrorCode;

  constructor(code: CompoundGrowthInputErrorCode, message: string) {
    super(message);
    this.name = 'CompoundGrowthInputError';
    this.code = code;
  }
}

/** Final owner-approved age bounds and finite monthly projection horizon. */
export const compoundGrowthInputBounds = {
  minimumStartingAge: 18,
  maximumStartingAge: 70,
  minimumRetirementAge: 19,
  maximumRetirementAge: 80,
  maximumHorizonYears: 60,
} as const;

export interface CompoundGrowthExplorerInput {
  /** Whole-year age at the start of the monthly projection. */
  readonly startingAge: number;
  /** Whole-year retirement age after the final monthly cycle. */
  readonly retirementAge: number;
  /** Headless-only optional initial balance; launch UI defaults and fixes this to zero. */
  readonly startingPortfolio?: number;
  /** Amount credited after each month’s growth. */
  readonly monthlyContribution: number;
  /** Effective annual return as a decimal, and strictly greater than -1. */
  readonly annualReturn: number;
}

export interface MonthlyProjectionPoint {
  readonly monthsInvested: number;
  readonly age: number;
  readonly yearsInvested: number;
  readonly cumulativeContributions: number;
  readonly projectedBalance: number;
}

export interface CompoundGrowthProjection {
  readonly input: Readonly<Required<CompoundGrowthExplorerInput>>;
  readonly yearsInvested: number;
  readonly finalBalance: number;
  readonly totalContributions: number;
  readonly projectedInvestmentGrowth: number;
  readonly monthsInvested: number;
  readonly monthlyRate: number;
  /** Month 0 plus every month-end, independently generated from the research data. */
  readonly monthlyPoints: readonly MonthlyProjectionPoint[];
}

export interface EstimatedGrowthRatioResult {
  readonly earlierGain: number;
  readonly laterGain: number;
  /** Undefined when the earlier gain is zero. */
  readonly ratio: number | undefined;
}

function inputError(code: CompoundGrowthInputErrorCode, message: string): never {
  throw new CompoundGrowthInputError(code, message);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) inputError('NON_FINITE_INPUT', `${label} must be finite.`);
}

function assertFiniteResult(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    inputError('NUMERIC_RESULT_NOT_REPRESENTABLE', `${label} cannot be represented as a finite number.`);
  }
  return value;
}

/** Validate the final monthly model before allocating its bounded ledger. */
export function validateCompoundGrowthInput(
  input: CompoundGrowthExplorerInput,
): Readonly<Required<CompoundGrowthExplorerInput>> {
  const normalized = {
    ...input,
    startingPortfolio: input.startingPortfolio ?? 0,
  };

  assertFinite(normalized.startingAge, 'Starting age');
  assertFinite(normalized.retirementAge, 'Retirement age');
  assertFinite(normalized.startingPortfolio, 'Starting portfolio');
  assertFinite(normalized.monthlyContribution, 'Monthly contribution');
  assertFinite(normalized.annualReturn, 'Annual return');

  if (!Number.isSafeInteger(normalized.startingAge) || !Number.isSafeInteger(normalized.retirementAge)) {
    inputError('AGE_NOT_WHOLE_YEAR', 'Starting and retirement ages must be whole-year safe integers.');
  }
  if (normalized.startingAge < compoundGrowthInputBounds.minimumStartingAge
    || normalized.startingAge > compoundGrowthInputBounds.maximumStartingAge) {
    inputError('STARTING_AGE_OUT_OF_RANGE', `Starting age must be between ${compoundGrowthInputBounds.minimumStartingAge} and ${compoundGrowthInputBounds.maximumStartingAge}.`);
  }
  if (normalized.retirementAge < compoundGrowthInputBounds.minimumRetirementAge
    || normalized.retirementAge > compoundGrowthInputBounds.maximumRetirementAge) {
    inputError('RETIREMENT_AGE_OUT_OF_RANGE', `Retirement age must be between ${compoundGrowthInputBounds.minimumRetirementAge} and ${compoundGrowthInputBounds.maximumRetirementAge}.`);
  }
  if (normalized.retirementAge <= normalized.startingAge) {
    inputError('RETIREMENT_AGE_NOT_AFTER_STARTING_AGE', 'Retirement age must be greater than starting age.');
  }
  if (normalized.retirementAge - normalized.startingAge > compoundGrowthInputBounds.maximumHorizonYears) {
    inputError('PROJECTION_HORIZON_EXCEEDS_MAXIMUM', `Projection horizon must not exceed ${compoundGrowthInputBounds.maximumHorizonYears} years.`);
  }
  if (normalized.startingPortfolio < 0) {
    inputError('NEGATIVE_STARTING_PORTFOLIO', 'Starting portfolio must be zero or positive.');
  }
  if (normalized.monthlyContribution < 0) {
    inputError('NEGATIVE_MONTHLY_CONTRIBUTION', 'Monthly contribution must be zero or positive.');
  }
  if (normalized.annualReturn <= -1) {
    inputError('RETURN_NOT_GREATER_THAN_NEGATIVE_ONE', 'Annual return must be greater than -100%.');
  }

  return normalized;
}

/**
 * Final approved simulator: convert the effective annual return to its equivalent
 * monthly rate, grow the existing balance, then credit the month-end contribution.
 * Research rows remain stored evidence and never depend on this function.
 */
export function calculateCompoundGrowthProjection(
  input: CompoundGrowthExplorerInput,
): CompoundGrowthProjection {
  const normalized = validateCompoundGrowthInput(input);
  const yearsInvested = normalized.retirementAge - normalized.startingAge;
  const monthsInvested = yearsInvested * 12;
  const monthlyRate = normalized.annualReturn === 0
    ? 0
    : Math.expm1(Math.log1p(normalized.annualReturn) / 12);
  let projectedBalance = normalized.startingPortfolio;
  let cumulativeContributions = 0;
  const monthlyPoints: MonthlyProjectionPoint[] = [{
    age: normalized.startingAge,
    yearsInvested: 0,
    monthsInvested: 0,
    cumulativeContributions,
    projectedBalance,
  }];

  for (let month = 1; month <= monthsInvested; month += 1) {
    const balanceAfterGrowth = monthlyRate === 0
      ? projectedBalance
      : assertFiniteResult(projectedBalance * (1 + monthlyRate), 'Balance after monthly growth');
    projectedBalance = assertFiniteResult(balanceAfterGrowth + normalized.monthlyContribution, 'Closing balance');
    cumulativeContributions = assertFiniteResult(cumulativeContributions + normalized.monthlyContribution, 'Cumulative contributions');
    monthlyPoints.push({
      age: normalized.startingAge + month / 12,
      yearsInvested: month / 12,
      monthsInvested: month,
      cumulativeContributions,
      projectedBalance,
    });
  }

  return {
    input: normalized,
    yearsInvested,
    monthsInvested,
    monthlyRate,
    finalBalance: projectedBalance,
    totalContributions: cumulativeContributions,
    projectedInvestmentGrowth: assertFiniteResult(projectedBalance - normalized.startingPortfolio - cumulativeContributions, 'Projected investment growth'),
    monthlyPoints,
  };
}

/** Exact final preview selection: month zero, five-year intervals, and final month. */
export function selectCompoundGrowthDisplayPoints(
  projection: CompoundGrowthProjection,
): readonly MonthlyProjectionPoint[] {
  return projection.monthlyPoints.filter((point) => point.monthsInvested === 0
    || point.monthsInvested % 60 === 0
    || point.monthsInvested === projection.monthsInvested);
}

/** Formula-only helper for the EGR explainer; it has no experiment-result semantics. */
export function calculateEstimatedGrowthRatio(
  estimates: EstimatedGrowthRatioEstimates,
): EstimatedGrowthRatioResult {
  assertFinite(estimates.year20, 'Year 20 estimate');
  assertFinite(estimates.year30, 'Year 30 estimate');
  assertFinite(estimates.year40, 'Year 40 estimate');
  const earlierGain = estimates.year30 - estimates.year20;
  const laterGain = estimates.year40 - estimates.year30;
  return {
    earlierGain,
    laterGain,
    ratio: earlierGain === 0 ? undefined : laterGain / earlierGain,
  };
}
