import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Synthetic validation fixture only. Never a candidate or preview artifact.
export function createDistFixture(directory) {
  assert.ok(!fs.existsSync(directory), 'Fixture destination must not exist');
  const write = (name, value) => { const p = path.join(directory, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); };
  const routes = ['/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation', '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre'];
  for (const route of [...routes, '/wealthsimple-2026']) {
    const aux = route === '/wealthsimple-2026';
    write(route === '/' ? 'index.html' : `${route.slice(1)}/index.html`, `<!doctype html><html><head><link href="https://parkerhamilton.ca${route === '/' ? '/' : route}" rel="canonical">${aux ? '<meta content="noindex, noarchive" name="robots">' : ''}</head><body><main><h1>${aux ? 'Wealthsimple 2027 - Parker Hamilton' : 'Synthetic tooling fixture'}</h1></main></body></html>`);
  }
  write('404.html', '<!doctype html><meta name="robots" content="noindex"><h1>404 — not found</h1>');
  write('sitemap.xml', `<urlset>${routes.map(r => `<url><loc>https://parkerhamilton.ca${r}</loc></url>`).join('')}</urlset>`);
  for (const file of ['_headers', '_redirects', 'robots.txt']) write(file, '# Synthetic tooling fixture\n');
  for (const name of ['Coast_FI_Calculator_Public_Sanitized.xlsx', 'Smith_Manoeuvre_Public_Sanitized_V2.xlsx']) write(`downloads/${name}`, fs.readFileSync(new URL(`../public/downloads/${name}`, import.meta.url)));
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Usage: node tests/preview-v3-dist-fixture.mjs EMPTY_DESTINATION');
  createDistFixture(process.argv[2]);
  console.log('Synthetic release-validator fixture created. Not site certification.');
}
