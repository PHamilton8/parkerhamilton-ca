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

test('Coast FI route integrates the preserved calculator into a full case study and exposes only the approved sanitized workbook', () => {
  assert.match(route, /<CoastFiCalculator\s*\/>/);
  assert.match(route, /The public calculator started as a much bigger spreadsheet problem\./);
  assert.match(route, /The main scenario worked\. The audit still found real defects\./);
  assert.match(route, /href="\/downloads\/Coast_FI_Calculator_Public_Sanitized\.xlsx"/);
  assert.match(route, /download>/);
  assert.match(route, /sanitized demonstration workbook/i);
  assert.match(route, /<ContactBand\s*\/>/);
  const workbookLinks = route.match(/\/downloads\/[^"']+\.xlsx/g) ?? [];
  assert.deepEqual(workbookLinks, ['/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx']);
});
