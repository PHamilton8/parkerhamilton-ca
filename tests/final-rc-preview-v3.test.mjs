import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as preview from '../scripts/final-rc-preview-exec.mjs';
import { createCloudflareClient } from '../scripts/final-rc-preview-remote.mjs';

// Independent expectations transcribed from the final QA contract and owner
// supplement, not calculated from the implementation under test. All transcript
// wording below is synthetic test data and is never a release caption artifact.
const ORIGIN = 'https://parkerhamilton.ca';
const PORTFOLIO = [
  '/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation',
  '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre',
];
const AUX = '/wealthsimple-2026';
const HTML_PATHS = ['index.html', ...PORTFOLIO.slice(1).map((p) => `${p.slice(1)}/index.html`), 'wealthsimple-2026/index.html', '404.html'];
const GOOD_VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSynthetic test cue.\n\n00:00:02.000 --> 00:00:08.475\nAnother synthetic cue.\n';
const bytes = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function html(route, overrides = {}) {
  const robots = overrides.robots ?? (route === AUX ? 'noindex, noarchive' : route === '/404' ? 'noindex' : 'index, follow');
  const canonical = overrides.canonical ?? `${ORIGIN}${route === '/404' ? '/404' : route}`;
  const h1 = overrides.h1 ?? (route === AUX ? 'Wealthsimple 2027 - Parker Hamilton' : 'Synthetic fixture');
  return `<!doctype html><html lang="en"><head><title>Synthetic test fixture</title><meta name="description" content="Synthetic test fixture only."><meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}">${overrides.extraHead ?? ''}</head><body><main id="main"><h1>${h1}</h1>${overrides.body ?? ''}</main></body></html>`;
}

function sitemap(routes = PORTFOLIO) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((p) => `<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`;
}

test('route contract is exactly eight portfolio routes, one auxiliary application, and true 404', () => {
  assert.deepEqual(preview.INDEXABLE_ROUTES, PORTFOLIO);
  assert.equal(preview.AUXILIARY_ROUTE, AUX);
  assert.deepEqual(preview.REAL_ROUTES, [...PORTFOLIO, AUX]);
  assert.equal(preview.ROUTE_ACCOUNTING, '8 indexable portfolio routes + 1 noindex auxiliary application route + true 404');
  assert.doesNotThrow(() => preview.validateRouteAccounting(HTML_PATHS));
  for (const paths of [
    HTML_PATHS.filter((p) => p !== '404.html'),
    HTML_PATHS.filter((p) => p !== 'wealthsimple-2026/index.html'),
    HTML_PATHS.filter((p) => p !== 'work/askwill/index.html'),
    [...HTML_PATHS, 'work/extra/index.html'],
    [...HTML_PATHS, 'index.html'],
  ]) assert.throws(() => preview.validateRouteAccounting(paths));
});

test('sitemap is exactly the eight production-apex portfolio URLs', () => {
  assert.doesNotThrow(() => preview.validateSitemap(sitemap()));
  assert.doesNotThrow(() => preview.validateSitemap(sitemap([...PORTFOLIO].reverse())));
  const invalid = [
    sitemap([...PORTFOLIO, AUX]),
    sitemap(PORTFOLIO.slice(1)),
    sitemap([...PORTFOLIO, '/']),
    sitemap().replaceAll(ORIGIN, 'https://www.parkerhamilton.ca'),
    sitemap().replaceAll(ORIGIN, 'https://candidate.example.workers.dev'),
    sitemap().replace('/work/design-day</loc>', '/work/design-day?preview=1</loc>'),
  ];
  for (const xml of invalid) assert.throws(() => preview.validateSitemap(xml));
});

test('each real route has exactly one production self-canonical with source indexability preserved', () => {
  for (const route of [...PORTFOLIO, AUX]) {
    assert.doesNotThrow(() => preview.validateHtmlMetadata(html(route), route));
    for (const canonical of [`https://www.parkerhamilton.ca${route}`, `https://preview.example.workers.dev${route}`, `${ORIGIN}/wrong`]) {
      assert.throws(() => preview.validateHtmlMetadata(html(route, { canonical }), route));
    }
    assert.throws(() => preview.validateHtmlMetadata(html(route, { extraHead: `<link rel="canonical" href="${ORIGIN}${route}">` }), route));
    assert.throws(() => preview.validateHtmlMetadata(html(route).replace(/<link rel="canonical"[^>]+>/, ''), route));
  }
  for (const route of PORTFOLIO) {
    for (const robots of ['noindex, noarchive', 'none']) assert.throws(() => preview.validateHtmlMetadata(html(route, { robots }), route));
    assert.throws(() => preview.validateHtmlMetadata(html(route, { extraHead: '<meta name="robots" content="noindex">' }), route));
  }
});

test('Wealthsimple requires exact current H1 and both noindex and noarchive', () => {
  for (const robots of ['index, follow', 'noindex', 'noarchive', '']) {
    assert.throws(() => preview.validateHtmlMetadata(html(AUX, { robots }), AUX));
  }
  assert.throws(() => preview.validateHtmlMetadata(html(AUX, { h1: 'Wealthsimple 2026 - Parker Hamilton' }), AUX));
  assert.throws(() => preview.validateHtmlMetadata(html(AUX, { body: '<h1>Second heading</h1>' }), AUX));
});

test('Wealthsimple is absent from portfolio discovery, including absolute links', () => {
  for (const route of PORTFOLIO) {
    for (const href of [AUX, `${ORIGIN}${AUX}`, `${AUX}/`, `${AUX}?from=work`]) {
      assert.throws(() => preview.validateHtmlMetadata(html(route, { body: `<a href="${href}">Application</a>` }), route));
    }
  }
});

test('VTT parser rejects malformed, empty, reversed, out-of-order and out-of-duration cues', () => {
  assert.doesNotThrow(() => preview.parseVtt(GOOD_VTT, 8.475));
  for (const vtt of [
    GOOD_VTT.replace('WEBVTT', 'SRT'),
    'WEBVTT\n\n',
    'WEBVTT\n\n00:00:08.475 --> 00:00:08.476\nSynthetic.\n',
    'WEBVTT\n\n00:00:04.000 --> 00:00:02.000\nSynthetic.\n',
    'WEBVTT\n\n00:00:02.000 --> 00:00:02.000\nSynthetic.\n',
    'WEBVTT\n\n00:00:00.000 --> not-a-timestamp\nSynthetic.\n',
    'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n\n',
    'WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nSynthetic.\n\n00:00:01.000 --> 00:00:02.000\nSynthetic.\n',
    'WEBVTT\n\n00:60:00.000 --> 00:60:01.000\nSynthetic.\n',
  ]) assert.throws(() => preview.parseVtt(vtt, 8.475));
});

test('preview X-Robots-Tag requires the complete noindex, nofollow, noarchive policy', () => {
  assert.doesNotThrow(() => preview.assertNoindexHeader('noindex, nofollow, noarchive'));
  assert.doesNotThrow(() => preview.assertNoindexHeader('NOARCHIVE, NOINDEX, NOFOLLOW'));
  for (const value of [undefined, '', 'noindex', 'noindex, nofollow', 'nofollow, noarchive', 'x-noindex, nofollow, noarchive']) {
    assert.throws(() => preview.assertNoindexHeader(value));
  }
});

