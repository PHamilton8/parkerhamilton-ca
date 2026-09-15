#!/usr/bin/env node
/**
 * Canonical readable V3 replacement. Requirements: final Drive launcher/QA/manifest,
 * private-preview runbook, and Parker's explicit September 15 tooling supersession.
 * The historical truncated V2 payload and digest are deliberately not execution inputs.
 * No code runs when this module is imported. Cloud mutations require the guarded adapter.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://parkerhamilton.ca';
export const WORKER_NAME = 'parkerhamilton-ca';
export const REQUIRED_NODE = 'v24.19.0';
export const BASE_SHA = '5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e';
export const PREVIEW_AUTHORIZATION = 'CREATE_PRIVATE_FINAL_RC_PREVIEW';
export const CLEANUP_AUTHORIZATION = 'DELETE_PRIVATE_FINAL_RC_PREVIEW';
export const INDEXABLE_ROUTES = Object.freeze(['/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation', '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre']);
export const AUXILIARY_ROUTE = '/wealthsimple-2026';
export const REAL_ROUTES = Object.freeze([...INDEXABLE_ROUTES, AUXILIARY_ROUTE]);
export const ROUTE_ACCOUNTING = '8 indexable portfolio routes + 1 noindex auxiliary application route + true 404';
export const DESIGN_DAY_AUTHORITY = '1kYgls9So9wrlyQXcfOv2CuFtC086dczc9SNvbIl2Kd0';
export const MEDIA = Object.freeze({
  designDay: { videoSha256: 'fabce52ef316d6c2f7d6c3db546f6eb6a2fe9c1295ff0f64b30269c17adf1f5b', durationSeconds: 8.475 },
  wealthsimple: { videoSha256: '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14', posterSha256: 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec', durationSeconds: 101.652 },
});
export const WORKBOOKS = Object.freeze({
  'downloads/Coast_FI_Calculator_Public_Sanitized.xlsx': '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a',
  'downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx': '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9',
});
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b, why) => assert.deepEqual(a, b, why);
const normalize = (r) => r === '/' ? '/' : r.replace(/\/+$/, '');
const textContent = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
export function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]));
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attributes(m[0]));
const robots = (html) => tags(html, 'meta').filter((m) => m.name?.toLowerCase() === 'robots').map((m) => m.content ?? '').join(',').toLowerCase();
export function validateRouteAccounting(htmlPaths) {
  const expected = [...REAL_ROUTES.map((r) => r === '/' ? 'index.html' : `${r.slice(1)}/index.html`), '404.html'].sort();
  equal([...htmlPaths].sort(), expected, `Built HTML must implement ${ROUTE_ACCOUNTING}`);
  return { indexable: [...INDEXABLE_ROUTES], auxiliary: [AUXILIARY_ROUTE], true404: true };
}
export function validateHtmlMetadata(html, route) {
  const rb = robots(html);
  if (route === '/404' || route === '__404__') {
    assert.match(rb, /\bnoindex\b/, '404 requires meta noindex');
    assert.match(textContent(html), /404|not found/i, '404 must identify missing content');
    return { noindex: true };
  }
  assert.ok(REAL_ROUTES.includes(route), `Unexpected route ${route}`);
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  assert.equal(titles.length, 1, `${route}: exactly one title`);
  assert.ok(textContent(titles[0][1]), `${route}: nonempty title`);
  const descriptions = tags(html, 'meta').filter((m) => m.name?.toLowerCase() === 'description' && m.content?.trim());
  assert.equal(descriptions.length, 1, `${route}: exactly one description`);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  assert.equal(h1s.length, 1, `${route}: exactly one H1`);
  const canonicals = tags(html, 'link').filter((a) => a.rel?.toLowerCase().split(/\s+/).includes('canonical'));
  assert.equal(canonicals.length, 1, `${route}: exactly one canonical`);
  const url = new URL(canonicals[0].href);
  assert.equal(url.origin, PRODUCTION_ORIGIN, `${route}: production apex canonical`);
  assert.equal(normalize(url.pathname), route, `${route}: self canonical`);
  assert.ok(!url.search && !url.hash && !url.username && !url.password, 'Canonical cannot contain query, fragment or credentials');
  if (route === AUXILIARY_ROUTE) {
    assert.match(rb, /\bnoindex\b/, 'Wealthsimple requires noindex');
    assert.match(rb, /\bnoarchive\b/, 'Wealthsimple requires noarchive');
    assert.equal(textContent(h1s[0][1]), 'Wealthsimple 2027 - Parker Hamilton', 'Exact Wealthsimple H1');
    assert.doesNotMatch(html, /contact-band|contactband/i, 'Wealthsimple excludes ContactBand');
    for (const a of tags(html, 'a')) { const u = new URL(a.href ?? '', PRODUCTION_ORIGIN); assert.ok(!(u.origin === PRODUCTION_ORIGIN && (u.pathname === '/' || /^\/work(?:\/|$)/.test(u.pathname))), 'Wealthsimple excludes portfolio navigation'); }
  } else {
    assert.doesNotMatch(rb, /\b(?:noindex|none)\b/, 'Portfolio production HTML must be indexable');
    assert.doesNotMatch(html, /wealthsimple-2026/i, 'Wealthsimple must remain unlisted in portfolio discovery');
  }
  for (const m of tags(html, 'meta').filter((m) => m.property === 'og:url')) {
    assert.equal(new URL(m.content).origin, PRODUCTION_ORIGIN, 'OG URL must use production apex');
  }
  return { canonical: url.href, title: textContent(titles[0][1]), robots: rb, h1: textContent(h1s[0][1]) };
}
export function validateSitemap(xml) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => new URL(m[1].trim()));
  for (const u of urls) {
    assert.equal(u.origin, PRODUCTION_ORIGIN, 'Sitemap production apex');
    assert.ok(!u.search && !u.hash && !u.username && !u.password, 'Sitemap clean URLs');
  }
  equal(urls.map((u) => normalize(u.pathname)).sort(), [...INDEXABLE_ROUTES].sort(), 'Sitemap exactly eight indexable portfolio routes');
  return urls.map((u) => u.href);
}
export function parseVtt(text, durationSeconds) {
  assert.ok(Number.isFinite(durationSeconds) && durationSeconds > 0, 'Positive media duration');
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  assert.match(normalized, /^WEBVTT(?:[^\S\n][^\n]*)?\n\n/, 'Valid WEBVTT header required');
  const stamp = (s) => {
    assert.match(s, /^(?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}$/, `Invalid VTT timestamp ${s}`);
    return s.split(':').reduce((n, v) => n * 60 + Number(v), 0);
  };
  const cues = [];
  for (const block of normalized.trimEnd().split(/\n{2,}/).slice(1)) {
    if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
    const lines = block.split('\n');
    const timing = lines[0].includes('-->') ? 0 : 1;
    const m = lines[timing]?.match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    assert.ok(m, 'Every VTT cue must have valid timing');
    const start = stamp(m[1]), end = stamp(m[2]);
    assert.ok(start < end && end <= durationSeconds + 0.000001, `VTT cue timing exceeds duration ${durationSeconds}`);
    assert.ok(!cues.length || start >= cues.at(-1).start, 'VTT cue starts must be ordered');
    const content = lines.slice(timing + 1).join('\n').trim();
    assert.ok(content && !content.includes('-->'), 'VTT cue must contain nonempty caption text');
    cues.push({ start, end, text: content });
  }
  assert.ok(cues.length, 'At least one timed VTT cue required');
  return cues;
}
export function validateHumanGates(record) {
  assert.equal(record?.designDayAudioReview?.status, 'PASS', 'Design Day audio gate is closed PASS');
  assert.ok(record.designDayAudioReview.evidence?.includes(DESIGN_DAY_AUTHORITY), 'Exact closed Design Day authority required; never re-request a listen');
  const ws = record?.wealthsimpleCaptionTrack;
  assert.equal(ws?.status, 'PASS', 'Wealthsimple verified verbatim caption gate must pass');
  assert.ok(typeof ws.evidence === 'string' && ws.evidence.trim() && !/replace with|pending/i.test(ws.evidence), 'Durable Wealthsimple transcription/review evidence required');
  assert.ok(ws.reviewedAt && Number.isFinite(Date.parse(ws.reviewedAt)), 'Wealthsimple caption review timestamp required');
  return record;
}
export function validateMediaGate({ route, html, videoSha256, posterSha256, durationSeconds, vtt, humanGates }) {
  validateHumanGates(humanGates);
  const spec = route === '/work/design-day' ? MEDIA.designDay : route === AUXILIARY_ROUTE ? MEDIA.wealthsimple : null;
  assert.ok(spec, 'Only governed media routes are accepted');
  assert.equal(videoSha256, spec.videoSha256, `${route}: exact final MP4 hash`);
  assert.ok(Math.abs(durationSeconds - spec.durationSeconds) <= 0.001, `${route}: exact final media duration`);
  if (spec.posterSha256) assert.equal(posterSha256, spec.posterSha256, 'Exact Wealthsimple poster hash');
  const videos = [...html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)];
  assert.equal(videos.length, 1, `${route}: exactly one native video`);
  assert.match(videos[0][1], /\bcontrols(?:\s|=|$)/i, 'Native video controls required');
  assert.doesNotMatch(videos[0][1], /\bautoplay\b/i, 'Autoplay prohibited');
  assert.equal(attributes(videos[0][1]).preload, 'metadata', 'Video preload metadata required');
  const tracks = tags(videos[0][2], 'track').filter((a) => a.kind === 'captions' && a.srclang === 'en' && a.src?.endsWith('.vtt'));
  assert.equal(tracks.length, 1, 'Exactly one English native caption track required');
  assert.ok(tracks[0].label?.trim(), 'Caption track label required');
  const cues = parseVtt(vtt, durationSeconds);
  if (route === '/work/design-day') {
    const ids = (attributes(videos[0][1])['aria-describedby'] ?? '').split(/\s+/).filter(Boolean);
    assert.ok(ids.length, 'Design Day requires linked visual description');
    for (const id of ids) {
      assert.match(id, /^[a-zA-Z][\w-]*$/);
      const match = html.match(new RegExp('<([a-zA-Z][\\w-]*)\\b[^>]*\\bid=["\']' + id + '["\'][^>]*>([\\s\\S]*?)<\\/\\1>', 'i'));
      assert.ok(match && textContent(match[2]).length > 30, 'Design Day requires the approved adjacent equivalent description');
    }
  } else {
    const provenance = humanGates.wealthsimpleCaptionTrack;
    assert.equal(provenance.videoSha256, videoSha256, 'Transcript evidence must bind exact final MP4');
    assert.equal(provenance.vttSha256, sha256(vtt), 'Transcript evidence must bind exact final VTT');
    assert.equal(provenance.mediaCapableTranscription, true, 'Genuine media-capable transcription evidence required');
    assert.equal(provenance.verbatimReviewed, true, 'Verbatim wording review required');
    assert.equal(provenance.timingReviewed, true, 'Synchronized timing review required');
    assert.equal(provenance.unresolvedWords, 0, 'No unresolved transcript words before preview');
  }
  return { route, videoSha256, posterSha256: posterSha256 ?? null, durationSeconds, captionSrc: tracks[0].src, cues: cues.length, lastCueEnd: cues.at(-1).end, designDayAudioGate: 'CLOSED' };
}
export function assertFrozenAssets(observed) {
  for (const [name, expected] of Object.entries(WORKBOOKS)) assert.equal(observed[name], expected, `Frozen workbook identity: ${name}`);
  return true;
}
export function assertNoindexHeader(value) {
  const tokens = new Set(String(value).toLowerCase().split(/[\s,]+/));
  for (const directive of ['noindex', 'nofollow', 'noarchive']) assert.ok(tokens.has(directive), `X-Robots-Tag missing ${directive}`);
  return true;
}
export function assertImmutablePreviewUrl(value, versionId) {
  const u = new URL(value);
  assert.equal(u.protocol, 'https:', 'Preview requires HTTPS');
  assert.match(u.hostname, /^[a-z0-9]+-parkerhamilton-ca\.[a-z0-9-]+\.workers\.dev$/, 'Immutable version-prefixed workers.dev URL required');
  assert.ok(!u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname === '/', 'Preview URL must be clean origin only');
  if (versionId) assert.ok(u.hostname.startsWith(`${versionId.slice(0, 8)}-`), 'Preview prefix must match exact version UUID');
  return u.origin;
}
export function assertAnonymousDenied({ status, location }, previewUrl) {
  assertImmutablePreviewUrl(previewUrl);
  if ([401, 403].includes(status)) return true;
  assert.ok([302, 303, 307, 308].includes(status), `Anonymous access must be denied/challenged, got ${status}`);
  const u = new URL(location ?? '', previewUrl);
  assert.equal(u.protocol, 'https:', 'Access challenge must use HTTPS');
  assert.ok(u.hostname.endsWith('.cloudflareaccess.com') && u.pathname.startsWith('/cdn-cgi/access/login'), 'Redirect must be a genuine Cloudflare Access challenge');
  return true;
}
function canonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => JSON.parse(canonicalJson(v))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((k) => [k, JSON.parse(canonicalJson(value[k]))])));
  return JSON.stringify(value);
}
export function assertBindingsUnchanged(before, after) {
  for (const field of ['routes', 'domains', 'deployments']) {
    assert.ok(Array.isArray(before?.[field]) && Array.isArray(after?.[field]), `Complete ${field} snapshots required`);
    assert.equal(canonicalJson(after[field]), canonicalJson(before[field]), `Production ${field} changed`);
  }
  if ('workersDevEnabled' in before) assert.equal(after.workersDevEnabled, before.workersDevEnabled, 'Active workers.dev binding changed');
  if ('activeDeployment' in before) assert.equal(canonicalJson(after.activeDeployment), canonicalJson(before.activeDeployment), 'Current active deployment changed');
  return true;
}
export function assertSafeCleanup(state, snapshot) {
  assert.match(state?.versionId ?? '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, 'Exact version ID required for cleanup');
  assert.match(state?.workerId ?? '', /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i, 'Exact immutable Worker ID required');
  assert.equal(state.unpublished, true, 'Only a recorded unpublished version can be deleted');
  assertBindingsUnchanged(state.bindingBaseline, snapshot);
  for (const deployment of snapshot.deployments) { assert.ok(deployment.id && Array.isArray(deployment.versions), 'Complete deployment snapshot entries required'); for (const v of deployment.versions) assert.ok((v.version_id ?? v.id) && Number.isFinite(v.percentage), 'Complete active version allocation required'); }
  assert.ok(!snapshot.deployments.some((d) => (d.versions ?? []).some((v) => (v.version_id ?? v.id) === state.versionId)), 'Refusing deletion of an active deployed version');
  return true;
}
/** API policy is fail-closed: no caller-supplied endpoint can escape these exact scopes. */
export function assertSafeMutation({ method = 'GET', path: endpoint, body }, scope = {}) {
  assert.ok(endpoint.startsWith('/') && !/[\\]|\.\.|%2f|%2e/i.test(endpoint), 'API endpoint must be a normalized relative path');
  assert.ok(!endpoint.includes('?') || method === 'GET', 'Mutation query strings prohibited');
  if (method === 'GET') return true;
  const base = `/accounts/${scope.accountId}`;
  if (method === 'POST' && endpoint === `${base}/workers/workers`) {
    equal(body, { name: WORKER_NAME, subdomain: { enabled: false, previews_enabled: true } }, 'Bootstrap creates only an empty nonproduction Worker shell');
    assert.equal(scope.workerAbsent, true, 'Cannot recreate existing Worker');
    return true;
  }
  if (method === 'POST' && endpoint === `${base}/access/apps`) {
    equal(Object.keys(body).sort(), ['destinations', 'name', 'policies', 'session_duration', 'type'].sort(), 'Only preview Access fields');
    assert.equal(body.type, 'self_hosted');
    equal(body.destinations, [{ type: 'preview_worker', worker_id: scope.workerId }], 'Access must target this Worker previews only');
    assert.equal(body.name, 'ParkerHamilton Private Preview Access');
    assertAccessPolicies(body.policies, scope.reviewEmail, scope.serviceTokenId);
    return true;
  }
  if (method === 'DELETE' && endpoint === `${base}/workers/workers/${scope.workerId}/versions/${scope.versionId}`) {
    assert.equal(scope.cleanupProved, true, 'Fresh non-active cleanup proof required');
    assert.match(scope.versionId ?? '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
    return true;
  }
  throw new Error(`Forbidden Cloudflare mutation: ${method} ${endpoint}`);
}
export function assertAccessPolicies(policies, email, tokenId) {
  assert.ok(email && tokenId, 'Exact owner email and service-token identity required');
  assert.equal(policies.length, 2, 'Exactly owner and automation policies required');
  const expected = [
    { name: 'ParkerHamilton owner review', decision: 'allow', include: [{ email: { email } }] },
    { name: 'ParkerHamilton automated smoke', decision: 'non_identity', include: [{ service_token: { token_id: tokenId } }] },
  ];
  for (const want of expected) {
    const actual = policies.find((p) => p.name === want.name);
    assert.ok(actual, `Missing ${want.name} policy`);
    for (const k of ['decision', 'include']) equal(actual[k], want[k], 'Access policy cannot broaden identities');
    assert.equal(actual.exclude?.length ?? 0, 0, 'Unexpected Access exclusions');
    assert.equal(actual.require?.length ?? 0, 0, 'Unexpected Access requirements');
  }
  return true;
}
export function assertUploadCommand(args) {
  equal(args.slice(0, 2), ['versions', 'upload'], 'Only unpublished versions upload is permitted');
  const valueFlags = new Set(['--message', '--tag', '--config']);
  const boolFlags = new Set(['--dry-run', '--experimental-provision=false', '--experimental-auto-create=false', '--install-skills=false']);
  const seen = new Set();
  for (let i = 2; i < args.length; i++) {
    assert.ok(!seen.has(args[i]), 'Duplicate upload options prohibited'); seen.add(args[i]);
    if (valueFlags.has(args[i])) { assert.ok(typeof args[++i] === 'string' && !args[i].startsWith('--'), 'Upload flag requires a value'); continue; }
    assert.ok(boolFlags.has(args[i]), `Forbidden upload option ${args[i]}`);
  }
  return true;
}
/** Inspect durable Cloudflare version annotations, independent of local packet presence. */
export function findExistingCandidateVersions(versions, rcSha) {
  assert.ok(Array.isArray(versions), 'Complete remote version list required');
  assert.match(rcSha, /^[a-f0-9]{40}$/, 'Exact RC SHA required');
  const prefix = rcSha.slice(0, 12);
  return versions.filter((version) => {
    assert.match(version.id ?? '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, 'Exact remote version UUID required');
    const annotation = version.annotations ?? {};
    assert.ok(annotation && typeof annotation === 'object' && !Array.isArray(annotation), 'Version annotations must be an object');
    const tag = annotation['workers/tag'] ?? '';
    const message = annotation['workers/message'] ?? '';
    assert.equal(typeof tag, 'string'); assert.equal(typeof message, 'string');
    return tag === `candidate-${prefix}` || tag === `final-rc-${prefix}` || (/\b(?:PRIVATE\s+)?FINAL\s+RC\b/i.test(message) && message.includes(rcSha));
  }).map((version) => ({ versionId: version.id, annotations: version.annotations ?? {}, urls: version.urls ?? [] }));
}
export function findOwnedUploadVersions(versions, { beforeVersionIds, uploadMessage, uploadAttempted }) {
  assert.ok(Array.isArray(versions) && Array.isArray(beforeVersionIds), 'Complete version evidence required');
  assert.match(uploadMessage, /; attempt [a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, 'Exact per-attempt nonce is required to establish upload ownership');
  if (uploadAttempted !== true) return [];
  const known = new Set(beforeVersionIds);
  return versions.filter((version) => !known.has(version.id) && version.annotations?.['workers/message'] === uploadMessage);
}
/** All mutating effects are on client, so ordering/failure/cleanup are exercised with deterministic mocks. */
export async function runPreviewTransaction({ client, certificate, persist, authorize }) {
  assert.equal(authorize, PREVIEW_AUTHORIZATION, 'Explicit private preview authorization required');
  assert.equal(certificate.status, 'PASS', 'Certified preflight required');
  assert.match(certificate.rcSha, /^[a-f0-9]{40}$/);
  assert.match(certificate.treeSha, /^[a-f0-9]{40}$/);
  assert.match(certificate.manifestSha256, /^[a-f0-9]{64}$/);
  const baseline = await client.snapshot();
  assert.ok(baseline.activeDeployment, 'Explicit current production/LKG identity or verified absence required before any mutation');
  if (baseline.deployments.length) {
    assert.equal(baseline.activeDeployment.status, 'CURRENT_PRODUCTION_LKG_SNAPSHOT');
    assert.equal(baseline.activeDeployment.deploymentId, baseline.deployments[0].id, 'Active deployment must match documented first current deployment');
    equal(baseline.activeDeployment.versions, baseline.deployments[0].versions, 'Exact current active version allocations required');
  } else {
    assert.equal(baseline.activeDeployment.status, 'NO_EXISTING_PRODUCTION_DEPLOYMENT');
    assert.equal(baseline.activeDeployment.deploymentId, null);
    equal(baseline.activeDeployment.versions, []);
  }
  await persist('production-before.json', baseline);
  let guard, candidate;
  try {
    const access = await client.ensureAccess();
    assertBindingsUnchanged(baseline, await client.snapshot());
    guard = await client.uploadGuard();
    guard = { ...guard, unpublished: true, bindingBaseline: baseline };
    await persist('guard-version.json', guard);
    assertImmutablePreviewUrl(guard.previewUrl, guard.versionId);
    assertSafeCleanup(guard, await client.snapshot());
    const proof = await client.proveBoundary(guard);
    assert.equal(proof.status, 'PASS', 'Harmless guard boundary proof required');
    assertAnonymousDenied({ status: proof.anonymousStatus, location: proof.anonymousLocation }, guard.previewUrl);
    assert.equal(proof.authenticatedStatus, 200, 'Guard authenticated success required');
    assertNoindexHeader(proof.xRobotsTag);
    await persist('access-guard.json', { ...proof, versionId: guard.versionId });
    await client.deleteVersion(guard);
    guard = null;
    assertBindingsUnchanged(baseline, await client.snapshot());
    candidate = { ...(await client.uploadCandidate(certificate)), unpublished: true, bindingBaseline: baseline };
    await persist('preview.json', { ...certificate, ...candidate, status: 'CREATED_PENDING_SMOKE', access });
    assertImmutablePreviewUrl(candidate.previewUrl, candidate.versionId);
    assertSafeCleanup(candidate, await client.snapshot());
    const smoke = await client.smoke(candidate, certificate);
    assert.equal(smoke.status, 'PASS', 'Full remote smoke must pass');
    const after = await client.snapshot();
    assertBindingsUnchanged(baseline, after);
    await persist('production-after.json', after);
    const result = { ...certificate, ...candidate, access, smoke, status: 'PASS', productionUntouched: true, rollbackIdentity: baseline.activeDeployment, routeAccounting: ROUTE_ACCOUNTING };
    await persist('preview.json', result);
    return result;
  } catch (error) {
    for (const [kind, state] of [['guard', guard], ['candidate', candidate]]) {
      if (!state) continue;
      try { assertSafeCleanup(state, await client.snapshot()); await client.deleteVersion(state); await persist(`${kind}-failure-cleanup.json`, { status: 'PASS', workerId: state.workerId, versionId: state.versionId }); }
      catch (cleanupError) { await persist('MANUAL-CLEANUP-REQUIRED.json', { status: 'MANUAL-CLEANUP-REQUIRED', kind, workerId: state.workerId, versionId: state.versionId, failure: error.message, cleanupFailure: cleanupError.message }); }
    }
    await persist('failure.json', { status: 'FAIL', message: error.message });
    throw error;
  }
}

export async function run(command, args, { cwd = process.cwd(), env = {}, logFile, capture = false } = {}) {
  const startedAt = new Date().toISOString();
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:CLOUDFLARE_|CF_ACCESS_)/.test(key)));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...childEnv, ASTRO_TELEMETRY_DISABLED: '1', CI: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (b) => { out.push(b); if (!capture) process.stdout.write(b); });
    child.stderr.on('data', (b) => { err.push(b); if (!capture) process.stderr.write(b); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() }));
  });
  if (logFile) await fs.appendFile(logFile, JSON.stringify({ startedAt, command, args, ...result }) + '\n');
  assert.equal(result.code, 0, `Command failed: ${command} ${args.join(' ')}\n${result.stderr.slice(-3000)}`);
  return result.stdout.trim();
}
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
export async function writeJson(p, value) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
export async function files(dir) {
  const out = [];
  async function visit(d) {
    for (const ent of await fs.readdir(d, { withFileTypes: true })) {
      assert.ok(!ent.isSymbolicLink(), 'Dist/evidence symlinks prohibited');
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await visit(p);
      else { assert.ok(ent.isFile(), 'Only regular dist files'); out.push(path.relative(dir, p).split(path.sep).join('/')); }
    }
  }
  await visit(dir); return out.sort();
}
export async function makeManifest(dir) {
  const entries = [];
  for (const rel of await files(dir)) { const b = await fs.readFile(path.join(dir, rel)); entries.push({ path: rel, size: b.length, sha256: sha256(b) }); }
  const text = JSON.stringify(entries, null, 2) + '\n';
  return { entries, text, manifestSha256: sha256(text) };
}
async function detached(root, sha, fn) {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), 'parker-reviewed-v3-'));
  let attached = false;
  try {
    await run('git', ['worktree', 'add', '--detach', worktree, sha], { cwd: root }); attached = true;
    assert.equal(await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: worktree, capture: true }), '', 'Clean detached RC required');
    return await fn(worktree);
  } finally {
    if (attached) await run('git', ['worktree', 'remove', '--force', worktree], { cwd: root });
    else await fs.rm(worktree, { recursive: true, force: true });
  }
}
export async function verifyDist(dist, humanGates, mediaDurations) {
  const entries = await files(dist);
  validateRouteAccounting(entries.filter((p) => p.endsWith('.html')));
  const metadata = {};
  for (const route of REAL_ROUTES) metadata[route] = validateHtmlMetadata(await fs.readFile(path.join(dist, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`), 'utf8'), route);
  validateHtmlMetadata(await fs.readFile(path.join(dist, '404.html'), 'utf8'), '/404');
  const sitemap = validateSitemap(await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8'));
  const observed = {};
  for (const rel of Object.keys(WORKBOOKS)) observed[rel] = sha256(await fs.readFile(path.join(dist, rel)));
  assertFrozenAssets(observed);
  const media = {};
  for (const route of ['/work/design-day', AUXILIARY_ROUTE]) {
    const html = await fs.readFile(path.join(dist, `${route.slice(1)}/index.html`), 'utf8');
    const player = html.match(/<video\b([^>]*)>([\s\S]*?)<\/video>/i);
    assert.ok(player, 'Native video required');
    const video = attributes(player[1]);
    const source = video.src ?? tags(player[2], 'source').find((a) => a.src?.endsWith('.mp4'))?.src;
    const track = tags(player[2], 'track').find((a) => a.kind === 'captions');
    const local = (url) => { assert.ok(url?.startsWith('/') && !url.startsWith('//') && !url.includes('..'), 'Media must use safe local path'); return path.join(dist, url.slice(1)); };
    media[route] = validateMediaGate({ route, html, videoSha256: sha256(await fs.readFile(local(source))), posterSha256: video.poster ? sha256(await fs.readFile(local(video.poster))) : undefined, durationSeconds: mediaDurations[route], vtt: await fs.readFile(local(track?.src), 'utf8'), humanGates });
  }
  for (const rel of entries) {
    assert.ok(!/\.(?:map|zip|tar|tgz|7z|rar|docx?|xls|xlsm|key|pem|env|sql|db)$/i.test(rel), `Private/unapproved artifact ${rel}`);
    if (/\.xlsx$/i.test(rel)) assert.ok(rel in WORKBOOKS, `Unapproved workbook ${rel}`);
    if (/\.(?:html|js|mjs|css|json|xml|txt|vtt)$/.test(rel)) {
      const text = await fs.readFile(path.join(dist, rel), 'utf8');
      assert.doesNotMatch(text, /drive\.google\.com|docs\.google\.com|file:\/\/|localhost|127\.0\.0\.1|\/Users\/|CLOUDFLARE_API_TOKEN|CF_ACCESS_CLIENT_SECRET|BEGIN .*PRIVATE KEY|raw\.githubusercontent\.com/i, `Private/review leak ${rel}`);
      assert.doesNotMatch(text, /https?:\/\/[^\s"'<>]*(?:workers\.dev|pages\.dev|netlify\.app)/i, `Preview/staging leak ${rel}`);
      if (rel.endsWith('.html')) {
        for (const name of ['script', 'img', 'video', 'audio', 'source', 'iframe', 'track']) for (const t of tags(text, name)) {
          for (const k of ['src', 'poster']) assert.ok(!/^(?:https?:)?\/\//i.test(t[k] ?? ''), `Unexpected automatic origin ${rel}`);
          assert.ok(!/(?:https?:)?\/\//i.test(t.srcset ?? ''), `Unexpected srcset origin ${rel}`);
        }
        for (const t of tags(text, 'link')) if (/stylesheet|preload|prefetch|preconnect|icon|manifest/.test(t.rel ?? '')) assert.ok(!/^(?:https?:)?\/\//i.test(t.href ?? ''), `Unexpected link origin ${rel}`);
      }
      if (rel.endsWith('.css')) assert.doesNotMatch(text, /(?:url\(\s*["']?|@import\s*["'])(?:https?:)?\/\//i, `Unexpected CSS origin ${rel}`);
    }
  }
  return { routeAccounting: ROUTE_ACCOUNTING, metadata, sitemap, workbooks: observed, media };
}
async function measuredDurations(worktree, dist, logFile) {
  const out = {};
  for (const route of ['/work/design-day', AUXILIARY_ROUTE]) {
    const html = await fs.readFile(path.join(dist, `${route.slice(1)}/index.html`), 'utf8');
    const player = html.match(/<video\b([^>]*)>([\s\S]*?)<\/video>/i);
    assert.ok(player, 'Native video required');
    const src = attributes(player[1]).src ?? tags(player[2], 'source').find((a) => a.src?.endsWith('.mp4'))?.src;
    assert.ok(src?.startsWith('/') && !src.includes('..') && !src.startsWith('//'), 'Local MP4 path required');
    const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(dist, src.slice(1))], { cwd: worktree, capture: true, logFile }));
    out[route] = Number(info.format.duration);
  }
  return out;
}
export async function preflight({ root, rcSha, packet }) {
  assert.equal(process.version, REQUIRED_NODE, `Node must be exactly ${REQUIRED_NODE}`);
  const treeSha = await run('git', ['rev-parse', `${rcSha}^{tree}`], { cwd: root, capture: true });
  await run('git', ['merge-base', '--is-ancestor', BASE_SHA, rcSha], { cwd: root, capture: true });
  // A successful packet is immutable. Reruns reuse only verified bytes and the same runner.
  const runnerSha256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));
  const toolingHashes = await toolingIdentity();
  let existing;
  try { existing = await readJson(path.join(packet, 'preflight.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing) {
    equal(existing.toolingHashes, toolingHashes, 'Complete certified tooling identity changed');
    equal({ rcSha: existing.rcSha, treeSha: existing.treeSha, runnerSha256: existing.runnerSha256, status: existing.status }, { rcSha, treeSha, runnerSha256, status: 'PASS' }, 'Existing certification identity changed');
    assert.equal((await makeManifest(path.join(packet, 'dist'))).manifestSha256, existing.manifestSha256, 'Certified packet bytes drifted');
    return existing;
  }
  await fs.mkdir(packet, { recursive: true });
  const logFile = path.join(packet, 'preflight-commands.jsonl');
  return detached(root, rcSha, async (worktree) => {
    const gate = validateHumanGates(await readJson(path.join(worktree, 'release/final-rc-human-gates.json')));
    const env = { QA_AUTHORITY_PROFILE: 'final-rc' };
    const steps = [
      ['npm', ['ci']], ['npm', ['run', 'infra:validate']],
      // The current integrated harness runs the exact SHA in its own clean detached worktree.
      ['npm', ['run', 'qa:final-rc', '--', rcSha]],
      ['npm', ['run', 'check']], ['npm', ['test']],
      ['node', ['--test', 'tests/final-rc-contract.test.mjs']],
      ['npm', ['run', 'build']], ['node', ['--test', 'tests/built-route-contract.mjs']],
      ['npm', ['run', 'public-safety']], ['npm', ['run', 'qa:contrast']],
      ['npm', ['audit', '--audit-level=high']],
      ['npx', ['playwright', 'install', 'chromium', 'firefox', 'webkit']],
      ['npm', ['run', 'test:browser', '--', '--project=chromium', '--project=firefox', '--project=webkit']],
      ['npm', ['run', 'infra:validate-dist']], ['npm', ['run', 'infra:preview-dry-run']],
    ];
    for (const [cmd, args] of steps) await run(cmd, args, { cwd: worktree, env, logFile });
    const pkg = await readJson(path.join(worktree, 'package.json'));
    assert.equal(pkg.devDependencies.wrangler, '4.131.1', 'Pinned Wrangler required');
    for (const script of Object.keys(pkg.scripts).filter((s) => /^(?:qa|test):(?:performance|perf|lighthouse)$/.test(s))) await run('npm', ['run', script], { cwd: worktree, env, logFile });
    assert.equal(await run('git', ['diff', '--exit-code', 'HEAD', '--', 'src', 'public', 'package.json', 'package-lock.json'], { cwd: worktree, capture: true }), '', 'QA/build changed candidate source');
    const dist = path.join(worktree, 'dist');
    const contract = await verifyDist(dist, gate, await measuredDurations(worktree, dist, logFile));
    const manifest = await makeManifest(dist);
    await fs.cp(dist, path.join(packet, 'dist'), { recursive: true, errorOnExist: true, force: false });
    assert.equal((await makeManifest(path.join(packet, 'dist'))).manifestSha256, manifest.manifestSha256, 'Copied dist identity');
    await fs.writeFile(path.join(packet, 'build-manifest.json'), manifest.text, { mode: 0o400 });
    await fs.writeFile(path.join(packet, 'build-manifest.sha256'), `${manifest.manifestSha256}  build-manifest.json\n`, { mode: 0o400 });
    for (const rel of await files(path.join(packet, 'dist'))) await fs.chmod(path.join(packet, 'dist', rel), 0o400);
    const qaArtifacts = path.join(worktree, 'artifacts/final-rc', rcSha.slice(0, 12));
    await fs.cp(qaArtifacts, path.join(packet, 'final-rc-qa'), { recursive: true });
    const qa = await readJson(path.join(qaArtifacts, 'result.json'));
    assert.equal(qa.passed, true, 'Exact integrated QA result required');
    assert.equal(qa.targetSha, rcSha, 'QA must certify exact SHA');
    const result = { schema: 3, status: 'PASS', rcSha, treeSha, runnerSha256, toolingHashes, node: process.version, manifestSha256: manifest.manifestSha256, manifestEntries: manifest.entries.length, completedAt: new Date().toISOString(), contract, cloudflareMutationPerformed: false };
    await writeJson(path.join(packet, 'preflight.json'), result);
    return result;
  });
}

export async function toolingIdentity() {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const hashes = {};
  for (const name of ['final-rc-preview-exec.mjs', 'final-rc-preview-remote.mjs', 'validate-release-dist.mjs']) hashes[name] = sha256(await fs.readFile(path.join(sourceDir, name)));
  return hashes;
}
export function assertRouteResponse({ route, status, html, xRobotsTag }) {
  assert.equal(status, route === '/404' ? 404 : 200, 'True 404 and real-route status required');
  assertNoindexHeader(xRobotsTag);
  return validateHtmlMetadata(html, route);
}
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 2) {
    assert.ok(['--rc', '--authorize', '--packet-root'].includes(rest[i]), `Unknown argument ${rest[i]}`);
    assert.ok(rest[i + 1] && !rest[i + 1].startsWith('-'), `${rest[i]} requires value`);
    assert.ok(!(rest[i].slice(2) in args), 'Duplicate arguments prohibited');
    args[rest[i].slice(2)] = rest[i + 1];
  }
  return args;
}
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || ['help', '--help'].includes(argv[0])) {
    console.log('Usage: node scripts/final-rc-preview.mjs <preflight|preview|smoke|cleanup> --rc <exact SHA/ref> [--authorize CREATE_PRIVATE_FINAL_RC_PREVIEW|DELETE_PRIVATE_FINAL_RC_PREVIEW] [--packet-root path]'); return;
  }
  const args = parseArgs(argv);
  assert.ok(['preflight', 'preview', 'smoke', 'cleanup'].includes(args.command), 'Unknown command');
  assert.ok(args.rc && !args.rc.startsWith('-'), 'Exact --rc SHA/ref required');
  const root = await run('git', ['rev-parse', '--show-toplevel'], { capture: true });
  const remote = await run('git', ['remote', 'get-url', 'origin'], { cwd: root, capture: true });
  assert.match(remote, /(?:github\.com[:/])PHamilton8\/parkerhamilton-ca(?:\.git)?$/i, 'Wrong repository');
  const rcSha = await run('git', ['rev-parse', '--verify', `${args.rc}^{commit}`], { cwd: root, capture: true });
  assert.match(rcSha, /^[a-f0-9]{40}$/);
  const packet = path.resolve(root, args['packet-root'] ?? '.release-preview', rcSha);
  if (args.command === 'preflight') return preflight({ root, rcSha, packet });
  if (args.command === 'preview') assert.equal(args.authorize, PREVIEW_AUTHORIZATION, 'Preview authorization required');
  if (args.command === 'cleanup') assert.equal(args.authorize, CLEANUP_AUTHORIZATION, 'Cleanup authorization required');
  const lock = await fs.open(path.join(root, '.final-rc-preview.lock'), 'wx', 0o600).catch(() => { throw new Error('Another preview operation or unresolved lock exists; inspect before retrying'); });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, rcSha, command: args.command }) + '\n');
    const certificate = args.command === 'preview' ? await preflight({ root, rcSha, packet }) : await readJson(path.join(packet, 'preflight.json'));
    assert.equal(certificate.rcSha, rcSha);
    assert.equal(certificate.treeSha, await run('git', ['rev-parse', `${rcSha}^{tree}`], { cwd: root, capture: true }), 'Certified tree identity');
    equal(certificate.toolingHashes, await toolingIdentity(), 'Complete certified tooling identity');
    assert.equal(certificate.status, 'PASS');
    assert.equal((await makeManifest(path.join(packet, 'dist'))).manifestSha256, certificate.manifestSha256, 'Packet dist drift');
    const { createCloudflareClient, writeOwnerPacket } = await import('./final-rc-preview-remote.mjs');
    const client = await createCloudflareClient({ root, rcSha, packet, certificate });
    const persist = (name, data) => writeJson(path.join(packet, name), data);
    if (args.command === 'preview') {
      let previous; try { previous = await readJson(path.join(packet, 'preview.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      assert.ok(!previous, 'One immutable preview per candidate: existing preview record must be resolved, not overwritten');
      const result = await runPreviewTransaction({ client, certificate, persist, authorize: args.authorize });
      await writeOwnerPacket(packet, result); return result;
    }
    const state = await readJson(path.join(packet, 'preview.json'));
    assert.equal(state.rcSha, rcSha, 'Preview SHA mismatch');
    assert.equal(state.manifestSha256, certificate.manifestSha256, 'Preview certification mismatch');
    assertSafeCleanup(state, await client.snapshot());
    if (args.command === 'smoke') { const result = await client.smoke(state, certificate); await persist('repeat-smoke.json', result); return result; }
    const result = await client.deleteVersion(state); await persist('cleanup.json', result); return result;
  } finally { await lock.close(); await fs.rm(path.join(root, '.final-rc-preview.lock')); }
}
export const runCli = main;
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(`FAIL CLOSED: ${error.message}`); process.exitCode = 1; });
