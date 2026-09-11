/**
 * Smith Manoeuvre public calculator production engine (V2 port).
 *
 * Pure deterministic monthly scenario engine. No UI, input logging, storage,
 * or network access.
 * All monetary calculations use JavaScript number precision and are NOT rounded
 * period-by-period. Display rounding belongs in the UI layer.
 *
 * Contract summary:
 * - Mortgage rate: quoted nominal annual rate compounded semi-annually,
 *   converted to an equivalent monthly rate.
 * - HELOC rate: annual rate / 12 simplified monthly approximation.
 * - Investment return: effective annual return converted to equivalent monthly.
 * - New HELOC draws occur at month-end and therefore begin accruing interest
 *   in the following model month.
 * - HELOC interest is paid from external household cash; it is not capitalized.
 * - Baseline invests matching external cash equal to Smith HELOC interest.
 * - Estimated tax offset is calculated once per 12-month model year and routed
 *   first to Smith mortgage principal, with any excess invested directly.
 * - New revolving borrowing never pushes secured LTV above 65%.
 * - Home value is constant.
 */

export const MONTHS_PER_YEAR = 12;
export const REVOLVING_LTV_MAX = 0.65;
export const STARTING_UNINSURED_LTV_MAX = 0.80;
export const EPSILON = 1e-8;
/** Operational protection only; it does not change the V2 financial model. */
export const MAX_SIMULATION_MONTHS = 12_000;

export class SmithComputationLimitError extends Error {
  readonly code = "SIMULATION_LIMIT_EXCEEDED" as const;

  constructor(months: number) {
    super(`Scenario horizon of ${months} months exceeds the ${MAX_SIMULATION_MONTHS}-month simulation limit.`);
    this.name = "SmithComputationLimitError";
  }
}

export interface SmithInputs {
  homeValue: number;
  mortgageBalance: number;
  quotedMortgageRate: number;
  remainingAmortizationYears: number;
  annualHelocRate: number;
  expectedAnnualInvestmentReturn: number;
  horizonYears: number;
  marginalTaxRateProxy: number;
  deductibleInterestAssumption: number;
}

export interface SmithPeriod {
  month: number;
  modelYear: number;
  monthOfYear: number;

  smithOpeningMortgage: number;
  smithMortgageInterest: number;
  smithMortgagePayment: number;
  smithMortgageAfterScheduledPayment: number;
  estimatedTaxOffset: number;
  taxOffsetToMortgage: number;
  taxOffsetToPortfolio: number;
  smithClosingMortgage: number;
  actualPrincipalReduction: number;

  smithOpeningHeloc: number;
  helocInterestPaid: number;
  eligibleRevolvingCapacity: number;
  newHelocDraw: number;
  smithClosingHeloc: number;

  smithOpeningPortfolio: number;
  smithUnusedMortgageBudgetInvestment: number;
  smithClosingPortfolio: number;

  baselineOpeningMortgage: number;
  baselineMortgageInterest: number;
  baselineMortgagePayment: number;
  baselineClosingMortgage: number;
  baselineUnusedMortgageBudgetInvestment: number;
  baselineMatchedHelocInterestInvestment: number;
  baselineOpeningPortfolio: number;
  baselineClosingPortfolio: number;

  smithExternalCash: number;
  baselineExternalCash: number;
  smithSecuredLtv: number;
}

export interface SmithResult {
  inputs: SmithInputs;
  monthlyMortgageRate: number;
  monthlyHelocRate: number;
  monthlyInvestmentReturn: number;
  scheduledMonthlyMortgageBudget: number;
  periods: SmithPeriod[];

