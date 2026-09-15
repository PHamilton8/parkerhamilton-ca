import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const projects = read('src/data/projects.ts');
const site = read('src/data/site.ts');
const baseLayout = read('src/layouts/BaseLayout.astro');
const wealthsimple = read('src/pages/wealthsimple-2026.astro');
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

test('Wealthsimple application page is an unlisted noindex auxiliary route', () => {
  assert.match(wealthsimple, /Wealthsimple 2027 - Parker Hamilton/);
  assert.doesNotMatch(wealthsimple, /Wealthsimple 2026 - Parker Hamilton/);
  assert.match(wealthsimple, /canonicalPath="\/wealthsimple-2026"/);
  assert.match(wealthsimple, /robots="noindex, noarchive"/);
  assert.match(wealthsimple, /\bcontrols\b/);
  assert.match(wealthsimple, /\bplaysinline\b/);
  assert.match(wealthsimple, /preload="metadata"/);
  assert.match(wealthsimple, /wealthsimple-application-video\.mp4/);
  assert.match(wealthsimple, /wealthsimple-application-video-poster\.webp/);
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
