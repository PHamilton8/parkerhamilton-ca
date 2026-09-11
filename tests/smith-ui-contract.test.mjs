import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/components/calculators/SmithManoeuvreCalculator.astro', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../src/lib/calculators/smithManoeuvreView.ts', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../src/pages/work/smith-manoeuvre.astro', import.meta.url), 'utf8');
const projects = fs.readFileSync(new URL('../src/data/projects.ts', import.meta.url), 'utf8');

const engineFields = [
  'homeValue',
  'mortgageBalance',
  'quotedMortgageRate',
  'remainingAmortizationYears',
  'annualHelocRate',
  'expectedAnnualInvestmentReturn',
  'horizonYears',
  'marginalTaxRateProxy',
  'deductibleInterestAssumption',
];

test('Smith UI maps every public field to the audited engine contract', () => {
  assert.match(component, /runSmithScenario/);
  assert.match(component, /validateSmithInputs/);
  for (const field of engineFields) {
    assert.match(component, new RegExp(`data-smith-field=["']${field}["']`));
  }
  assert.match(view, /homeValue:\s*700_000/);
  assert.match(view, /mortgageBalance:\s*420_000/);
  assert.match(view, /quotedMortgageRate:\s*0\.045/);
  assert.match(view, /annualHelocRate:\s*0\.065/);
  assert.match(view, /expectedAnnualInvestmentReturn:\s*0\.06/);
  assert.match(view, /marginalTaxRateProxy:\s*0\.35/);
  assert.match(view, /deductibleInterestAssumption:\s*1/);
});

test('Smith UI contains presentation transforms but no second financing engine', () => {
  const prohibitedFinancialReimplementations = [
    /Math\.pow/,
    /REVOLVING_LTV_MAX/,
    /STARTING_UNINSURED_LTV_MAX/,
    /quotedMortgageRate\s*\/\s*2/,
    /annualHelocRate\s*\/\s*12/,
    /eligibleRevolvingCapacity\s*=/,
    /estimatedTaxOffset\s*=/,
    /newHelocDraw\s*=/,
  ];
  for (const pattern of prohibitedFinancialReimplementations) {
    assert.doesNotMatch(component, pattern);
    assert.doesNotMatch(view, pattern);
  }
  assert.match(view, /buildSmithAnnualSeries/);
  assert.match(view, /smithClosingPortfolio\s*-\s*period\.smithClosingMortgage\s*-\s*period\.smithClosingHeloc/);
  assert.match(view, /baselineClosingPortfolio\s*-\s*period\.baselineClosingMortgage/);
});

test('Smith calculator keeps visitor values local and does not expose a workbook download inside the tool', () => {
  for (const pattern of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /sendBeacon/,
    /localStorage/,
    /sessionStorage/,
    /URLSearchParams/,
    /console\.(log|info|debug|warn|error)/,
    /Smith_Manoeuvre_Public_Sanitized_V2\.xlsx/,
  ]) {
    assert.doesNotMatch(component, pattern);
  }
  assert.match(component, /All entered values stay in this browser session\./);
});

test('Smith dedicated route is a complete case study around the preserved calculator', () => {
  assert.match(route, /SmithManoeuvreCalculator/);
  assert.match(route, /canonicalPath="\/work\/smith-manoeuvre"/);
  assert.match(route, /The harder problem was making the comparison itself fair\./);
  assert.match(route, /Equal-cash baseline/);
  assert.match(route, /21 \/ 21/);
  assert.match(route, /Estimated tax offset/);
  assert.match(route, /Smith_Manoeuvre_Public_Sanitized_V2\.xlsx/);
  assert.doesNotMatch(route, /Smith_Manoeuvre_Public_Sanitized\.xlsx/);
  assert.doesNotMatch(route, /\bprofit\b/i);
  assert.doesNotMatch(route, /you should/i);
  assert.doesNotMatch(route, /worth it/i);
  assert.match(projects, /slug:\s*'smith-manoeuvre'[\s\S]*?usesSharedShell:\s*false/);
});
