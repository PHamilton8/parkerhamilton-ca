import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const canonicalRoutes = [
  '/',
  '/work/design-day',
  '/work/reporting-workflow',
  '/work/grocery-automation',
  '/work/askwill',
  '/work/coast-fi',
  '/work/compound-growth',
  '/work/smith-manoeuvre',
];

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

test('built output exposes exactly eight canonical HTML routes and one 404 document', () => {
  assert.equal(fs.existsSync(dist), true, 'dist/ must exist before built-route contract runs');
  const html = walk(dist).filter((file) => file.endsWith('.html'));
  const routes = html.map(routeForHtml).filter(Boolean).sort();
  assert.deepEqual(routes, [...canonicalRoutes].sort());
  assert.equal(html.some((file) => path.relative(dist, file).replaceAll(path.sep, '/') === '404.html'), true, 'dist/404.html is required');
});

test('every built canonical page has one self-consistent production canonical', () => {
  for (const route of canonicalRoutes) {
    const file = route === '/' ? path.join(dist, 'index.html') : path.join(dist, route.slice(1), 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const canonicals = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    assert.deepEqual(canonicals, [`https://parkerhamilton.ca${route}`], `${route} canonical mismatch`);
  }
});