  endingMortgageBalance: number;
  endingHelocBalance: number;
  endingSmithTaxablePortfolio: number;
  endingBaselineMortgageBalance: number;
  endingBaselinePortfolio: number;
  cumulativeHelocInterestPaid: number;
  estimatedCumulativeTaxOffset: number;
  smithNetFinancialPosition: number;
  baselineNetFinancialPosition: number;
  illustrativeNetPositionDifference: number;
  smithMortgagePayoffMonth: number | null;
  baselineMortgagePayoffMonth: number | null;
  maxSecuredLtv: number;
  endingSecuredLtv: number;
  cumulativeSmithExternalCash: number;
  cumulativeBaselineExternalCash: number;
  externalCashBudgetDifference: number;
}

function clampZero(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}

export function validateSmithInputs(inputs: SmithInputs): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value)) errors.push(`${key} must be finite.`);
  }

  if (!(inputs.homeValue > 0)) errors.push("homeValue must be greater than 0.");
  if (inputs.mortgageBalance < 0) errors.push("mortgageBalance cannot be negative.");
  if (inputs.mortgageBalance > inputs.homeValue * STARTING_UNINSURED_LTV_MAX + EPSILON) {
    errors.push("mortgageBalance exceeds the public model's 80% starting LTV boundary.");
  }
  if (inputs.quotedMortgageRate < 0) errors.push("quotedMortgageRate cannot be negative.");
  if (!(inputs.remainingAmortizationYears > 0) || !Number.isSafeInteger(inputs.remainingAmortizationYears * 12)) {
    errors.push("remainingAmortizationYears must represent a safe positive whole number of months.");
  }
  if (inputs.annualHelocRate < 0) errors.push("annualHelocRate cannot be negative.");
  if (!(inputs.expectedAnnualInvestmentReturn > -1)) {
    errors.push("expectedAnnualInvestmentReturn must be greater than -100%.");
  }
  if (!(inputs.horizonYears > 0) || !Number.isSafeInteger(inputs.horizonYears * 12)) {
    errors.push("horizonYears must represent a safe positive whole number of months.");
  }
  if (inputs.marginalTaxRateProxy < 0 || inputs.marginalTaxRateProxy > 1) {
    errors.push("marginalTaxRateProxy must be between 0 and 1.");
  }
  if (inputs.deductibleInterestAssumption < 0 || inputs.deductibleInterestAssumption > 1) {
    errors.push("deductibleInterestAssumption must be between 0 and 1.");
  }
  return errors;
}

export function mortgageMonthlyRateFromCanadianQuotedRate(quotedAnnualRate: number): number {
  assertFinite("quotedAnnualRate", quotedAnnualRate);
  if (quotedAnnualRate < 0) throw new Error("quotedAnnualRate cannot be negative.");
  const monthlyRate = Math.pow(1 + quotedAnnualRate / 2, 2 / 12) - 1;
  assertFinite("monthly mortgage rate", monthlyRate);
  return monthlyRate;
}

export function monthlyHelocRateFromAnnualRate(annualHelocRate: number): number {
  assertFinite("annualHelocRate", annualHelocRate);
  if (annualHelocRate < 0) throw new Error("annualHelocRate cannot be negative.");
  const monthlyRate = annualHelocRate / 12;
  assertFinite("monthly HELOC rate", monthlyRate);
  return monthlyRate;
}

export function monthlyInvestmentReturnFromEffectiveAnnualReturn(annualReturn: number): number {
  assertFinite("annualReturn", annualReturn);
  if (!(annualReturn > -1)) throw new Error("annualReturn must be greater than -100%.");
  const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;
  assertFinite("monthly investment return", monthlyReturn);
  return monthlyReturn;
}

export function levelMonthlyPayment(principal: number, monthlyRate: number, months: number): number {
  assertFinite("principal", principal);
  assertFinite("monthlyRate", monthlyRate);
  assertFinite("months", months);
  if (principal < 0) throw new Error("principal cannot be negative.");
  if (!(months > 0)) throw new Error("months must be positive.");
  if (principal <= EPSILON) return 0;
  if (Math.abs(monthlyRate) < EPSILON) {
    const payment = principal / months;
    assertFinite("level monthly payment", payment);
    return payment;
  }
  const payment = principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
  assertFinite("level monthly payment", payment);
  return payment;
}

