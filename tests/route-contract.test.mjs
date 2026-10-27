import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const projects = read('src/data/projects.ts');
const site = read('src/data/site.ts');
const baseLayout = read('src/layouts/BaseLayout.astro');
const sitemap = read('src/pages/sitemap.xml.ts');

const expected = [
  '/work/compound-growth',
  '/work/design-day',
  '/work/askwill',
  '/work/grocery-automation',
  '/work/reporting-workflow',
  '/work/smith-manoeuvre',
  '/work/coast-fi',
];

const portfolioPages = [
  'src/pages/index.astro',
  'src/pages/work/compound-growth.astro',
  'src/pages/work/design-day.astro',
  'src/pages/work/askwill.astro',
  'src/pages/work/grocery-automation.astro',
  'src/pages/work/reporting-workflow.astro',
  'src/pages/work/smith-manoeuvre.astro',
  'src/pages/work/coast-fi.astro',
];

test('all required project routes are present', () => {
  for (const route of expected) assert.match(projects, new RegExp(route.replaceAll('/', '\\/')));
});

test('no public LinkedIn placeholder is configured', () => {
  assert.match(site, /linkedinUrl:\s*undefined/);
});

test('retired Wealthsimple route stays unlisted', () => {
  assert.doesNotMatch(projects, /\/wealthsimple-2026/);
  assert.doesNotMatch(site, /\/wealthsimple-2026/);
  assert.doesNotMatch(sitemap, /wealthsimple-2026/);
});

test('robots metadata remains opt-in so portfolio routes stay indexable', () => {
  assert.match(baseLayout, /robots\?:\s*string/);
  assert.match(baseLayout, /robots\s*&&\s*<meta name="robots" content=\{robots\}/);
  assert.doesNotMatch(baseLayout, /<meta name="robots" content="noindex/i);
  for (const path of portfolioPages) {
    assert.doesNotMatch(read(path), /\brobots\s*=/i, `${path} must remain indexable by default`);
  }
});