test('anonymous preview must be denied or sent to Cloudflare Access, never arbitrary redirects or success', () => {
  const url = 'https://a1b2c3d4-parkerhamilton-ca.owner.workers.dev';
  for (const status of [401, 403]) assert.doesNotThrow(() => preview.assertAnonymousDenied({ status, location: null }, url));
  assert.doesNotThrow(() => preview.assertAnonymousDenied({ status: 302, location: 'https://parker.cloudflareaccess.com/cdn-cgi/access/login/example' }, url));
  for (const response of [
    { status: 200 }, { status: 404 }, { status: 500 },
    { status: 302, location: 'https://example.org/' },
    { status: 302, location: 'https://parker.cloudflareaccess.com.attacker.invalid/cdn-cgi/access/login/example' },
    { status: 302, location: '/wealthsimple-2026' },
  ]) assert.throws(() => preview.assertAnonymousDenied(response, url));
});

test('immutable review URLs cannot be mutable worker URLs, production hosts, credentials, or path aliases', () => {
  assert.doesNotThrow(() => preview.assertImmutablePreviewUrl('https://a1b2c3d4-parkerhamilton-ca.owner.workers.dev'));
  for (const url of [
    'https://parkerhamilton-ca.owner.workers.dev', ORIGIN, 'https://www.parkerhamilton.ca',
    'http://a1b2c3d4-parkerhamilton-ca.owner.workers.dev',
    'https://a1b2c3d4-parkerhamilton-ca.owner.workers.dev/other',
    'https://a1b2c3d4-parkerhamilton-ca.owner.workers.dev?alias=latest',
    'https://user:password@a1b2c3d4-parkerhamilton-ca.owner.workers.dev',
    'https://a1b2c3d4-parkerhamilton-ca.owner.workers.dev.attacker.invalid',
  ]) assert.throws(() => preview.assertImmutablePreviewUrl(url));
});

test('tooling recovery leaves all frozen engines, fixtures, workbook and research blobs byte-exact', () => {
  const expected = {
    'src/lib/calculators/coastFi.ts': '329fc2b3873d1ef21789ffde95fb292b6b5d0add',
    'tests/fixtures/coast-fi/coast-fi-test-cases-v2.json': '865d42bd30f04b5b1dbd3052c752c99a7c6bf674',
    'public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx': '12b617d4d277119000a356c76355fb01c0fee51b',
    'src/lib/calculators/smithManoeuvre.ts': 'a34fa6ff3d398b581023475a1c9bf5e8e96286d0',
    'tests/fixtures/smith/smith-test-cases-v2.json': '41dc718cf3c3a1925db19493763310c849fa05de',
    'public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx': '40bef343bf92dfd70e8d536fb17aba71a9c7aee9',
    'src/data/compound-growth/fixedExperimentalData.ts': 'b7846c19d29ed983dbb2c716b312866f2f6efe98',
    'src/data/compound-growth/sources/projection-data.json': 'cccf41099bf89591c7a5ff31e187fdacc8642ec5',
    'src/data/compound-growth/sources/experiment-4-results.json': '30ca6ff6dda8a7950d4655c5fd468c23d54e0019',
    'src/data/compound-growth/sources/experiment-summary.json': '6a1d5d9971a2189d6a0f8fdb4443357a226d3246',
  };
  for (const [file, expectedBlob] of Object.entries(expected)) {
    const content = bytes(file);
    assert.equal(createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex'), expectedBlob, file);
  }
  assert.equal(sha256(bytes('public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx')), '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a');
  assert.equal(sha256(bytes('public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx')), '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9');
});

function snapshot() {
  return {
    workerName: 'parkerhamilton-ca',
    workerId: '00000000-0000-4000-8000-000000000001',
    routes: [{ id: 'route-a', pattern: 'example.invalid/*', script: 'parkerhamilton-ca' }],
    domains: [{ id: 'domain-a', hostname: 'existing.example.invalid', service: 'parkerhamilton-ca' }],
    deployments: [{ id: 'deployment-a', versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }] }],
    activeDeployment: { status: 'CURRENT_PRODUCTION_LKG_SNAPSHOT', deploymentId: 'deployment-a', versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }] },
  };
}

