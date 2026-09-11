import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const component = fs.readFileSync('src/components/calculators/CoastFiCalculator.astro', 'utf8');
const client = fs.readFileSync('src/scripts/coastFiCalculator.ts', 'utf8');
const route = fs.readFileSync('src/pages/work/coast-fi.astro', 'utf8');

test('Coast FI UI imports the audited engine instead of reimplementing financial formulas', () => {
  assert.match(component, /scripts\/coastFiCalculator/);
  assert.match(client, /from '\.\.\/lib\/calculators\/coastFi'/);
  for (const fn of ['whereAmINow', 'requiredMonthlyToCoastByAge', 'estimatedCoastAge', 'retirementTargetContribution', 'coastThreshold', 'portfolioFutureValue']) {
    assert.match(client, new RegExp(`\\b${fn}\\b`));
  }
  assert.doesNotMatch(client, /Math\.pow|\*\*\s*\(|annualRealReturn\s*\/\s*12/);
});

test('Coast FI UI contains no financial-input persistence, networking, analytics, or logging', () => {
  const forbidden = [/localStorage\.(setItem|removeItem|clear)/, /sessionStorage\.(setItem|removeItem|clear)/, /\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /console\.(log|info|debug|warn|error)/, /URLSearchParams/, /history\.(pushState|replaceState)/];
  for (const pattern of forbidden) assert.doesNotMatch(client, pattern);
});

test('Coast FI route remains a calculator-only harness with no workbook link', () => {
  assert.match(route, /<CoastFiCalculator\s*\/>/);
  assert.doesNotMatch(route, /downloads\/|\.xlsx|ContactBand/);
});
