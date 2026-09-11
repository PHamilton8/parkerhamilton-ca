import type { SmithInputs, SmithResult } from './smithManoeuvre';

/**
 * UI-only defaults and presentation selectors for the Smith Manoeuvre V2 engine.
 * No financing, tax, mortgage, HELOC, or investment-return calculations live here.
 */
export const SMITH_DEFAULT_INPUTS: Readonly<SmithInputs> = Object.freeze({
  homeValue: 700_000,
  mortgageBalance: 420_000,
  quotedMortgageRate: 0.045,
  remainingAmortizationYears: 25,
  annualHelocRate: 0.065,
  expectedAnnualInvestmentReturn: 0.06,
  horizonYears: 25,
  marginalTaxRateProxy: 0.35,
  deductibleInterestAssumption: 1,
});

export const SMITH_SOFT_RANGES = Object.freeze({
  quotedMortgageRate: { min: 0, max: 0.15 },
  annualHelocRate: { min: 0, max: 0.20 },
  expectedAnnualInvestmentReturn: { min: -0.20, max: 0.20 },
  remainingAmortizationYears: { min: 1, max: 30 },
  horizonYears: { min: 1, max: 40 },
});

export type SmithAnnualPoint = {
  month: number;
  year: number;
  smithNetFinancialPosition: number;
  baselineNetFinancialPosition: number;
};

export type SmithChartPoint = SmithAnnualPoint & {
  x: number;
  smithY: number;
  baselineY: number;
};

export type SmithChartTick = {
  value: number;
  y: number;
};

export type SmithChartGeometry = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  zeroY: number;
  points: SmithChartPoint[];
  ticks: SmithChartTick[];
  smithPath: string;
  baselinePath: string;
};

const currency0 = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatSmithCurrency(value: number): string {
  return currency0.format(value);
}

export function formatSmithCurrencyDetailed(value: number): string {
  return currency2.format(value);
}

export function formatSmithPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSmithAxisCurrency(value: number): string {
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    const digits = absolute >= 10_000_000 ? 0 : 1;
    return `${sign}$${(absolute / 1_000_000).toFixed(digits)}M`;
  }
  if (absolute >= 1_000) return `${sign}$${Math.round(absolute / 1_000)}k`;
  return `${sign}$${Math.round(absolute)}`;
}

export function formatSmithPayoffMonth(month: number | null): string {
  if (month === null) return 'Not within horizon';
  if (month === 0) return 'At start';
  const years = Math.floor(month / 12);
  const remainingMonths = month % 12;
  if (remainingMonths === 0) return `Month ${month} (${years} years)`;
  if (years === 0) return `Month ${month}`;
  return `Month ${month} (${years}y ${remainingMonths}m)`;
}

/**
 * Selects annual/end-horizon points from the engine's monthly states for display.
 * The net-position subtraction below is the V2 reporting identity, not a second
 * scenario calculation. The final point is cross-checked in browser QA against
 * the engine's own aggregate result fields.
 */
export function buildSmithAnnualSeries(result: SmithResult): SmithAnnualPoint[] {
  const series: SmithAnnualPoint[] = [{
    month: 0,
    year: 0,
    smithNetFinancialPosition: -result.inputs.mortgageBalance,
    baselineNetFinancialPosition: -result.inputs.mortgageBalance,
  }];

  const finalMonth = result.periods.at(-1)?.month ?? 0;
  for (const period of result.periods) {
    if (period.month % 12 !== 0 && period.month !== finalMonth) continue;
    series.push({
      month: period.month,
      year: period.month / 12,
      smithNetFinancialPosition:
        period.smithClosingPortfolio - period.smithClosingMortgage - period.smithClosingHeloc,
      baselineNetFinancialPosition:
        period.baselineClosingPortfolio - period.baselineClosingMortgage,
    });
  }
  return series;
}

export function buildSmithChartGeometry(
  series: SmithAnnualPoint[],
  width = 760,
  height = 320,
): SmithChartGeometry {
  const left = 82;
  const right = 24;
  const top = 22;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const horizon = Math.max(1, series.at(-1)?.year ?? 1);

  const values = series.flatMap((point) => [
    point.smithNetFinancialPosition,
    point.baselineNetFinancialPosition,
  ]);
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (Math.abs(maximum - minimum) < 1e-9) {
    minimum -= 1;
    maximum += 1;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
    maximum += padding;
  }

  const scaleY = (value: number) => top + ((maximum - value) / (maximum - minimum)) * plotHeight;
  const scaleX = (year: number) => left + (year / horizon) * plotWidth;
  const points = series.map((point) => ({
    ...point,
    x: scaleX(point.year),
    smithY: scaleY(point.smithNetFinancialPosition),
    baselineY: scaleY(point.baselineNetFinancialPosition),
  }));
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = maximum - ((maximum - minimum) * index) / 4;
    return { value, y: scaleY(value) };
  });
  const pathFor = (key: 'smithY' | 'baselineY') => points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`)
    .join(' ');

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    zeroY: scaleY(0),
    points,
    ticks,
    smithPath: pathFor('smithY'),
    baselinePath: pathFor('baselineY'),
  };
}
