import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const indexableRoutes = [
  '/',
  '/work/design-day',
  '/work/reporting-workflow',
  '/work/grocery-automation',
  '/work/askwill',
  '/work/coast-fi',
  '/work/compound-growth',
  '/work/smith-manoeuvre',
];
const auxiliaryNoindexRoutes = ['/wealthsimple-2026'];
const allHtmlRoutes = [...indexableRoutes, ...auxiliaryNoindexRoutes];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });
}

function routeForHtml(file) {
  const rel = path.relative(dist, file).replaceAll(path.sep, '/');
  if (rel === 'index.html') return '/';
  if (rel === '404.html') return null;
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}`;
  if (rel.endsWith('.html')) return `/${rel.slice(0, -'.html'.length)}`;
  return null;
}

function pagePath(route) {
  return route === '/' ? path.join(dist, 'index.html') : path.join(dist, route.slice(1), 'index.html');
}

function metaRobots(html) {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of meta) {
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== 'robots') continue;
    return tag.match(/\bcontent=["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? '';
  }
  return '';
}

test('built output is exactly 8 indexable portfolio routes + 1 noindex auxiliary route + true 404', () => {
  assert.equal(fs.existsSync(dist), true, 'dist/ must exist before built-route contract runs');
  const htmlFiles = walk(dist).filter((file) => file.endsWith('.html'));
  const routes = htmlFiles.map(routeForHtml).filter(Boolean).sort();
  assert.deepEqual(routes, [...allHtmlRoutes].sort());
  assert.equal(htmlFiles.some((file) => path.relative(dist, file).replaceAll(path.sep, '/') === '404.html'), true, 'dist/404.html is required');
});

test('every built route has one production-apex self canonical', () => {
  for (const route of allHtmlRoutes) {
    const html = fs.readFileSync(pagePath(route), 'utf8');
    const canonicals = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    assert.deepEqual(canonicals, [`https://parkerhamilton.ca${route}`], `${route} canonical mismatch`);
  }
});

test('portfolio routes remain indexable while Wealthsimple remains noindex/noarchive', () => {
  for (const route of indexableRoutes) {
    const html = fs.readFileSync(pagePath(route), 'utf8');
    assert.doesNotMatch(metaRobots(html), /\bnoindex\b/, `${route} must remain indexable`);
  }
  const ws = fs.readFileSync(pagePath('/wealthsimple-2026'), 'utf8');
  const robots = metaRobots(ws);
  assert.match(robots, /\bnoindex\b/);
  assert.match(robots, /\bnoarchive\b/);
  assert.match(ws, /<h1[^>]*>\s*Wealthsimple 2027 - Parker Hamilton\s*<\/h1>/i);
  assert.match(ws, /<track\b[^>]*kind=["']captions["']/i);
});

test('sitemap contains exactly the 8 indexable portfolio routes and excludes Wealthsimple', () => {
  const xml = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim()).sort();
  const expected = indexableRoutes.map((route) => `https://parkerhamilton.ca${route}`).sort();
  assert.deepEqual(urls, expected);
  assert.doesNotMatch(xml, /wealthsimple-2026/i);
});

test('404 remains noindex and preview host noindex is response-scoped in _headers', () => {
  const page404 = fs.readFileSync(path.join(dist, '404.html'), 'utf8');
  assert.match(metaRobots(page404), /\bnoindex\b/);
  const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8');
  assert.match(headers, /https:\/\/:version\.:subdomain\.workers\.dev\/\*[\s\S]*X-Robots-Tag:\s*[^\n]*noindex[^\n]*nofollow[^\n]*noarchive/i);
});
