import type { EstimatedGrowthRatioEstimates } from '../../data/compound-growth/egrPresets';

export const compoundGrowthDefaultInput = {
  startingAge: 25,
  retirementAge: 65,
  startingPortfolio: 0,
  annualContribution: 1_200,
  annualReturn: 0.1,
} as const;

export type CompoundGrowthInputErrorCode =
  | 'NON_FINITE_INPUT'
  | 'AGE_NOT_WHOLE_YEAR'
  | 'STARTING_AGE_OUT_OF_RANGE'
  | 'RETIREMENT_AGE_OUT_OF_RANGE'
  | 'RETIREMENT_AGE_NOT_AFTER_STARTING_AGE'
  | 'PROJECTION_HORIZON_EXCEEDS_MAXIMUM'
  | 'NEGATIVE_STARTING_PORTFOLIO'
  | 'NEGATIVE_ANNUAL_CONTRIBUTION'
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

/** Approved V2 exploratory-control bounds, used to keep the annual ledger finite. */
export const compoundGrowthInputBounds = {
  minimumStartingAge: 18,
  maximumStartingAge: 70,
  minimumRetirementAge: 19,
  maximumRetirementAge: 80,
  maximumHorizonYears: 60,
} as const;

export interface CompoundGrowthExplorerInput {
  /** Whole-year age at the start of the annual projection. */
  readonly startingAge: number;
  /** Whole-year age after the final annual cycle. */
  readonly retirementAge: number;
  /** Headless-only optional initial balance; launch UI defaults and fixes this to zero. */
  readonly startingPortfolio?: number;
  /** Amount credited after each year's growth. */
  readonly annualContribution: number;
  /** Effective annual return as a decimal, and strictly greater than -1. */
  readonly annualReturn: number;
}

export interface AnnualProjectionPoint {
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
  /** Year 0 plus one point after each annual end-of-year contribution. */
  readonly annualPoints: readonly AnnualProjectionPoint[];
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

/**
 * Validates the approved V2 whole-year age range and 60-year horizon before
 * allocating the annual ledger. Return and contribution controls remain
 * headless-model inputs within their V2 mathematical contract.
 */
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
  assertFinite(normalized.annualContribution, 'Annual contribution');
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
  if (normalized.annualContribution < 0) {
    inputError('NEGATIVE_ANNUAL_CONTRIBUTION', 'Annual contribution must be zero or positive.');
  }
  if (normalized.annualReturn <= -1) {
    inputError('RETURN_NOT_GREATER_THAN_NEGATIVE_ONE', 'Annual return must be greater than -100%.');
  }

  return normalized;
}

/**
 * Generates the separate exploratory annual model. Existing balance grows once
 * per year and the annual contribution is then credited at year-end.
 */
export function calculateCompoundGrowthProjection(
  input: CompoundGrowthExplorerInput,
): CompoundGrowthProjection {
  const normalized = validateCompoundGrowthInput(input);
  const yearsInvested = normalized.retirementAge - normalized.startingAge;
  let projectedBalance = normalized.startingPortfolio;
  let cumulativeContributions = 0;
  const annualPoints: AnnualProjectionPoint[] = [{
    age: normalized.startingAge,
    yearsInvested: 0,
    cumulativeContributions,
    projectedBalance,
  }];

  for (let year = 1; year <= yearsInvested; year += 1) {
    // The V2 contract defines an explicit zero-return branch.
    const balanceAfterGrowth = normalized.annualReturn === 0
      ? projectedBalance
      : assertFiniteResult(
        projectedBalance * (1 + normalized.annualReturn),
        'Balance after annual growth',
      );
    projectedBalance = assertFiniteResult(
      balanceAfterGrowth + normalized.annualContribution,
      'Closing balance',
    );
    cumulativeContributions = assertFiniteResult(
      cumulativeContributions + normalized.annualContribution,
      'Cumulative contributions',
    );
    annualPoints.push({
      age: normalized.startingAge + year,
      yearsInvested: year,
      cumulativeContributions,
      projectedBalance,
    });
  }

  return {
    input: normalized,
    yearsInvested,
    finalBalance: projectedBalance,
    totalContributions: cumulativeContributions,
    projectedInvestmentGrowth: assertFiniteResult(
      projectedBalance - normalized.startingPortfolio - cumulativeContributions,
      'Projected investment growth',
    ),
    annualPoints,
  };
}

/** Returns display candidates: year 0, five-year intervals, and the final year. */
export function selectCompoundGrowthDisplayPoints(
  projection: CompoundGrowthProjection,
): readonly AnnualProjectionPoint[] {
  const points = projection.annualPoints;
  if (projection.yearsInvested < 5) return points;
  return points.filter((point) => point.yearsInvested === 0
    || point.yearsInvested % 5 === 0
    || point.yearsInvested === projection.yearsInvested);
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
