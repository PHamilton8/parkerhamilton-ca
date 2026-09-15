#!/usr/bin/env node
// Read-only focused Chromium smoke. No Cloudflare API, credentials or Access headers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { safeBase, safeError, INDEXABLE, ROUTES } from '../final-supplemental-audit/core.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  assert(process.argv[i]?.startsWith('--') && process.argv[i + 1], 'Use named argument/value pairs');
  assert(!Object.hasOwn(args, process.argv[i]), 'Duplicate argument');
  args[process.argv[i]] = process.argv[i + 1];
}
for (const name of ['--base-url', '--dist', '--candidate-root', '--source-sha', '--tree-sha', '--output']) assert(args[name], `Required ${name}`);
assert(Object.keys(args).every(k => ['--base-url', '--dist', '--candidate-root', '--source-sha', '--tree-sha', '--output', '--manifest-sha256', '--playwright-module', '--fixture-only'].includes(k)), 'Known arguments only');
assert.equal(process.versions.node, '24.19.0');
for (const key of ['--source-sha', '--tree-sha']) assert.match(args[key], /^[a-f0-9]{40}$/);
const mode = new URL(args['--base-url']).hostname === 'parkerhamilton.ca' ? 'production' : 'local';
const base = safeBase(args['--base-url'], mode);
const dist = path.resolve(args['--dist']), candidate = path.resolve(args['--candidate-root']), output = path.resolve(args['--output']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'RUNNING', mode, base, sourceSha: args['--source-sha'], treeSha: args['--tree-sha'], startedAt: new Date().toISOString(), browser: 'chromium', requestAuthentication: 'NONE', mutationPerformed: false, assets: [], routes: [], failures: [], scope: 'Focused public-first smoke; private preview, contrast, exhaustive accessibility and exhaustive browser certification are not claimed.' };
if (args['--fixture-only']) {
  assert.equal(args['--fixture-only'], 'true'); assert.equal(mode, 'local');
  assert.equal(args['--source-sha'], '0'.repeat(40)); assert.equal(args['--tree-sha'], '0'.repeat(40));
  report.fixtureOnly = true; report.scope = 'MECHANICS SELF-CHECK ON DISPOSABLE FIXTURE ONLY; ZERO SOURCE/TREE PLACEHOLDERS; NOT CANDIDATE OR RELEASE CERTIFICATION.';
}
let browser;
async function writeReport() { await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); }
async function files(root, rel = '') {
  const result = [];
  for (const item of (await fs.readdir(path.join(root, rel), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(rel, item.name);
    assert(!item.isSymbolicLink(), 'Dist symlinks are forbidden');
    if (item.isDirectory()) result.push(...await files(root, relative));
    else { assert(item.isFile()); result.push(relative); }
  }
  return result.sort();
}
async function get(url, permittedOrigins = [base]) {
  let target = new URL(url);
  for (let n = 0; n < 6; n++) {
    assert(permittedOrigins.includes(target.origin), 'Cross-origin GET rejected');
    assert(!target.username && !target.password, 'URL credentials rejected');
    const response = await fetch(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(60000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) { target = new URL(response.headers.get('location'), target); continue; }
    return response;
  }
  throw new Error('Redirect chain exceeds bound');
}
async function verifyVideo(page, route, expect, parseVtt) {
  const video = page.locator('video'), track = video.locator('track[kind="captions"]');
  await expect(video).toHaveCount(1); await expect(track).toHaveCount(1);
  await expect(track).toHaveAttribute('srclang', 'en');
  await expect.poll(() => video.evaluate(v => Number.isFinite(v.duration))).toBe(true);
  const duration = await video.evaluate(v => v.duration), expected = route === '/wealthsimple-2026' ? 101.652 : 8.475;
  assert(Math.abs(duration - expected) <= .001, 'Exact Chromium media duration');
  await track.evaluate(t => { t.track.mode = 'showing'; });
  await expect.poll(() => track.evaluate(t => t.readyState)).toBe(2);
  const cues = await track.evaluate(t => [...t.track.cues].map(c => ({ start: c.startTime, end: c.endTime, text: c.text })));
  assert(cues.length > 0);
  for (const cue of cues) assert(cue.start >= 0 && cue.end > cue.start && cue.end <= expected);
  const vttPath = await track.getAttribute('src'); assert(vttPath.startsWith('/') && !vttPath.startsWith('//'));
  const vtt = (await fs.readFile(path.join(dist, vttPath.slice(1)))).toString(); parseVtt(vtt, expected);
  if (route === '/wealthsimple-2026') {
    assert.equal(cues.length, 30);
    const transcript = cues.map(c => c.text).join(' ').replace(/\s+/g, ' ');
    assert(transcript.includes('a six experiment program'));
    assert(transcript.includes('Five experiments later, my family still groans when the compound growth soapbox comes out.'));
    assert(!/BLOCKED|NOT RELEASE AUTHORITY|\[in\/out\]/i.test(vtt));
  }
  const sample = cues.find(c => /soapbox/.test(c.text)) ?? cues[0];
  await video.evaluate((v, time) => { v.currentTime = time; }, (sample.start + sample.end) / 2);
  await expect.poll(() => track.evaluate(t => [...(t.track.activeCues ?? [])].map(c => c.text).join(' '))).toContain(sample.text);
  await video.evaluate(async v => { v.currentTime = 0; v.muted = true; await v.play(); });
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await video.evaluate(v => v.pause());
  return { duration, cues: cues.length, captionSha256: sha(vtt), nativePlayback: 'PASS', activeCaption: 'PASS' };
}
try {
  const helpers = await import(pathToFileURL(path.join(candidate, 'scripts/final-rc-preview-exec.mjs')).href);
  const { validateRouteAccounting, validateSitemap, parseVtt, WORKBOOKS, MEDIA, attributes } = helpers;
  function validateFocusedMetadata(html, route) {
    // Document metadata belongs to head; graph SVG titles are accessible names.
    const heads = [...html.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head>/gi)]; assert.equal(heads.length, 1, 'One document head');
    const head = heads[0][1];
    const tags = name => [...head.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attributes(m[0]));
    const metas = tags('meta'), robots = metas.filter(m => m.name?.toLowerCase() === 'robots').map(m => m.content ?? '').join(',').toLowerCase();
    if (route === '/404') { assert.match(robots, /\bnoindex\b/, 'True404 remains noindex'); return; }
    const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)]; assert.equal(titles.length, 1, 'One document title'); assert(titles[0][1].trim());
    assert.equal(metas.filter(m => m.name?.toLowerCase() === 'description' && m.content?.trim()).length, 1, 'One page description');
    assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, 'One H1');
    const links = tags('link').filter(a => a.rel?.toLowerCase().split(/\s+/).includes('canonical')); assert.equal(links.length, 1, 'One canonical');
    const canonical = new URL(links[0].href); assert.equal(canonical.origin, 'https://parkerhamilton.ca');
    assert.equal(canonical.pathname.replace(/\/+$/, '') || '/', route); assert(!canonical.search && !canonical.hash && !canonical.username && !canonical.password);
    for (const meta of metas.filter(m => m.property === 'og:url')) assert.equal(new URL(meta.content).href, canonical.href, 'OG URL is exact production canonical');
    if (route === '/wealthsimple-2026') { assert.match(robots, /\bnoindex\b/); assert.match(robots, /\bnoarchive\b/); }
    else { assert(!/\b(?:noindex|none)\b/.test(robots)); assert(!/wealthsimple-2026/i.test(html), 'Wealthsimple excluded from portfolio discovery'); }
    // The frozen Wealthsimple page retains its existing shared header. Inbound
    // portfolio discovery is prohibited; outbound header links are not rewritten.
  }
  const names = await files(dist); validateRouteAccounting(names.filter(n => n.endsWith('.html')));
  const entries = await Promise.all(names.map(async relative => { const bytes = await fs.readFile(path.join(dist, relative)); return { path: relative, size: bytes.length, sha256: sha(bytes) }; }));
  const manifestText = JSON.stringify(entries, null, 2) + '\n'; report.distManifestSha256 = sha(manifestText);
  if (args['--manifest-sha256']) assert.equal(report.distManifestSha256, args['--manifest-sha256'], 'Exact provided dist manifest');
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'dist-manifest.json'), manifestText);
  for (const [name, hash] of Object.entries(WORKBOOKS)) assert.equal(sha(await fs.readFile(path.join(dist, name))), hash, 'Frozen workbook');
  const pins = {
    'assets/application/wealthsimple-application-video.mp4': MEDIA.wealthsimple.videoSha256,
    'assets/application/wealthsimple-application-video-poster.webp': MEDIA.wealthsimple.posterSha256,
    'assets/application/wealthsimple-application-video.vtt': '8e953f9c81b390376a0c64a3314f547e344faa44691bcc0f8fb60d23ee2e46cf',
    'assets/projects/design-day/design-day-working-demo.mp4': MEDIA.designDay.videoSha256,
  };
  for (const [name, hash] of Object.entries(pins)) assert.equal(sha(await fs.readFile(path.join(dist, name))), hash, `Frozen ${name}`);
  for (let start = 0; start < entries.length; start += 4) {
    await Promise.all(entries.slice(start, start + 4).map(async entry => {
      if (['_headers', '_redirects'].includes(entry.path)) return;
      let route = '/' + entry.path;
      if (entry.path === '404.html') route = '/__public_first_missing_probe__/';
      else if (entry.path === 'index.html') route = '/';
      else if (entry.path.endsWith('/index.html')) route = '/' + entry.path.slice(0, -11);
      const response = await get(base + route); assert.equal(response.status, entry.path === '404.html' ? 404 : 200, `Status ${entry.path}`);
      const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha(bytes), entry.sha256, `Exact served bytes ${entry.path}`);
      if (entry.path.endsWith('.vtt')) assert.match(response.headers.get('content-type') ?? '', /^text\/vtt\b/i);
      if (entry.path === 'sitemap.xml') validateSitemap(bytes.toString());
      if (entry.path.endsWith('.html')) {
        try { validateFocusedMetadata(bytes.toString(), entry.path === '404.html' ? '/404' : route); }
        catch (error) {
          if (!report.fixtureOnly) throw error;
          // A disposable mechanics run may continue to expose selector/import
          // errors, but the retained metadata finding makes its overall run FAIL.
          report.failures.push(`Fixture metadata ${entry.path}: ${safeError(error)}`);
        }
      }
      report.assets.push({ path: entry.path, status: response.status, sha256: entry.sha256 });
    }));
  }
  const playwright = await import(pathToFileURL(args['--playwright-module'] ?? path.join(candidate, 'node_modules/@playwright/test/index.mjs')).href);
  const { expect } = playwright;
  const smith = await import(pathToFileURL(path.join(candidate, 'src/lib/calculators/smithManoeuvre.ts')).href);
  const smithView = await import(pathToFileURL(path.join(candidate, 'src/lib/calculators/smithManoeuvreView.ts')).href);
  browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const runtimeErrors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) { runtimeErrors.push(`Unexpected request ${url.origin}${url.pathname}`); return route.abort(); }
    const headers = request.headers(); assert(!Object.keys(headers).some(k => /cf-access|authorization/i.test(k)), 'Public smoke sends no auth');
    return route.continue();
  });
  for (const route of ROUTES) {
    const page = await context.newPage();
    page.on('pageerror', e => runtimeErrors.push(`${route}: ${e.message}`));
    page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`${route}: ${message.text()}`); });
    page.on('response', response => { if (response.status() >= 400) runtimeErrors.push(`${route}: HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    const response = await page.goto(base + route, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
    const file = route === '/' ? 'index.html' : route.slice(1) + '/index.html';
    const expectedH1 = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), await fs.readFile(path.join(dist, file), 'utf8'));
    await expect(page.locator('h1')).toHaveText(expectedH1);
    const result = { route, status: response.status(), h1: expectedH1, checks: ['Exact certified HTML and H1'] };
    if (route === '/wealthsimple-2026') {
      await expect(page.locator('h1')).toHaveText('Wealthsimple 2027 - Parker Hamilton');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, noarchive');
      await expect(page.locator('.contact-band')).toHaveCount(0);
    } else {
      await expect(page.locator('.contact-band')).toHaveCount(1);
      await expect(page.locator('.contact-band').getByRole('heading')).toHaveText('Have a question?');
      await expect(page.locator('a[href*="wealthsimple-2026"]')).toHaveCount(0);
    }
    if (route === '/work/coast-fi') {
      for (const [mode, value] of [['a', '$181,290'], ['b', '$639'], ['c', '52 years 4 months old'], ['d', '$405']]) { await page.locator(`label[for="coast-mode-${mode}"]`).click(); await page.getByRole('button', { name: 'Calculate', exact: true }).click(); await expect(page.locator('[data-primary-value]')).toContainText(value); }
      result.checks.push('Four exact frozen Coast outputs');
    }
    if (route === '/work/compound-growth') {
      await page.locator('#cg-monthly-contribution').fill('200'); await expect(page.locator('[data-summary-balance]')).toContainText('$644,216');
      await page.locator('#cg-monthly-contribution').fill('100'); await expect(page.locator('[data-summary-balance]')).toContainText('$322,108');
      await page.locator('[data-fixed-view="table"]').click(); await expect(page.locator('[data-fixed-panel="table"] tbody tr').last()).toContainText('$559,461');
      result.checks.push('Monthly simulator exact outputs and fixed final research point');
    }
    if (route === '/work/smith-manoeuvre') {
      const root = page.locator('[data-smith-calculator]');
      for (const changed of [false, true]) {
        if (changed) await root.locator('#smith-investment-return').fill('7');
        await root.locator('[data-update-scenario]').click();
        const expected = smith.runSmithScenario({ ...smithView.SMITH_DEFAULT_INPUTS, ...(changed ? { expectedAnnualInvestmentReturn: .07 } : {}) });
        for (const [key, field] of Object.entries({ netDifference: 'illustrativeNetPositionDifference', smithMortgage: 'endingMortgageBalance', smithHeloc: 'endingHelocBalance', smithPortfolio: 'endingSmithTaxablePortfolio', smithNet: 'smithNetFinancialPosition', baselineMortgage: 'endingBaselineMortgageBalance', baselinePortfolio: 'endingBaselinePortfolio', baselineNet: 'baselineNetFinancialPosition' })) await expect(root.locator(`[data-output="${key}"]`)).toHaveText(smithView.formatSmithCurrency(expected[field]));
      }
      result.checks.push('Default and changed Smith outputs equal frozen model');
    }
    if (route === '/work/askwill') { const links = page.locator('a.askwill-live-link'); await expect(links).toHaveCount(2); for (let i = 0; i < 2; i++) await expect(links.nth(i)).toHaveAttribute('href', 'https://askwill.ca/'); result.checks.push('Both authentic AskWill destinations; screenshot bytes checked in asset pass'); }
    if (route === '/work/reporting-workflow') { await page.locator('[data-demo-stage]').last().click(); await expect(page.locator('#reporting-workbook-viewport')).toHaveAttribute('data-stage', '3'); result.checks.push('Reporting demo stage responds'); }
    if (route === '/work/grocery-automation') { await expect(page.locator('[aria-label="House Rules treatment C"]')).toHaveCount(1); const summary = page.locator('details > summary:visible').first(); await summary.click(); assert(await summary.locator('..').evaluate(d => d.open)); result.checks.push('House Rules C and disclosure'); }
    if (route === '/wealthsimple-2026' || route === '/work/design-day') result.media = await verifyVideo(page, route, expect, parseVtt);
    report.routes.push(result); await page.close();
  }
  assert.deepEqual(runtimeErrors, [], 'No fatal console/page, failed resource or unexpected-origin errors');
  await browser.close(); browser = undefined;
  report.sitemap = { status: 'PASS', routes: INDEXABLE }; report.trueNoindex404 = 'PASS';
  report.assets.sort((a, b) => a.path.localeCompare(b.path));
  // Detect any local-byte drift during remote/browser checks.
  for (const entry of entries) assert.equal(sha(await fs.readFile(path.join(dist, entry.path))), entry.sha256, 'Dist remained unchanged');
  report.browserMechanics = 'PASS'; report.status = report.failures.length ? 'FAIL' : 'PASS';
  if (report.failures.length) process.exitCode = 1;
  report.completedAt = new Date().toISOString(); await writeReport();
  console.log(JSON.stringify({ status: report.status, mode, routes: report.routes.length, assets: report.assets.length, distManifestSha256: report.distManifestSha256, report: path.join(output, 'result.json') }));
} catch (error) {
  report.status = 'FAIL'; report.failures.push(safeError(error)); report.completedAt = new Date().toISOString();
  await writeReport(); console.error(`Focused smoke FAIL: ${safeError(error)}`); process.exitCode = 1;
} finally { await browser?.close(); }
