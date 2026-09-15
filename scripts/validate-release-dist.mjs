import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://parkerhamilton.ca';
export const INDEXABLE_ROUTES = Object.freeze(['/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation', '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre']);
export const AUXILIARY_ROUTE = '/wealthsimple-2026';
export const ACCOUNTING = '8 indexable portfolio routes + 1 noindex auxiliary application route + true 404';
const WORKBOOKS = Object.freeze({
  'downloads/Coast_FI_Calculator_Public_Sanitized.xlsx': '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a',
  'downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx': '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9',
});
const decode = (s) => s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])]));
export function tags(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attrs(m[0])); }
const robots = (html) => tags(html, 'meta').filter(a => a.name?.toLowerCase() === 'robots').flatMap(a => (a.content || '').toLowerCase().split(/[\s,]+/));
const routeFile = (route) => route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;

export function validateReleaseDist(directory) {
  const root = path.resolve(directory);
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const absolute = path.join(dir, name); const stat = fs.lstatSync(absolute);
      assert.ok(!stat.isSymbolicLink(), `Symlink in release dist: ${absolute}`);
      if (stat.isDirectory()) walk(absolute); else { assert.ok(stat.isFile(), `Non-file artifact: ${absolute}`); files.push(path.relative(root, absolute).split(path.sep).join('/')); }
    }
  };
  walk(root);
  const read = (relative) => {
    assert.ok(files.includes(relative), `Missing release artifact: ${relative}`);
    const b = fs.readFileSync(path.join(root, relative)); assert.ok(b.length, `Empty release artifact: ${relative}`); return b;
  };
  const routes = [...INDEXABLE_ROUTES, AUXILIARY_ROUTE];
  assert.deepEqual(files.filter(f => f.endsWith('.html')).sort(), [...routes.map(routeFile), '404.html'].sort(), 'Release HTML must be exactly 8+1+404');
  for (const route of routes) {
    const html = read(routeFile(route)).toString();
    const canonical = tags(html, 'link').filter(a => a.rel?.toLowerCase().split(/\s+/).includes('canonical'));
    assert.deepEqual(canonical.map(a => a.href), [new URL(route, PRODUCTION_ORIGIN).href], `Production canonical mismatch: ${route}`);
    const directives = robots(html);
    if (route === AUXILIARY_ROUTE) {
      assert.ok(directives.includes('noindex') && directives.includes('noarchive'), 'Wealthsimple requires noindex, noarchive');
      const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => decode(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim());
      assert.deepEqual(h1, ['Wealthsimple 2027 - Parker Hamilton'], 'Wealthsimple H1 mismatch');
    } else {
      assert.ok(!directives.some(x => ['noindex', 'none'].includes(x)), `Portfolio route must be indexable: ${route}`);
      for (const a of tags(html, 'a')) {
        if (!a.href) continue;
        const link = new URL(a.href, new URL(route, PRODUCTION_ORIGIN));
        assert.ok(link.origin !== PRODUCTION_ORIGIN || link.pathname.replace(/\/$/, '') !== AUXILIARY_ROUTE, `Wealthsimple discovery link on ${route}`);
      }
    }
    assert.doesNotMatch(html, /(?:drive\.google\.com|docs\.google\.com|localhost|127\.0\.0\.1|file:\/\/|https?:\/\/[^\s"'<>]*workers\.dev)/i, `Private/preview URL in ${route}`);
  }
  const missing = read('404.html').toString();
  assert.match(missing, /404|not found/i, '404 must identify not-found state');
  assert.ok(robots(missing).includes('noindex'), '404 must be noindex');
  for (const required of ['_headers', '_redirects', 'robots.txt']) read(required);
  const sitemap = read('sitemap.xml').toString();
  const locations = [...sitemap.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/g)].map(m => decode(m[1].trim()));
  assert.deepEqual(locations.sort(), INDEXABLE_ROUTES.map(r => new URL(r, PRODUCTION_ORIGIN).href).sort(), 'Sitemap must contain exactly eight production portfolio URLs');
  for (const [file, expected] of Object.entries(WORKBOOKS)) {
    const bytes = read(file);
    assert.ok(bytes.length < 25 * 1024 * 1024, `${file} exceeds static asset limit`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Frozen workbook hash mismatch: ${file}`);
  }
  for (const file of files) {
    assert.ok(!/\.(map|zip|docx?|pptx?|csv|tsv)$/i.test(file), `Unapproved public file: ${file}`);
    if (/\.xlsx?$/i.test(file)) assert.ok(Object.hasOwn(WORKBOOKS, file), `Unapproved workbook: ${file}`);
  }
  return { passed: true, routeAccounting: ACCOUNTING, indexableRoutes: [...INDEXABLE_ROUTES], auxiliaryRoutes: [AUXILIARY_ROUTE], true404: true, fileCount: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--dist'), 'Usage: node scripts/validate-release-dist.mjs [--dist DIRECTORY]');
  const directory = args.length ? args[1] : fileURLToPath(new URL('../dist/', import.meta.url));
  console.log(JSON.stringify(validateReleaseDist(directory), null, 2));
}
