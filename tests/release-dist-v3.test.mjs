import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDistFixture } from './preview-v3-dist-fixture.mjs';
import { validateReleaseDist } from '../scripts/validate-release-dist.mjs';

const withFixture = (action) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-dist-contract-')); const dist = path.join(dir, 'dist'); createDistFixture(dist); try { action(dist); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
const edit = (d, f, fn) => fs.writeFileSync(path.join(d, f), fn(fs.readFileSync(path.join(d, f), 'utf8')));
test('valid synthetic 8+1+404 fixture with exact frozen public workbooks passes', () => withFixture(d => {
  const result = validateReleaseDist(d); assert.equal(result.passed, true); assert.equal(result.indexableRoutes.length, 8); assert.deepEqual(result.auxiliaryRoutes, ['/wealthsimple-2026']); assert.equal(result.true404, true);
}));
const negative = [
  ['missing auxiliary', d => fs.rmSync(path.join(d, 'wealthsimple-2026'), { recursive: true }), /exactly 8\+1\+404/],
  ['extra public route', d => fs.writeFileSync(path.join(d, 'extra.html'), '<h1>Unexpected</h1>'), /exactly 8\+1\+404/],
  ['sitemap auxiliary leak', d => edit(d, 'sitemap.xml', x => x.replace('</urlset>', '<url><loc>https://parkerhamilton.ca/wealthsimple-2026</loc></url></urlset>')), /Sitemap/],
  ['duplicate sitemap URL', d => edit(d, 'sitemap.xml', x => x.replace('</urlset>', '<url><loc>https://parkerhamilton.ca/</loc></url></urlset>')), /Sitemap/],
  ['www canonical', d => edit(d, 'index.html', x => x.replace('https://parkerhamilton.ca/', 'https://www.parkerhamilton.ca/')), /canonical/],
  ['duplicate canonical', d => edit(d, 'index.html', x => x.replace('</head>', '<link rel="canonical" href="https://parkerhamilton.ca/"></head>')), /canonical/],
  ['indexable 404', d => edit(d, '404.html', x => x.replace('noindex', 'index')), /404 must be noindex/],
  ['portfolio noindex', d => edit(d, 'index.html', x => x.replace('</head>', '<meta name="robots" content="noindex"></head>')), /must be indexable/],
  ['auxiliary missing noarchive', d => edit(d, 'wealthsimple-2026/index.html', x => x.replace('noindex, noarchive', 'noindex')), /noindex, noarchive/],
  ['auxiliary wrong title', d => edit(d, 'wealthsimple-2026/index.html', x => x.replace('2027', '2026')), /H1 mismatch/],
  ['auxiliary portfolio discovery', d => edit(d, 'index.html', x => x.replace('</main>', '<a href="/wealthsimple-2026/?ref=nav">Application</a></main>')), /discovery link/],
  ['preview URL leak', d => edit(d, 'index.html', x => x.replace('</main>', '<img src="https://abc-test.example.workers.dev/image.png"></main>')), /Private\/preview URL/],
  ['workbook byte corruption', d => fs.appendFileSync(path.join(d, 'downloads/Coast_FI_Calculator_Public_Sanitized.xlsx'), 'corruption'), /Frozen workbook hash/],
  ['unapproved workbook', d => fs.writeFileSync(path.join(d, 'downloads/private.xlsx'), 'private'), /Unapproved workbook/],
  ['source map leak', d => fs.writeFileSync(path.join(d, 'debug.js.map'), '{}'), /Unapproved public file/],
  ['symlink artifact', d => fs.symlinkSync(path.join(d, 'robots.txt'), path.join(d, 'leak')), /Symlink/],
];
for (const [name, mutate, pattern] of negative) test(`release validator rejects ${name}`, () => withFixture(d => { mutate(d); assert.throws(() => validateReleaseDist(d), pattern); }));