test('production snapshot equality rejects routes, custom domains, deployment IDs and version changes', () => {
  const before = snapshot();
  assert.doesNotThrow(() => preview.assertBindingsUnchanged(before, structuredClone(before)));
  for (const change of [
    (s) => { s.routes[0].pattern = 'parkerhamilton.ca/*'; },
    (s) => { s.routes.push({ id: 'new', pattern: 'www.parkerhamilton.ca/*', script: 'parkerhamilton-ca' }); },
    (s) => { s.routes = []; },
    (s) => { s.domains[0].hostname = 'parkerhamilton.ca'; },
    (s) => { s.domains.push({ id: 'new', hostname: 'www.parkerhamilton.ca', service: 'parkerhamilton-ca' }); },
    (s) => { s.domains = []; },
    (s) => { s.deployments[0].id = 'replacement-deployment'; },
    (s) => { s.deployments[0].versions[0].version_id = '22222222-2222-4222-8222-222222222222'; },
    (s) => { s.deployments[0].versions[0].percentage = 50; },
    (s) => { s.deployments = []; },
    (s) => { s.activeDeployment.deploymentId = 'different-active-deployment'; },
    (s) => { s.activeDeployment.versions[0].version_id = '22222222-2222-4222-8222-222222222222'; },
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.throws(() => preview.assertBindingsUnchanged(before, after));
  }
});

test('mutation whitelist rejects production activation, routes, domains, DNS, analytics and unrelated account writes', () => {
  const scope = { accountId: 'account-a', workerName: 'parkerhamilton-ca', workerId: '00000000-0000-4000-8000-000000000001', versionId: '22222222-2222-4222-8222-222222222222', appId: 'app-a' };
  const forbidden = [
    ['POST', '/accounts/account-a/workers/scripts/parkerhamilton-ca/deployments'],
    ['PUT', '/accounts/account-a/workers/scripts/parkerhamilton-ca'],
    ['POST', '/accounts/account-a/workers/domains'],
    ['PUT', '/accounts/account-a/workers/domains/domain-a'],
    ['DELETE', '/accounts/account-a/workers/domains/domain-a'],
    ['POST', '/zones/zone-a/workers/routes'],
    ['PUT', '/zones/zone-a/workers/routes/route-a'],
    ['DELETE', '/zones/zone-a/workers/routes/route-a'],
    ['POST', '/zones/zone-a/dns_records'],
    ['PATCH', '/zones/zone-a/dns_records/dns-a'],
    ['DELETE', '/zones/zone-a/dns_records/dns-a'],
    ['POST', '/zones'],
    ['PUT', '/accounts/account-a/rum/site_info/site-a'],
    ['DELETE', '/accounts/account-a/access/apps/app-a'],
    ['DELETE', '/accounts/account-a/access/service_tokens/token-a'],
    ['PUT', '/accounts/other-account/workers/scripts/parkerhamilton-ca'],
    ['POST', '/accounts/account-a/workers/scripts/other-worker/versions'],
  ];
  for (const [method, path] of forbidden) {
    assert.throws(() => preview.assertSafeMutation({ method, path, body: {} }, scope), `${method} ${path}`);
  }
});

test('Wrangler command policy rejects deployment, activation, deletion, routes and ambiguous options', () => {
  for (const args of [
    ['deploy'], ['publish'], ['versions', 'deploy'], ['delete'],
    ['deploy', '--dry-run=false'], ['versions', 'upload', '--env', 'production'],
    ['versions', 'upload', '--name', 'another-worker'],
    ['versions', 'upload', '--route', 'parkerhamilton.ca/*'],
    ['versions', 'upload', '--routes', 'www.parkerhamilton.ca/*'],
    ['versions', 'upload', '--dispatch-namespace', 'unexpected'],
    ['versions', 'upload', '--config', 'safe.jsonc', '--config', 'production.jsonc'],
  ]) assert.throws(() => preview.assertUploadCommand(args), args.join(' '));
});

function humanGates() {
  return {
    schema: 2,
    designDayAudioReview: {
      status: 'PASS', evidence: '1kYgls9So9wrlyQXcfOv2CuFtC086dczc9SNvbIl2Kd0',
      reviewedAt: '2026-09-14T00:00:00Z',
    },
    wealthsimpleCaptionTrack: {
      status: 'PASS', evidence: 'Synthetic test-only media transcription/review evidence fixture.',
      reviewedAt: '2026-09-15T00:00:00Z',
    },
  };
}

test('human gates require the closed Design Day owner sign-off and completed Wealthsimple caption evidence', () => {
  assert.doesNotThrow(() => preview.validateHumanGates(humanGates()));
  for (const mutate of [
    (g) => { g.designDayAudioReview.status = 'PENDING'; },
    (g) => { g.designDayAudioReview.evidence = 'unrelated-owner-note'; },
    (g) => { delete g.designDayAudioReview; },
    (g) => { g.wealthsimpleCaptionTrack.status = 'PENDING'; },
    (g) => { g.wealthsimpleCaptionTrack.evidence = ''; },
    (g) => { g.wealthsimpleCaptionTrack.evidence = 'Replace with the final VTT/transcript QA record'; },
    (g) => { g.wealthsimpleCaptionTrack.reviewedAt = null; },
    (g) => { g.wealthsimpleCaptionTrack.reviewedAt = 'not-a-date'; },
    (g) => { delete g.wealthsimpleCaptionTrack; },
  ]) {
    const gates = humanGates(); mutate(gates);
    assert.throws(() => preview.validateHumanGates(gates));
  }
  assert.throws(() => preview.validateHumanGates(null));
});

function mediaFixture(route) {
  const designDay = route === '/work/design-day';
  const prefix = designDay ? '/assets/projects/design-day/design-day-working-demo' : '/assets/application/wealthsimple-application-video';
  const fixture = {
    route,
    html: html(route, { body: `<video controls preload="metadata" poster="${prefix}-poster.webp" aria-describedby="fixture-description"><source src="${prefix}.mp4" type="video/mp4"><track kind="captions" src="${prefix}.vtt" srclang="en" label="English" default></video><p id="fixture-description">Equivalent synthetic fixture visual description.</p>` }),
    videoSha256: designDay ? 'fabce52ef316d6c2f7d6c3db546f6eb6a2fe9c1295ff0f64b30269c17adf1f5b' : '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14',
    ...(designDay ? {} : { posterSha256: 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec' }),
    durationSeconds: designDay ? 8.475 : 101.652,
    vtt: designDay ? GOOD_VTT : 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSynthetic test-only caption.\n\n00:01:40.000 --> 00:01:41.652\nSynthetic ending cue.\n',
    humanGates: humanGates(),
  };
  if (!designDay) Object.assign(fixture.humanGates.wealthsimpleCaptionTrack, {
    videoSha256: '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14',
    vttSha256: sha256(fixture.vtt), mediaCapableTranscription: true,
    verbatimReviewed: true, timingReviewed: true, unresolvedWords: 0,
  });
  return fixture;
}

test('media gates pin both final videos, exact Wealthsimple poster, durations and valid native captions', () => {
  assert.deepEqual(preview.MEDIA, {
    designDay: { videoSha256: 'fabce52ef316d6c2f7d6c3db546f6eb6a2fe9c1295ff0f64b30269c17adf1f5b', durationSeconds: 8.475 },
    wealthsimple: { videoSha256: '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14', posterSha256: 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec', durationSeconds: 101.652 },
  });
  for (const route of ['/work/design-day', AUX]) {
    const good = mediaFixture(route);
    assert.doesNotThrow(() => preview.validateMediaGate(good));
    for (const mutate of [
      (m) => { m.videoSha256 = '0'.repeat(64); },
      (m) => { m.durationSeconds += 0.01; },
      (m) => { m.vtt = 'WEBVTT\n\n'; },
      (m) => { m.vtt = m.vtt.replace(route === AUX ? '00:01:41.652' : '00:00:08.475', route === AUX ? '00:01:41.653' : '00:00:08.476'); },
      (m) => { m.html = m.html.replace(' controls', ''); },
      (m) => { m.html = m.html.replace(' controls', ' controls autoplay'); },
      (m) => { m.html = m.html.replace('preload="metadata"', 'preload="auto"'); },
      (m) => { m.html = m.html.replace(/<track\b[^>]*>/, ''); },
      (m) => { m.html = m.html.replace('kind="captions"', 'kind="metadata"'); },
      (m) => { m.html = m.html.replace('srclang="en"', 'srclang="fr"'); },
      (m) => { m.html = m.html.replace('label="English"', 'label=""'); },
      (m) => { const track = m.html.match(/<track\b[^>]*>/)[0]; m.html = m.html.replace(track, '') + track; },
      (m) => { m.html = m.html.replace('</video>', '<track kind="captions" src="/duplicate.vtt" srclang="en" label="Duplicate"></video>'); },
      (m) => { m.humanGates.wealthsimpleCaptionTrack.status = 'PENDING'; },
    ]) {
      const changed = structuredClone(good); mutate(changed);
      assert.throws(() => preview.validateMediaGate(changed));
    }
  }
  assert.throws(() => preview.validateMediaGate({ ...mediaFixture(AUX), posterSha256: '0'.repeat(64) }));
  assert.throws(() => preview.validateMediaGate({ ...mediaFixture('/work/design-day'), route: '/work/askwill' }));
});

test('Design Day closed gate also requires the approved linked equivalent visual description', () => {
  for (const transform of [
    (source) => source.replace(' aria-describedby="fixture-description"', ''),
    (source) => source.replace('aria-describedby="fixture-description"', 'aria-describedby="missing-description"'),
    (source) => source.replace(/<p id="fixture-description">[\s\S]*?<\/p>/, ''),
  ]) {
    const fixture = mediaFixture('/work/design-day'); fixture.html = transform(fixture.html);
    assert.throws(() => preview.validateMediaGate(fixture));
  }
  assert.equal(preview.validateMediaGate(mediaFixture('/work/design-day')).designDayAudioGate, 'CLOSED');
});

test('Wealthsimple caption evidence binds actual MP4/VTT bytes and completed verbatim/timing review', () => {
  for (const [field, invalid] of [
    ['videoSha256', '0'.repeat(64)], ['vttSha256', '0'.repeat(64)],
    ['mediaCapableTranscription', false], ['verbatimReviewed', false],
    ['timingReviewed', false], ['unresolvedWords', 1],
  ]) {
    const fixture = mediaFixture(AUX); fixture.humanGates.wealthsimpleCaptionTrack[field] = invalid;
    assert.throws(() => preview.validateMediaGate(fixture));
    delete fixture.humanGates.wealthsimpleCaptionTrack[field];
    assert.throws(() => preview.validateMediaGate(fixture));
  }
});

test('Wealthsimple excludes ContactBand and portfolio navigation in both relative and absolute form', () => {
  for (const body of [
    '<div class="contact-band">Contact</div>',
    '<a href="/work/askwill">Work</a>',
    '<a href="https://parkerhamilton.ca/work/askwill">Work</a>',
  ]) assert.throws(() => preview.validateHtmlMetadata(html(AUX, { body }), AUX));
});

test('both workbook gates reject missing or changed hashes independently', () => {
  const workbooks = {
    'downloads/Coast_FI_Calculator_Public_Sanitized.xlsx': '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a',
    'downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx': '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9',
  };
  assert.deepEqual(preview.WORKBOOKS, workbooks);
  assert.doesNotThrow(() => preview.assertFrozenAssets(workbooks));
  for (const name of Object.keys(workbooks)) {
    const missing = { ...workbooks }; delete missing[name];
    assert.throws(() => preview.assertFrozenAssets(missing));
    assert.throws(() => preview.assertFrozenAssets({ ...workbooks, [name]: '0'.repeat(64) }));
  }
});

const WORKER_ID = '00000000-0000-4000-8000-000000000001';
const GUARD_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const AUTHORIZATION = 'CREATE_PRIVATE_FINAL_RC_PREVIEW';
function version(versionId) {
  return { versionId, workerId: WORKER_ID, previewUrl: `https://${versionId.slice(0, 8)}-parkerhamilton-ca.owner.workers.dev` };
}
function transactionFixture(overrides = {}) {
  const events = [], evidence = new Map();
  const baseline = snapshot();
  const certificate = { status: 'PASS', rcSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), manifestSha256: 'c'.repeat(64) };
  const context = { events, evidence, baseline, certificate, phase: 'before', snapshotCount: 0 };
  const client = {
    async snapshot() {
      events.push('snapshot'); context.snapshotCount++;
      return overrides.snapshot ? overrides.snapshot(context) : structuredClone(baseline);
    },
    async ensureAccess() {
      events.push('ensureAccess'); context.phase = 'access';
      return overrides.ensureAccess ? overrides.ensureAccess(context) : { appId: 'app-test', status: 'PASS' };
    },
    async uploadGuard() {
      events.push('uploadGuard'); context.phase = 'guard';
      return overrides.uploadGuard ? overrides.uploadGuard(context) : version(GUARD_ID);
    },
    async proveBoundary(state) {
      events.push(`proveBoundary:${state.versionId}`); context.phase = 'proof';
      return overrides.proveBoundary ? overrides.proveBoundary(context, state) : {
        status: 'PASS', anonymousStatus: 403, anonymousLocation: null,
        authenticatedStatus: 200, xRobotsTag: 'noindex, nofollow, noarchive',
      };
    },
    async deleteVersion(state) {
      events.push(`deleteVersion:${state.versionId}`);
      assert.equal(state.workerId, WORKER_ID);
      assert.ok([GUARD_ID, CANDIDATE_ID].includes(state.versionId), 'Only exact recorded test versions may be deleted');
      return overrides.deleteVersion ? overrides.deleteVersion(context, state) : { status: 'PASS' };
    },
    async uploadCandidate(cert) {
      events.push('uploadCandidate'); context.phase = 'candidate';
      assert.deepEqual(cert, certificate, 'Upload must receive the same certified identity');
      return overrides.uploadCandidate ? overrides.uploadCandidate(context) : version(CANDIDATE_ID);
    },
    async smoke(state, cert) {
      events.push(`smoke:${state.versionId}`); context.phase = 'smoke';
      assert.equal(state.versionId, CANDIDATE_ID);
      assert.deepEqual(cert, certificate);
      return overrides.smoke ? overrides.smoke(context, state) : { status: 'PASS', assetsChecked: 27, mismatches: 0 };
    },
  };
  const persist = async (name, value) => { events.push(`persist:${name}`); evidence.set(name, structuredClone(value)); };
  return { ...context, client, persist, args: { client, certificate, persist, authorize: AUTHORIZATION } };
}

test('successful transaction snapshots production, proves harmless Access guard, deletes guard, then uploads exactly one candidate', async () => {
  const fixture = transactionFixture();
  const result = await preview.runPreviewTransaction(fixture.args);
  const { events, evidence } = fixture;
  assert.equal(result.status, 'PASS');
  assert.equal(result.productionUntouched, true);
  assert.equal(result.previewUrl, 'https://22222222-parkerhamilton-ca.owner.workers.dev');
  assert.equal(result.versionId, CANDIDATE_ID);
  assert.equal(result.rcSha, 'a'.repeat(40));
  assert.equal(result.treeSha, 'b'.repeat(40));
  assert.equal(result.manifestSha256, 'c'.repeat(64));
  assert.equal(result.routeAccounting, '8 indexable portfolio routes + 1 noindex auxiliary application route + true 404');
  assert.deepEqual(result.rollbackIdentity, fixture.baseline.activeDeployment);
  assert.equal(events.filter((e) => e === 'uploadCandidate').length, 1);
  assert.ok(events.indexOf('persist:production-before.json') < events.indexOf('ensureAccess'));
  assert.ok(events.indexOf('ensureAccess') < events.indexOf('uploadGuard'));
  assert.ok(events.indexOf(`proveBoundary:${GUARD_ID}`) < events.indexOf('uploadCandidate'));
  assert.ok(events.indexOf('persist:access-guard.json') < events.indexOf('uploadCandidate'));
  assert.ok(events.indexOf(`deleteVersion:${GUARD_ID}`) < events.indexOf('uploadCandidate'));
  assert.ok(events.indexOf(`smoke:${CANDIDATE_ID}`) > events.indexOf('uploadCandidate'));
  assert.equal(events.includes(`deleteVersion:${CANDIDATE_ID}`), false);
  assert.deepEqual(evidence.get('production-before.json'), evidence.get('production-after.json'));
  assert.equal(evidence.get('preview.json').status, 'PASS');
  assert.equal(evidence.get('guard-version.json').versionId, GUARD_ID);
});

test('authorization and certification failures occur before any Cloudflare call', async () => {
  for (const mutate of [
    (a) => { a.authorize = undefined; },
    (a) => { a.authorize = 'GO'; },
    (a) => { a.certificate.status = 'FAIL'; },
    (a) => { a.certificate.rcSha = 'short-sha'; },
    (a) => { a.certificate.treeSha = 'main'; },
    (a) => { a.certificate.manifestSha256 = 'missing'; },
  ]) {
    const fixture = transactionFixture(); mutate(fixture.args);
    await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
    assert.deepEqual(fixture.events, []);
  }
});

test('missing or conflicting explicit production/LKG identity cannot proceed to Access setup or any version upload', async () => {
  for (const mutate of [
    (s) => { delete s.activeDeployment; },
    (s) => { s.activeDeployment.status = 'ASSUMED_CURRENT'; },
    (s) => { s.activeDeployment.deploymentId = 'different-deployment'; },
    (s) => { s.activeDeployment.versions[0].version_id = CANDIDATE_ID; },
    (s) => { s.deployments = []; },
  ]) {
    const fixture = transactionFixture({ snapshot: ({ baseline }) => {
      const result = structuredClone(baseline); mutate(result); return result;
    } });
    await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
    assert.equal(fixture.events.includes('ensureAccess'), false);
    assert.equal(fixture.events.includes('uploadGuard'), false);
    assert.equal(fixture.events.includes('uploadCandidate'), false);
  }
});

test('failed anonymous/authenticated/noindex guard proof prevents every candidate byte upload and cleans only guard', async () => {
  for (const badProof of [
    { status: 'FAIL', anonymousStatus: 403, authenticatedStatus: 200, xRobotsTag: 'noindex, nofollow, noarchive' },
    { status: 'PASS', anonymousStatus: 200, authenticatedStatus: 200, xRobotsTag: 'noindex, nofollow, noarchive' },
    { status: 'PASS', anonymousStatus: 403, authenticatedStatus: 403, xRobotsTag: 'noindex, nofollow, noarchive' },
    { status: 'PASS', anonymousStatus: 403, authenticatedStatus: 200, xRobotsTag: 'noindex' },
    { status: 'PASS', anonymousStatus: 302, anonymousLocation: 'https://attacker.invalid/', authenticatedStatus: 200, xRobotsTag: 'noindex, nofollow, noarchive' },
  ]) {
    const fixture = transactionFixture({ proveBoundary: async () => badProof });
    await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
    assert.equal(fixture.events.includes('uploadCandidate'), false);
    assert.deepEqual(fixture.events.filter((e) => e.startsWith('deleteVersion:')), [`deleteVersion:${GUARD_ID}`]);
    assert.equal(fixture.evidence.get('guard-failure-cleanup.json').versionId, GUARD_ID);
    assert.equal(fixture.evidence.get('failure.json').status, 'FAIL');
  }
});

test('Access setup or production-binding drift stops before guard and candidate uploads', async () => {
  for (const overrides of [
    { ensureAccess: async () => { throw new Error('Access authentication missing'); } },
    { snapshot: ({ baseline, snapshotCount }) => {
      const result = structuredClone(baseline);
      if (snapshotCount > 1) result.domains.push({ hostname: 'parkerhamilton.ca' });
      return result;
    } },
  ]) {
    const fixture = transactionFixture(overrides);
    await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
    assert.equal(fixture.events.includes('uploadGuard'), false);
    assert.equal(fixture.events.includes('uploadCandidate'), false);
    assert.deepEqual(fixture.events.filter((e) => e.startsWith('deleteVersion:')), []);
  }
});

test('remote byte/route/QA failure deletes the exact inactive candidate and records failure', async () => {
  for (const smoke of [
    async () => { throw new Error('Remote asset hash mismatch: assets/application/video.mp4'); },
    async () => ({ status: 'FAIL', error: '404 status was 200' }),
  ]) {
    const fixture = transactionFixture({ smoke });
    await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
    assert.deepEqual(fixture.events.filter((e) => e.startsWith('deleteVersion:')), [`deleteVersion:${GUARD_ID}`, `deleteVersion:${CANDIDATE_ID}`]);
    assert.equal(fixture.evidence.get('candidate-failure-cleanup.json').versionId, CANDIDATE_ID);
    assert.equal(fixture.evidence.get('failure.json').status, 'FAIL');
    assert.notEqual(fixture.evidence.get('preview.json')?.status, 'PASS');
  }
});

test('exact version identity is tied to immutable URL before candidate smoke', async () => {
  const fixture = transactionFixture({ uploadCandidate: async () => ({ ...version(CANDIDATE_ID), previewUrl: 'https://77777777-parkerhamilton-ca.owner.workers.dev' }) });
  await assert.rejects(() => preview.runPreviewTransaction(fixture.args));
  assert.equal(fixture.events.includes(`smoke:${CANDIDATE_ID}`), false);
  assert.equal(fixture.evidence.get('candidate-failure-cleanup.json').versionId, CANDIDATE_ID);
});

test('an unexpectedly active candidate is never deleted; exact identifiers and failed safety proof are persisted', async () => {
  const fixture = transactionFixture({
    smoke: async () => { throw new Error('Candidate smoke failed'); },
    snapshot: ({ baseline, phase }) => {
      const result = structuredClone(baseline);
      if (phase === 'smoke') result.deployments[0].versions = [{ version_id: CANDIDATE_ID, percentage: 100 }];
      return result;
    },
  });
  await assert.rejects(() => preview.runPreviewTransaction(fixture.args), /Candidate smoke failed/);
  assert.equal(fixture.events.includes(`deleteVersion:${CANDIDATE_ID}`), false);
  const evidence = fixture.evidence.get('MANUAL-CLEANUP-REQUIRED.json');
  assert.equal(evidence.versionId, CANDIDATE_ID);
  assert.equal(evidence.workerId, WORKER_ID);
  assert.match(evidence.cleanupFailure, /deployment|active/i);
  assert.equal(fixture.evidence.get('failure.json').status, 'FAIL');
});

test('cleanup API failure preserves exact version identity and original remote failure for recovery', async () => {
  const fixture = transactionFixture({
    smoke: async () => { throw new Error('Remote caption verification failed'); },
    deleteVersion: async (_context, state) => {
      if (state.versionId === CANDIDATE_ID) throw new Error('Cloudflare delete unavailable');
      return { status: 'PASS' };
    },
  });
  await assert.rejects(() => preview.runPreviewTransaction(fixture.args), /Remote caption verification failed/);
  const evidence = fixture.evidence.get('MANUAL-CLEANUP-REQUIRED.json');
  assert.equal(evidence.versionId, CANDIDATE_ID);
  assert.equal(evidence.workerId, WORKER_ID);
  assert.match(evidence.failure, /Remote caption verification failed/);
  assert.match(evidence.cleanupFailure, /Cloudflare delete unavailable/);
});

test('cleanup accepts only one fully identified unpublished version absent from active deployments', () => {
  const base = snapshot();
  const good = { ...version(CANDIDATE_ID), unpublished: true, bindingBaseline: base };
  assert.doesNotThrow(() => preview.assertSafeCleanup(good, structuredClone(base)));
  for (const mutate of [
    (s) => { s.unpublished = false; },
    (s) => { s.versionId = undefined; },
    (s) => { s.versionId = 'latest'; },
    (s) => { s.versionId = '2'.repeat(32); },
    (s) => { s.versionId = '-'.repeat(36); },
    (s) => { s.workerId = undefined; },
    (s) => { s.bindingBaseline = undefined; },
  ]) {
    const changed = structuredClone(good); mutate(changed);
    assert.throws(() => preview.assertSafeCleanup(changed, base));
  }
  const active = structuredClone(base);
  active.deployments[0].versions.push({ version_id: CANDIDATE_ID, percentage: 0 });
  assert.throws(() => preview.assertSafeCleanup({ ...good, bindingBaseline: active }, active));
});

test('404 metadata is noindex and identifies missing content, with no requirement to invent a canonical', () => {
  assert.doesNotThrow(() => preview.validateHtmlMetadata('<!doctype html><meta name="robots" content="noindex"><h1>404 - Page not found</h1>', '/404'));
  assert.throws(() => preview.validateHtmlMetadata('<!doctype html><meta name="robots" content="index"><h1>404 - Page not found</h1>', '/404'));
  assert.throws(() => preview.validateHtmlMetadata('<!doctype html><meta name="robots" content="noindex"><h1>Welcome home</h1>', '/404'));
});

test('parser permits exact preview commands and rejects unknown, duplicated and incomplete argument controls', async () => {
  assert.deepEqual(preview.parseArgs(['preview', '--rc', 'a'.repeat(40), '--authorize', AUTHORIZATION]), {
    command: 'preview', rc: 'a'.repeat(40), authorize: AUTHORIZATION,
  });
  for (const args of [
    ['preview', '--rc'],
    ['preview', '--rc', '--authorize', AUTHORIZATION],
    ['preview', '--rc', 'main', '--rc', 'another'],
    ['preview', '--rc', 'main', '--authorize', AUTHORIZATION, '--authorize', 'GO'],
    ['preview', '--rc', 'main', '--production', 'true'],
    ['preview', '--rc', 'main', '--unknown', 'value'],
  ]) assert.throws(() => preview.parseArgs(args));
  await assert.rejects(() => preview.main(['deploy']), /Unknown command/);
  await assert.rejects(() => preview.main(['preflight']), /--rc/);
});

test('Cloudflare whitelist allows only narrowly scoped preview Access and exact proved inactive-version deletion', () => {
  const scope = { accountId: 'account-a', workerId: WORKER_ID, versionId: CANDIDATE_ID, appId: 'app-a', reviewEmail: 'owner@example.invalid', serviceTokenId: 'service-token-test', cleanupProved: true };
  const policies = [
    { name: 'ParkerHamilton owner review', decision: 'allow', include: [{ email: { email: 'owner@example.invalid' } }] },
    { name: 'ParkerHamilton automated smoke', decision: 'non_identity', include: [{ service_token: { token_id: 'service-token-test' } }] },
  ];
  const accessBody = {
    name: 'ParkerHamilton Private Preview Access', type: 'self_hosted', session_duration: '24h',
    destinations: [{ type: 'preview_worker', worker_id: WORKER_ID }], policies,
  };
  assert.doesNotThrow(() => preview.assertSafeMutation({ method: 'POST', path: '/accounts/account-a/access/apps', body: accessBody }, scope));
  const deletion = { method: 'DELETE', path: `/accounts/account-a/workers/workers/${WORKER_ID}/versions/${CANDIDATE_ID}` };
  assert.doesNotThrow(() => preview.assertSafeMutation(deletion, scope));
  assert.throws(() => preview.assertSafeMutation(deletion, { ...scope, cleanupProved: false }));
  assert.throws(() => preview.assertSafeMutation({ ...deletion, path: deletion.path.replace(CANDIDATE_ID, GUARD_ID) }, scope));
  assert.throws(() => preview.assertSafeMutation({ ...deletion, path: deletion.path.replace('account-a', 'other-account') }, scope));
  assert.throws(() => preview.assertSafeMutation({ ...deletion, path: `${deletion.path}?force=true` }, scope));
  assert.throws(() => preview.assertSafeMutation({ ...deletion, path: '/accounts/account-a/../zones/zone-a/dns_records' }, scope));
  for (const mutate of [
    (b) => { b.destinations = [{ type: 'public', uri: 'parkerhamilton.ca' }]; },
    (b) => { b.destinations[0].worker_id = 'other-worker'; },
    (b) => { b.policies[0].decision = 'bypass'; },
    (b) => { b.policies[0].include = [{ everyone: {} }]; },
    (b) => { b.policies[0].include[0].email.email = 'unexpected@example.invalid'; },
    (b) => { b.policies[1].include[0].service_token.token_id = 'other-token'; },
    (b) => { b.policies.push({ name: 'Bypass', decision: 'bypass', include: [{ everyone: {} }] }); },
    (b) => { b.domain = 'parkerhamilton.ca'; },
  ]) {
    const changed = structuredClone(accessBody); mutate(changed);
    assert.throws(() => preview.assertSafeMutation({ method: 'POST', path: '/accounts/account-a/access/apps', body: changed }, scope));
  }
  assert.doesNotThrow(() => preview.assertUploadCommand(['versions', 'upload', '--config', 'preview.config.jsonc', '--message', 'Synthetic CI preview test', '--tag', 'test-candidate', '--experimental-provision=false', '--experimental-auto-create=false', '--install-skills=false']));
  assert.doesNotThrow(() => preview.assertUploadCommand(['versions', 'upload', '--dry-run']));
});

test('certificate manifest preserves byte lengths and sorted relative paths; same-size byte drift changes identity', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-v3-manifest-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), 'abc');
    fs.writeFileSync(path.join(directory, 'assets/a.bin'), Buffer.from([0, 1, 2, 255]));
    const first = await preview.makeManifest(directory);
    assert.deepEqual(first.entries, [
      { path: 'assets/a.bin', size: 4, sha256: sha256(Buffer.from([0, 1, 2, 255])) },
      { path: 'index.html', size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
    ]);
    assert.equal(first.manifestSha256, sha256(first.text));
    assert.deepEqual(await preview.makeManifest(directory), first);
    fs.writeFileSync(path.join(directory, 'index.html'), 'abd');
    assert.notEqual((await preview.makeManifest(directory)).manifestSha256, first.manifestSha256);
    fs.symlinkSync(path.join(directory, 'index.html'), path.join(directory, 'symlink.html'));
    await assert.rejects(() => preview.makeManifest(directory), /symlink/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('remote route response validator requires all nine real 200s, true 404 and the complete preview noindex header', () => {
  const xRobotsTag = 'noindex, nofollow, noarchive';
  for (const route of [...PORTFOLIO, AUX]) {
    assert.doesNotThrow(() => preview.assertRouteResponse({ route, status: 200, html: html(route), xRobotsTag }));
    for (const status of [201, 301, 302, 403, 404, 500]) {
      assert.throws(() => preview.assertRouteResponse({ route, status, html: html(route), xRobotsTag }));
    }
    assert.throws(() => preview.assertRouteResponse({ route, status: 200, html: html(route), xRobotsTag: 'noindex' }));
  }
  const missing = '<!doctype html><meta name="robots" content="noindex"><h1>404 - Page not found</h1>';
  assert.doesNotThrow(() => preview.assertRouteResponse({ route: '/404', status: 404, html: missing, xRobotsTag }));
  assert.throws(() => preview.assertRouteResponse({ route: '/404', status: 200, html: missing, xRobotsTag }));
  assert.throws(() => preview.assertRouteResponse({ route: '/404', status: 404, html: missing.replace('noindex', 'index'), xRobotsTag }));
});

const FAKE_ENV = {
  CLOUDFLARE_API_TOKEN: 'synthetic-test-api-token', CLOUDFLARE_ACCOUNT_ID: 'account-a',
  CF_ACCESS_CLIENT_ID: 'synthetic-test-client-id', CF_ACCESS_CLIENT_SECRET: 'synthetic-test-client-secret',
};
const EXACT_GUARD_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Access guard</title></head><body>Private preview access guard. No release candidate content.</body></html>\n';
const guardResponse = () => new Response(EXACT_GUARD_HTML, { status: 200, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Content-Type': 'text/html' } });
async function httpClient(fetchImpl) {
  return createCloudflareClient({ root: '/synthetic-unread-test-root', rcSha: 'a'.repeat(40), packet: '/synthetic-unread-test-packet', certificate: { status: 'PASS' }, env: FAKE_ENV, fetchImpl });
}

test('actual HTTP guard adapter proves anonymous denial, authenticated success, noindex and exact harmless guard bytes', async () => {
  const requests = [];
  const client = await httpClient(async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return new Response('Denied', { status: 403 });
    assert.equal(requests.length, 2, 'No extra HTTP requests expected');
    return guardResponse();
  });
  const proof = await client.proveBoundary(version(GUARD_ID));
  assert.equal(proof.status, 'PASS');
  assert.equal(proof.guardSha256, sha256(EXACT_GUARD_HTML));
  assert.equal(proof.anonymousStatus, 403);
  assert.equal(proof.authenticatedStatus, 200);
  assert.equal(requests[0].options.headers['CF-Access-Client-Secret'], undefined);
  assert.equal(requests[1].options.headers['CF-Access-Client-Secret'], 'synthetic-test-client-secret');
  assert.ok(requests.every((r) => r.options.redirect === 'manual'));
});

test('actual HTTP guard adapter fails on bad Access responses, missing noindex or non-guard bytes', async () => {
  for (const [anonymous, authenticated] of [
    [() => new Response('Public', { status: 200 }), guardResponse],
    [() => new Response('Denied', { status: 403 }), () => new Response('Denied', { status: 403 })],
    [() => new Response('Denied', { status: 403 }), () => new Response(EXACT_GUARD_HTML, { status: 200 })],
    [() => new Response('Denied', { status: 403 }), () => new Response('<h1>Real candidate content</h1>', { status: 200, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })],
  ]) {
    let calls = 0;
    const client = await httpClient(async () => ++calls === 1 ? anonymous() : authenticated());
    await assert.rejects(() => client.proveBoundary(version(GUARD_ID)));
    assert.ok(calls <= 2);
  }
});

test('actual HTTP adapter rejects external authenticated redirects before forwarding Access credentials', async () => {
  for (const location of ['https://attacker.invalid/steal', 'https://parkerhamilton.ca/', 'https://user:pass@33333333-parkerhamilton-ca.owner.workers.dev/']) {
    const calls = [];
    const client = await httpClient(async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return new Response('Denied', { status: 403 });
      assert.equal(calls.length, 2, 'Must reject before any third credential-bearing request');
      return new Response('', { status: 302, headers: { Location: location } });
    });
    await assert.rejects(() => client.proveBoundary(version(GUARD_ID)), /origin|credentials/i);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => new URL(c.url).hostname === '33333333-parkerhamilton-ca.owner.workers.dev'));
  }
});

function cloudflareSnapshotFetch({ malformedDeployments = false, badApi = false, remoteVersions } = {}) {
  const calls = [];
  return {
    calls,
    async fetchImpl(url, options) {
      calls.push({ url, options });
      assert.equal(options.method, 'GET', 'Snapshot must be read-only');
      const pathname = new URL(url).pathname.replace('/client/v4', '');
      let result;
      if (pathname === '/accounts/account-a/workers/workers') result = [{ id: WORKER_ID, name: 'parkerhamilton-ca' }];
      else if (pathname === `/accounts/account-a/workers/workers/${WORKER_ID}`) result = { id: WORKER_ID, name: 'parkerhamilton-ca', subdomain: { enabled: false, previews_enabled: true } };
      else if (pathname === '/zones') result = [{ id: 'zone-a' }];
      else if (pathname === '/zones/zone-a/workers/routes') result = [{ id: 'route-a', pattern: 'existing.example.invalid/*', script: 'parkerhamilton-ca' }, { id: 'unrelated', pattern: 'other.example.invalid/*', script: 'other-worker' }];
      else if (pathname === '/accounts/account-a/workers/domains') result = [{ id: 'domain-a', hostname: 'existing.example.invalid', service: 'parkerhamilton-ca' }];
      else if (pathname === '/accounts/account-a/workers/scripts/parkerhamilton-ca/deployments') result = malformedDeployments ? {} : { deployments: snapshot().deployments };
      else if (pathname === `/accounts/account-a/workers/workers/${WORKER_ID}/versions` && remoteVersions) result = remoteVersions;
      else throw new Error(`Unexpected HTTP request ${pathname}`);
      return new Response(JSON.stringify({ success: !badApi, result, errors: badApi ? [{ message: 'Synthetic API rejection' }] : [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
}

test('actual Cloudflare snapshot adapter records complete existing bindings and deployment identity using GET only', async () => {
  const fixture = cloudflareSnapshotFetch();
  const client = await httpClient(fixture.fetchImpl);
  const current = await client.snapshot();
  assert.equal(current.workerId, WORKER_ID);
  assert.equal(current.workersDevEnabled, false);
  assert.deepEqual(current.deployments, snapshot().deployments);
  assert.deepEqual(current.routes, [{ id: 'route-a', pattern: 'existing.example.invalid/*', script: 'parkerhamilton-ca', zone_id: 'zone-a' }]);
  assert.equal(current.domains[0].hostname, 'existing.example.invalid');
  assert.ok(fixture.calls.every((call) => call.options.method === 'GET'));
});

test('actual Cloudflare snapshot adapter cannot treat malformed or failed deployment/API data as empty production state', async () => {
  for (const options of [{ malformedDeployments: true }, { badApi: true }]) {
    const fixture = cloudflareSnapshotFetch(options);
    const client = await httpClient(fixture.fetchImpl);
    await assert.rejects(() => client.snapshot());
    assert.ok(fixture.calls.every((call) => call.options.method === 'GET'));
  }
});

test('remote candidate detection allows only absent, different-RC or harmless guard versions', () => {
  const rcSha = 'a'.repeat(40), otherSha = 'b'.repeat(40);
  assert.deepEqual(preview.findExistingCandidateVersions([], rcSha), []);
  assert.deepEqual(preview.findExistingCandidateVersions([
    { id: GUARD_ID, annotations: { 'workers/tag': `guard-${rcSha.slice(0, 12)}`, 'workers/message': `ACCESS GUARD only ${rcSha}` } },
    { id: CANDIDATE_ID, annotations: { 'workers/tag': `candidate-${otherSha.slice(0, 12)}`, 'workers/message': `PRIVATE FINAL RC ${otherSha}; unpublished` } },
  ], rcSha), []);
});

test('remote candidate detection blocks exact, predecessor and truncated-prefix matches even when full message is absent or conflicting', () => {
  const rcSha = 'a'.repeat(40);
  const prefix = rcSha.slice(0, 12);
  const samePrefixOtherSha = prefix + 'b'.repeat(28);
  for (const annotations of [
    { 'workers/tag': `candidate-${prefix}`, 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished` },
    { 'workers/tag': `candidate-${prefix}` },
    { 'workers/tag': `candidate-${prefix}`, 'workers/message': '' },
    { 'workers/tag': `candidate-${prefix}`, 'workers/message': `PRIVATE FINAL RC ${samePrefixOtherSha}; unpublished` },
    { 'workers/tag': `final-rc-${prefix}` },
    { 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished` },
    { 'workers/tag': 'unexpected-tag', 'workers/message': `FINAL RC ${rcSha}` },
  ]) {
    const remote = { id: CANDIDATE_ID, annotations, urls: [version(CANDIDATE_ID).previewUrl] };
    assert.deepEqual(preview.findExistingCandidateVersions([remote], rcSha), [{ versionId: CANDIDATE_ID, annotations, urls: [version(CANDIDATE_ID).previewUrl] }]);
  }
});

test('remote candidate detection rejects malformed version identities and annotation data rather than assuming no candidate', () => {
  const rcSha = 'a'.repeat(40);
  for (const versions of [
    null, {}, [{ id: 'latest' }], [{ id: '2'.repeat(32) }],
    [{ id: CANDIDATE_ID, annotations: [] }],
    [{ id: CANDIDATE_ID, annotations: 'invalid' }],
    [{ id: CANDIDATE_ID, annotations: { 'workers/tag': 123 } }],
    [{ id: CANDIDATE_ID, annotations: { 'workers/message': {} } }],
  ]) assert.throws(() => preview.findExistingCandidateVersions(versions, rcSha));
  assert.throws(() => preview.findExistingCandidateVersions([], 'main'));
});

test('actual adapter blocks an existing remote candidate in a fresh workspace before any new upload or mutation', async () => {
  const rcSha = 'a'.repeat(40), manifestSha256 = 'c'.repeat(64);
  for (const annotations of [
    { 'workers/tag': 'candidate-aaaaaaaaaaaa', 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished` },
    { 'workers/tag': 'candidate-aaaaaaaaaaaa' },
    { 'workers/tag': 'final-rc-aaaaaaaaaaaa' },
    { 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished` },
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-v3-existing-candidate-test-'));
    const packet = path.join(directory, 'fresh-packet');
    try {
      const remoteVersion = { id: CANDIDATE_ID, annotations, urls: [version(CANDIDATE_ID).previewUrl] };
      const fixture = cloudflareSnapshotFetch({ remoteVersions: [remoteVersion] });
      const client = await createCloudflareClient({
        root: path.join(directory, 'nonexistent-source'), rcSha, packet,
        certificate: { status: 'PASS', manifestSha256 }, env: FAKE_ENV, fetchImpl: fixture.fetchImpl,
      });
      assert.equal(fs.existsSync(path.join(packet, 'preview.json')), false, 'Fresh workspace has no local duplicate record');
      await assert.rejects(() => client.uploadCandidate({ manifestSha256 }), /An immutable candidate .* already exists.*no duplicate upload is allowed/);
      assert.ok(fixture.calls.every((call) => call.options.method === 'GET'), 'Duplicate detection must make no Cloudflare mutation');
      assert.equal(fs.existsSync(path.join(packet, 'candidate-upload-intent.json')), false, 'Duplicate must be found before upload intent or command');
      assert.equal(fs.existsSync(path.join(packet, 'candidate-upload.jsonl')), false);
      const evidence = JSON.parse(fs.readFileSync(path.join(packet, 'EXISTING-CANDIDATE-REQUIRES-PACKET-RESTORE.json'), 'utf8'));
      assert.equal(evidence.status, 'EXISTING_IMMUTABLE_CANDIDATE');
      assert.equal(evidence.workerId, WORKER_ID);
      assert.equal(evidence.rcSha, rcSha);
      assert.equal(evidence.existing[0].versionId, CANDIDATE_ID);
      assert.match(evidence.action, /Restore the original durable certification/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
});

test('upload ownership requires an actual attempt and exact new version annotation bound to the unique attempt nonce', () => {
  const rcSha = 'a'.repeat(40);
  const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const uploadMessage = `PRIVATE FINAL RC ${rcSha}; unpublished; attempt ${attemptId}`;
  const own = { id: CANDIDATE_ID, annotations: { 'workers/message': uploadMessage } };
  const context = { beforeVersionIds: [GUARD_ID], uploadMessage, uploadAttempted: true };
  assert.deepEqual(preview.findOwnedUploadVersions([own], context), [own]);
  assert.deepEqual(preview.findOwnedUploadVersions([own], { ...context, uploadAttempted: false }), []);
  assert.deepEqual(preview.findOwnedUploadVersions([own], { ...context, uploadAttempted: undefined }), []);
  assert.deepEqual(preview.findOwnedUploadVersions([own], { ...context, beforeVersionIds: [CANDIDATE_ID] }), []);
});

test('concurrent same-RC uploads, matching tags and partial messages cannot establish ownership for deletion', () => {
  const rcSha = 'a'.repeat(40);
  const uploadMessage = `PRIVATE FINAL RC ${rcSha}; unpublished; attempt aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
  const foreign = [
    { id: GUARD_ID, annotations: { 'workers/tag': 'candidate-aaaaaaaaaaaa', 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished; attempt bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` } },
    { id: GUARD_ID, annotations: { 'workers/tag': 'candidate-aaaaaaaaaaaa' } },
    { id: GUARD_ID, annotations: { 'workers/message': `PRIVATE FINAL RC ${rcSha}; unpublished` } },
    { id: GUARD_ID, annotations: { 'workers/message': uploadMessage.replace(rcSha, 'b'.repeat(40)) } },
    { id: GUARD_ID },
  ];
  const context = { beforeVersionIds: [], uploadMessage, uploadAttempted: true };
  for (const candidate of foreign) assert.deepEqual(preview.findOwnedUploadVersions([candidate], context), []);
  const own = { id: CANDIDATE_ID, annotations: { 'workers/message': uploadMessage } };
  assert.deepEqual(preview.findOwnedUploadVersions([foreign[0], own], context), [own]);
  assert.deepEqual(preview.findOwnedUploadVersions([foreign[0], own], { ...context, uploadAttempted: false }), []);
  for (const message of [`PRIVATE FINAL RC ${rcSha}; unpublished`, `${uploadMessage} trailing`, `PRIVATE FINAL RC ${rcSha}; attempt short`]) {
    assert.throws(() => preview.findOwnedUploadVersions([own], { ...context, uploadMessage: message }));
  }
  assert.throws(() => preview.findOwnedUploadVersions(null, context));
  assert.throws(() => preview.findOwnedUploadVersions([own], { ...context, beforeVersionIds: undefined }));
});

test('actual adapter pre-upload failure cannot reconcile or delete a concurrent same-RC version it did not upload', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-v3-no-upload-attempt-test-'));
  const packet = path.join(directory, 'packet');
  const rcSha = 'a'.repeat(40), manifestSha256 = 'c'.repeat(64);
  try {
    const fixture = cloudflareSnapshotFetch({ remoteVersions: [] });
    let versionReads = 0;
    const client = await createCloudflareClient({
      // An absent cwd makes process creation fail before any Git/CLI execution.
      root: path.join(directory, 'nonexistent-source'), rcSha, packet,
      certificate: { status: 'PASS', manifestSha256 }, env: FAKE_ENV,
      fetchImpl: async (url, options) => {
        if (new URL(url).pathname.endsWith(`/workers/${WORKER_ID}/versions`)) {
          versionReads++;
          assert.equal(versionReads, 1, 'A pre-attempt failure must not reconcile later concurrent versions');
        }
        return fixture.fetchImpl(url, options);
      },
    });
    await assert.rejects(() => client.uploadCandidate({ manifestSha256 }), /ENOENT|spawn/i);
    assert.equal(versionReads, 1);
    assert.ok(fixture.calls.every((call) => call.options.method === 'GET'));
    const intent = JSON.parse(fs.readFileSync(path.join(packet, 'candidate-upload-intent.json'), 'utf8'));
    assert.match(intent.attemptId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
    assert.equal(intent.uploadMessage, `PRIVATE FINAL RC ${rcSha}; unpublished; attempt ${intent.attemptId}`);
    const evidence = JSON.parse(fs.readFileSync(path.join(packet, 'candidate-upload-not-attempted.json'), 'utf8'));
    assert.equal(evidence.status, 'NO_UPLOAD_ATTEMPTED');
    assert.equal(evidence.attemptId, intent.attemptId);
    assert.equal(fs.existsSync(path.join(packet, 'candidate-upload-reconciliation.json')), false);
    assert.equal(fs.existsSync(path.join(packet, 'candidate-created-version.json')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
