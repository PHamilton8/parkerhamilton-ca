import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const projects = fs.readFileSync(new URL('../src/data/projects.ts', import.meta.url), 'utf8');
const expected = [
  '/work/compound-growth',
  '/work/design-day',
  '/work/askwill',
  '/work/grocery-automation',
  '/work/reporting-workflow',
  '/work/smith-manoeuvre',
  '/work/coast-fi',
];

test('all required project routes are present', () => {
  for (const route of expected) assert.match(projects, new RegExp(route.replaceAll('/', '\\/')));
});

test('no public LinkedIn placeholder is configured', () => {
  const site = fs.readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
  assert.match(site, /linkedinUrl:\s*undefined/);
});