export function runSmithScenario(rawInputs: SmithInputs): SmithResult {
  const inputs: SmithInputs = { ...rawInputs };
  const errors = validateSmithInputs(inputs);
  if (errors.length) throw new Error(errors.join(" "));

  const amortizationMonths = Math.round(inputs.remainingAmortizationYears * 12);
  const horizonMonths = Math.round(inputs.horizonYears * 12);
  if (horizonMonths > MAX_SIMULATION_MONTHS) {
    throw new SmithComputationLimitError(horizonMonths);
  }
  const monthlyMortgageRate = mortgageMonthlyRateFromCanadianQuotedRate(inputs.quotedMortgageRate);
  const monthlyHelocRate = monthlyHelocRateFromAnnualRate(inputs.annualHelocRate);
  const monthlyInvestmentReturn = monthlyInvestmentReturnFromEffectiveAnnualReturn(
    inputs.expectedAnnualInvestmentReturn,
  );
  const scheduledMonthlyMortgageBudget = levelMonthlyPayment(
    inputs.mortgageBalance,
    monthlyMortgageRate,
    amortizationMonths,
  );

  let smithMortgage = inputs.mortgageBalance;
  let smithHeloc = 0;
  let smithPortfolio = 0;
  let baselineMortgage = inputs.mortgageBalance;
  let baselinePortfolio = 0;

  let annualHelocInterestBucket = 0;
  let cumulativeHelocInterestPaid = 0;
  let estimatedCumulativeTaxOffset = 0;
  let cumulativeSmithExternalCash = 0;
  let cumulativeBaselineExternalCash = 0;

  let smithMortgagePayoffMonth: number | null = smithMortgage <= EPSILON ? 0 : null;
  let baselineMortgagePayoffMonth: number | null = baselineMortgage <= EPSILON ? 0 : null;
  let maxSecuredLtv = inputs.mortgageBalance / inputs.homeValue;

  const periods: SmithPeriod[] = [];

  for (let month = 1; month <= horizonMonths; month += 1) {
    const modelYear = Math.floor((month - 1) / 12) + 1;
    const monthOfYear = ((month - 1) % 12) + 1;

    // ---- Smith mortgage scheduled cash budget ----
    const smithOpeningMortgage = smithMortgage;
    const smithMortgageInterest = smithOpeningMortgage * monthlyMortgageRate;
    const smithMortgagePayment = smithOpeningMortgage <= EPSILON
      ? 0
      : Math.min(scheduledMonthlyMortgageBudget, smithOpeningMortgage + smithMortgageInterest);
    const smithMortgageAfterScheduledPayment = clampZero(
      Math.max(0, smithOpeningMortgage + smithMortgageInterest - smithMortgagePayment),
    );
    const smithUnusedMortgageBudgetInvestment = Math.max(
      0,
      scheduledMonthlyMortgageBudget - smithMortgagePayment,
    );

    // HELOC draws are defined as month-end transactions. Therefore this month's
    // simplified HELOC interest is based only on the opening HELOC balance.
    const smithOpeningHeloc = smithHeloc;
    const helocInterestPaid = smithOpeningHeloc * monthlyHelocRate;
    annualHelocInterestBucket += helocInterestPaid;
    cumulativeHelocInterestPaid += helocInterestPaid;

    // ---- Once-per-model-year estimated tax offset ----
    const isYearEnd = monthOfYear === 12;
    const estimatedTaxOffset = isYearEnd
      ? annualHelocInterestBucket
          * inputs.deductibleInterestAssumption
          * inputs.marginalTaxRateProxy
      : 0;
    if (isYearEnd) annualHelocInterestBucket = 0;
    estimatedCumulativeTaxOffset += estimatedTaxOffset;

    const taxOffsetToMortgage = Math.min(estimatedTaxOffset, smithMortgageAfterScheduledPayment);
    const taxOffsetToPortfolio = Math.max(0, estimatedTaxOffset - taxOffsetToMortgage);
    smithMortgage = clampZero(
      Math.max(0, smithMortgageAfterScheduledPayment - taxOffsetToMortgage),
    );

    // Readvancement is based on actual mortgage principal reduction, never on
    // scheduled principal that could exceed the remaining balance.
    const actualPrincipalReduction = Math.max(0, smithOpeningMortgage - smithMortgage);
    const eligibleRevolvingCapacity = Math.max(
      0,
      REVOLVING_LTV_MAX * inputs.homeValue - smithMortgage - smithOpeningHeloc,
    );
    const newHelocDraw = Math.max(
      0,
      Math.min(actualPrincipalReduction, eligibleRevolvingCapacity),
    );
    smithHeloc = clampZero(smithOpeningHeloc + newHelocDraw);

    // Portfolio convention: grow the opening balance, then add all contributions
    // generated during the month. Current-month contributions start earning in
    // the next model month.
    const smithOpeningPortfolio = smithPortfolio;
    smithPortfolio = clampZero(
      smithOpeningPortfolio * (1 + monthlyInvestmentReturn)
        + newHelocDraw
        + taxOffsetToPortfolio
        + smithUnusedMortgageBudgetInvestment,
    );

    // ---- Fair non-Smith baseline ----
    const baselineOpeningMortgage = baselineMortgage;
    const baselineMortgageInterest = baselineOpeningMortgage * monthlyMortgageRate;
    const baselineMortgagePayment = baselineOpeningMortgage <= EPSILON
      ? 0
      : Math.min(scheduledMonthlyMortgageBudget, baselineOpeningMortgage + baselineMortgageInterest);
    baselineMortgage = clampZero(
      Math.max(0, baselineOpeningMortgage + baselineMortgageInterest - baselineMortgagePayment),
    );
    const baselineUnusedMortgageBudgetInvestment = Math.max(
      0,
      scheduledMonthlyMortgageBudget - baselineMortgagePayment,
    );
    const baselineMatchedHelocInterestInvestment = helocInterestPaid;
    const baselineOpeningPortfolio = baselinePortfolio;
    baselinePortfolio = clampZero(
      baselineOpeningPortfolio * (1 + monthlyInvestmentReturn)
        + baselineUnusedMortgageBudgetInvestment
        + baselineMatchedHelocInterestInvestment,
    );

    // External household cash equality: each scenario receives the same fixed
    // mortgage-budget amount plus the same incremental cash equal to Smith HELOC
    // interest. Tax offsets and HELOC draws are endogenous scenario flows, not
    // additional external household cash.
    const smithExternalCash = smithMortgagePayment
      + smithUnusedMortgageBudgetInvestment
      + helocInterestPaid;
    const baselineExternalCash = baselineMortgagePayment
      + baselineUnusedMortgageBudgetInvestment
      + baselineMatchedHelocInterestInvestment;
    cumulativeSmithExternalCash += smithExternalCash;
    cumulativeBaselineExternalCash += baselineExternalCash;

    if (smithMortgagePayoffMonth === null && smithMortgage <= EPSILON) {
      smithMortgagePayoffMonth = month;
    }
    if (baselineMortgagePayoffMonth === null && baselineMortgage <= EPSILON) {
      baselineMortgagePayoffMonth = month;
    }

    const smithSecuredLtv = (smithMortgage + smithHeloc) / inputs.homeValue;
    maxSecuredLtv = Math.max(maxSecuredLtv, smithSecuredLtv);

    periods.push({
      month,
      modelYear,
      monthOfYear,
      smithOpeningMortgage,
      smithMortgageInterest,
      smithMortgagePayment,
      smithMortgageAfterScheduledPayment,
      estimatedTaxOffset,
      taxOffsetToMortgage,
      taxOffsetToPortfolio,
      smithClosingMortgage: smithMortgage,
      actualPrincipalReduction,
      smithOpeningHeloc,
      helocInterestPaid,
      eligibleRevolvingCapacity,
      newHelocDraw,
      smithClosingHeloc: smithHeloc,
      smithOpeningPortfolio,
      smithUnusedMortgageBudgetInvestment,
      smithClosingPortfolio: smithPortfolio,
      baselineOpeningMortgage,
      baselineMortgageInterest,
      baselineMortgagePayment,
      baselineClosingMortgage: baselineMortgage,
      baselineUnusedMortgageBudgetInvestment,
      baselineMatchedHelocInterestInvestment,
      baselineOpeningPortfolio,
      baselineClosingPortfolio: baselinePortfolio,
      smithExternalCash,
      baselineExternalCash,
      smithSecuredLtv,
    });
  }

  const smithNetFinancialPosition = smithPortfolio - smithMortgage - smithHeloc;
  const baselineNetFinancialPosition = baselinePortfolio - baselineMortgage;
  const illustrativeNetPositionDifference = smithNetFinancialPosition - baselineNetFinancialPosition;
  const endingSecuredLtv = (smithMortgage + smithHeloc) / inputs.homeValue;
  const externalCashBudgetDifference = cumulativeSmithExternalCash - cumulativeBaselineExternalCash;

  const result: SmithResult = {
    inputs,
    monthlyMortgageRate,
    monthlyHelocRate,
    monthlyInvestmentReturn,
    scheduledMonthlyMortgageBudget,
    periods,
    endingMortgageBalance: smithMortgage,
    endingHelocBalance: smithHeloc,
    endingSmithTaxablePortfolio: smithPortfolio,
    endingBaselineMortgageBalance: baselineMortgage,
    endingBaselinePortfolio: baselinePortfolio,
    cumulativeHelocInterestPaid,
    estimatedCumulativeTaxOffset,
    smithNetFinancialPosition,
    baselineNetFinancialPosition,
    illustrativeNetPositionDifference,
    smithMortgagePayoffMonth,
    baselineMortgagePayoffMonth,
    maxSecuredLtv,
    endingSecuredLtv,
    cumulativeSmithExternalCash,
    cumulativeBaselineExternalCash,
    externalCashBudgetDifference,
  };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Non-finite result: ${key}`);
    }
  }

  return result;
}

export interface SensitivityCell {
  annualInvestmentReturn: number;
  annualHelocRate: number;
  illustrativeNetPositionDifference: number | null;
  error?: string;
}

export function runReturnHelocSensitivity(
  inputs: SmithInputs,
  delta = 0.02,
): SensitivityCell[] {
  const returnRates = [
    inputs.expectedAnnualInvestmentReturn - delta,
    inputs.expectedAnnualInvestmentReturn,
    inputs.expectedAnnualInvestmentReturn + delta,
  ];
  const helocRates = [
    Math.max(0, inputs.annualHelocRate - delta),
    inputs.annualHelocRate,
    inputs.annualHelocRate + delta,
  ];

  const cells: SensitivityCell[] = [];
  for (const annualHelocRate of helocRates) {
    for (const expectedAnnualInvestmentReturn of returnRates) {
      try {
        const result = runSmithScenario({
          ...inputs,
          annualHelocRate,
          expectedAnnualInvestmentReturn,
        });
        cells.push({
          annualInvestmentReturn: expectedAnnualInvestmentReturn,
          annualHelocRate,
          illustrativeNetPositionDifference: result.illustrativeNetPositionDifference,
        });
      } catch (error) {
        cells.push({
          annualInvestmentReturn: expectedAnnualInvestmentReturn,
          annualHelocRate,
          illustrativeNetPositionDifference: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return cells;
}
