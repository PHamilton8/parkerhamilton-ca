/** Presentation-neutral values specified for the Estimated Growth Ratio explainer. */
export interface EstimatedGrowthRatioEstimates {
  readonly year20: number;
  readonly year30: number;
  readonly year40: number;
}

export interface EstimatedGrowthRatioPreset {
  readonly id: 'equal-gains' | 'experimental-projection';
  readonly estimates: EstimatedGrowthRatioEstimates;
}

export const estimatedGrowthRatioPresets: readonly EstimatedGrowthRatioPreset[] = [
  {
    id: 'equal-gains',
    estimates: { year20: 3.6, year30: 10.3, year40: 17 },
  },
  {
    id: 'experimental-projection',
    estimates: { year20: 3.6, year30: 10.3, year40: 27.8 },
  },
] as const;
