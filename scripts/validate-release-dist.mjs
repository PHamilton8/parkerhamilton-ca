import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);

const requiredRoutes = [
  '/',
  '/work/compound-growth',
  '/work/design-day',
  '/work/askwill',
  '/work/grocery-automation',
  '/work/reporting-workflow',
  '/work/smith-manoeuvre',
  '/work/coast-fi',
];

const assertFile = (relativePath, { allowEmpty = false } = {}) => {
  const url = new URL(relativePath, dist);
  assert.equal(fs.existsSync(url), true, `Missing release artifact: dist/${relativePath}`);
  const stat = fs.statSync(url);
  assert.equal(stat.isFile(), true, `Expected a file at dist/${relativePath}`);
  if (!allowEmpty) assert.ok(stat.size > 0, `Release artifact is empty: dist/${relativePath}`);
  return url;
};

for (const route of requiredRoutes) {
  const relative = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
  assertFile(relative);
}

const notFound = assertFile('404.html');
const notFoundHtml = fs.readFileSync(notFound, 'utf8');
assert.match(notFoundHtml, /404|not found/i, 'Custom 404 artifact should identify itself as a not-found page');

assertFile('_headers');
assertFile('_redirects');
assertFile('robots.txt');
const sitemap = assertFile('sitemap.xml');
const sitemapXml = fs.readFileSync(sitemap, 'utf8');
for (const route of requiredRoutes) {
  const expected = new URL(route, 'https://parkerhamilton.ca').href;
  assert.match(sitemapXml, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `sitemap.xml should include ${expected}`);
}
assert.doesNotMatch(sitemapXml, /\/404(?:<|\/)/, '404 must not be listed in sitemap.xml');

for (const workbook of [
  'downloads/Coast_FI_Calculator_Public_Sanitized.xlsx',
  'downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx',
]) {
  const workbookUrl = assertFile(workbook);
  assert.ok(fs.statSync(workbookUrl).size < 25 * 1024 * 1024, `${workbook} must stay below the Workers Static Assets 25 MiB per-file limit`);
}

console.log(`PASS: release dist contains the custom 404, deployment metadata, approved downloads, and all ${requiredRoutes.length} current public HTML routes.`);
