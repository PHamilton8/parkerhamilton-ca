/** Cloudflare adapter for the readable V3 runner. API/CLI allowlists are enforced here. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  WORKER_NAME, REQUIRED_NODE, REAL_ROUTES, AUXILIARY_ROUTE, ROUTE_ACCOUNTING,
  CLEANUP_AUTHORIZATION, attributes, validateHtmlMetadata, validateSitemap,
  assertNoindexHeader, assertAnonymousDenied, assertImmutablePreviewUrl,
  assertBindingsUnchanged, assertSafeCleanup, assertSafeMutation, assertAccessPolicies,
  assertUploadCommand, assertRouteResponse, findExistingCandidateVersions, findOwnedUploadVersions, sha256, run, writeJson, makeManifest, files, parseVtt, MEDIA,
} from './final-rc-preview-exec.mjs';

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const GUARD_TEXT = 'Private preview access guard. No release candidate content.';
const GUARD_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Access guard</title></head><body>${GUARD_TEXT}</body></html>\n`;
const GUARD_HEADERS = 'https://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n';
const KEY = (s) => { assert.match(s, /^[a-zA-Z0-9-]+$/, 'Safe exact resource identifier'); return s; };

/** Runtime secrets are never written to evidence or passed as command-line arguments. */
export async function createCloudflareClient({ root, rcSha, packet, certificate, fetchImpl = fetch, env = process.env }) {
  assert.equal(process.version, REQUIRED_NODE);
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) assert.ok(env[name], `Secure runtime authorization missing: ${name}`);
  const accountId = KEY(env.CLOUDFLARE_ACCOUNT_ID);
  const base = `/accounts/${accountId}`;
  const scope = { accountId };
  const headers = () => ({ 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET, 'Cache-Control': 'no-cache' });
  const persist = (name, data) => writeJson(path.join(packet, name), data);
  async function api(endpoint, { method = 'GET', body, allow404 = false, context = {} } = {}) {
    assertSafeMutation({ method, path: endpoint, body }, { ...scope, ...context });
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4${endpoint}`, {
      method, redirect: 'error', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    let data; try { data = await res.json(); } catch { throw new Error(`Cloudflare ${method} ${endpoint}: invalid JSON HTTP ${res.status}`); }
    assert.ok(res.ok && data.success === true, `Cloudflare ${method} ${endpoint}: HTTP ${res.status}; ${JSON.stringify(data.errors ?? [])}`);
    return data;
  }
  async function list(endpoint) {
    const out = [];
    for (let page = 1; page <= 10000; page++) {
      const data = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
      assert.ok(Array.isArray(data.result), `Complete list expected: ${endpoint}`);
      out.push(...data.result);
      const info = data.result_info;
      if (info?.total_pages !== undefined) { assert.ok(Number.isInteger(info.total_pages) && info.total_pages >= 0); if (page >= info.total_pages) return out; }
      else if (data.result.length < 100) return out;
    }
    throw new Error(`Pagination did not terminate for ${endpoint}`);
  }
  const workerInfo = async () => {
    const workers = await list(`${base}/workers/workers`);
    const found = workers.filter((w) => w.name === WORKER_NAME);
    assert.ok(found.length <= 1, 'Ambiguous Worker name');
    if (!found.length) return null;
    const info = (await api(`${base}/workers/workers/${KEY(found[0].id)}`)).result;
    assert.ok(info?.id && info.name === WORKER_NAME && info.subdomain, 'Complete Worker metadata required');
    return info;
  };
  const readDeployments = async (worker) => {
    if (!worker) return [];
    const raw = (await api(`${base}/workers/scripts/${WORKER_NAME}/deployments`)).result;
    const deployments = Array.isArray(raw) ? raw : raw?.deployments;
    assert.ok(Array.isArray(deployments), 'Deployment response must explicitly contain an array');
    for (const d of deployments) {
      assert.ok(d.id && Array.isArray(d.versions), 'Complete active deployment identities required');
      for (const v of d.versions) assert.ok((v.version_id ?? v.id) && Number.isFinite(v.percentage), 'Complete deployment version allocation required');
    }
    return deployments;
  };
  async function snapshot() {
    const worker = await workerInfo();
    const zones = await list(`/zones?account.id=${accountId}`);
    const routes = [];
    for (const zone of zones) {
      const zoneRoutes = await list(`/zones/${KEY(zone.id)}/workers/routes`);
      for (const route of zoneRoutes) if (route.script === WORKER_NAME) routes.push({ ...route, zone_id: zone.id });
    }
    const domains = (await list(`${base}/workers/domains`)).filter((d) => d.service === WORKER_NAME);
    const deployments = await readDeployments(worker);
    // API contract: first list entry is the latest deployment actively serving traffic.
    // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/
    const activeDeployment = deployments.length ? { status: 'CURRENT_PRODUCTION_LKG_SNAPSHOT', deploymentId: deployments[0].id, versions: deployments[0].versions, createdOn: deployments[0].created_on ?? null } : { status: 'NO_EXISTING_PRODUCTION_DEPLOYMENT', deploymentId: null, versions: [] };
    return { workerName: WORKER_NAME, workerId: worker?.id ?? null, routes, domains, deployments, activeDeployment, workersDevEnabled: worker?.subdomain.enabled ?? false, snapshotAt: new Date().toISOString() };
  }
  async function ensureAccess() {
    // Determine the real identities before creating any infrastructure.
    const providers = await list(`${base}/access/identity_providers`);
    assert.ok(providers.length, 'Interactive owner Access identity provider/OTP must be securely configured');
    const token = (await list(`${base}/access/service_tokens`)).filter((t) => t.client_id === env.CF_ACCESS_CLIENT_ID && t.enabled !== false);
    assert.equal(token.length, 1, 'One enabled matching Access service token required');
    assert.ok(token[0].id, 'Exact service token ID required');
    const emails = new Set();
    for (const file of (await files(path.join(packet, 'dist'))).filter((p) => p.endsWith('.html'))) {
      const html = await fs.readFile(path.join(packet, 'dist', file), 'utf8');
      for (const m of html.matchAll(/mailto:([^?"'<>\s]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
    }
    const reviewEmail = env.PREVIEW_REVIEW_EMAIL ?? (emails.size === 1 ? [...emails][0] : null);
    assert.match(reviewEmail ?? '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Unambiguous owner review email required');
    let worker = await workerInfo();
    if (worker) await rejectExistingCandidate(worker.id, await listVersions(worker.id));
    if (!worker) {
      const before = await snapshot();
      worker = (await api(`${base}/workers/workers`, { method: 'POST', body: { name: WORKER_NAME, subdomain: { enabled: false, previews_enabled: true } }, context: { workerAbsent: true } })).result;
      await persist('empty-worker-created.json', { workerId: worker.id, noContentUploaded: true, noDeploymentCreated: true });
      assertBindingsUnchanged(before, await snapshot());
    }
    scope.workerId = KEY(worker.id);
    scope.reviewEmail = reviewEmail;
    scope.serviceTokenId = token[0].id;
    assert.equal(worker.subdomain.enabled, false, 'Public workers.dev binding must remain disabled');
    assert.equal(worker.subdomain.previews_enabled, true, 'Version previews must already be enabled; this tool does not alter existing Worker settings');
    const apps = await list(`${base}/access/apps`);
    const matches = apps.filter((app) => app.destinations?.some((d) => d.type === 'preview_worker' && d.worker_id === worker.id));
    assert.ok(matches.length <= 1, 'Ambiguous preview Access application');
    let app = matches[0];
    const policies = [
      { name: 'ParkerHamilton owner review', decision: 'allow', include: [{ email: { email: reviewEmail } }] },
      { name: 'ParkerHamilton automated smoke', decision: 'non_identity', include: [{ service_token: { token_id: token[0].id } }] },
    ];
    if (!app) app = (await api(`${base}/access/apps`, { method: 'POST', body: { type: 'self_hosted', name: 'ParkerHamilton Private Preview Access', session_duration: '8h', destinations: [{ type: 'preview_worker', worker_id: worker.id }], policies } })).result;
    assert.equal(app.name, 'ParkerHamilton Private Preview Access', 'Existing Access app must be the narrowly managed preview app');
    assert.deepEqual(app.destinations, [{ type: 'preview_worker', worker_id: worker.id }], 'Access cannot affect production or other Workers');
    const actualPolicies = await list(`${base}/access/apps/${KEY(app.id)}/policies`);
    assertAccessPolicies(actualPolicies, reviewEmail, token[0].id);
    const evidence = { appId: app.id, workerId: worker.id, reviewEmail, serviceTokenId: token[0].id, identityProviders: providers.map(({ id, name, type }) => ({ id, name, type })), policies: actualPolicies.map(({ id, name, decision, include }) => ({ id, name, decision, include })) };
    await persist('access-policy.json', evidence);
    return evidence;
  }
  async function withCandidate(fn) {
    const worktree = await fs.mkdtemp(path.join(os.tmpdir(), 'parker-preview-adapter-'));
    let attached = false;
    try {
      await run('git', ['worktree', 'add', '--detach', worktree, rcSha], { cwd: root }); attached = true;
      assert.equal(await run('git', ['status', '--porcelain'], { cwd: worktree, capture: true }), '', 'Clean detached upload worktree');
      await run('npm', ['ci'], { cwd: worktree });
      await run('npm', ['run', 'infra:validate'], { cwd: worktree });
      return await fn(worktree);
    } finally {
      if (attached) await run('git', ['worktree', 'remove', '--force', worktree], { cwd: root });
      else await fs.rm(worktree, { recursive: true, force: true });
    }
  }
  const listVersions = async (workerId) => list(`${base}/workers/workers/${KEY(workerId)}/versions`);
  async function rejectExistingCandidate(workerId, versions) {
    const existing = findExistingCandidateVersions(versions, rcSha);
    if (existing.length) {
      await persist('EXISTING-CANDIDATE-REQUIRES-PACKET-RESTORE.json', { status: 'EXISTING_IMMUTABLE_CANDIDATE', workerId, rcSha, existing, action: 'Restore the original durable certification/production baseline packet and smoke that exact version. Do not create another candidate or infer a new baseline.' });
      throw new Error(`An immutable candidate for ${rcSha} already exists: ${existing.map((v) => v.versionId).join(', ')}. Restore its original packet; no duplicate upload is allowed.`);
    }
  }
  async function upload(kind) {
    const worker = await workerInfo();
    assert.ok(worker?.id, 'Access-managed Worker must exist before upload');
    const baseline = await snapshot();
    const before = await listVersions(worker.id);
    if (kind === 'candidate') await rejectExistingCandidate(worker.id, before);
    const known = new Set(before.map((v) => v.id));
    const attemptId = randomUUID();
    const uploadMessage = `${kind === 'guard' ? `ACCESS GUARD only ${rcSha}` : `PRIVATE FINAL RC ${rcSha}; unpublished`}; attempt ${attemptId}`;
    await persist(`${kind}-upload-intent.json`, { workerId: worker.id, beforeVersionIds: [...known], rcSha, attemptId, uploadMessage, manifestSha256: kind === 'candidate' ? certificate.manifestSha256 : null, status: 'PENDING_UPLOAD_RECONCILIATION' });
    let commandError;
    let uploadAttempted = false;
    try {
      await withCandidate(async (worktree) => {
        const dist = path.join(worktree, 'dist');
        await fs.rm(dist, { recursive: true, force: true });
        if (kind === 'guard') {
          await fs.mkdir(dist);
          await fs.writeFile(path.join(dist, 'index.html'), GUARD_HTML);
          await fs.writeFile(path.join(dist, '_headers'), GUARD_HEADERS);
        } else {
          assert.equal((await makeManifest(path.join(packet, 'dist'))).manifestSha256, certificate.manifestSha256, 'Certified packet modified before upload');
          await fs.cp(path.join(packet, 'dist'), dist, { recursive: true });
          assert.equal((await makeManifest(dist)).manifestSha256, certificate.manifestSha256, 'Upload exact certified dist');
        }
        const args = ['versions', 'upload', '--message', uploadMessage, '--tag', `${kind}-${rcSha.slice(0, 12)}`, '--experimental-provision=false', '--experimental-auto-create=false', '--install-skills=false'];
        if (kind === 'candidate') await rejectExistingCandidate(worker.id, await listVersions(worker.id));
        uploadAttempted = true;
        assertUploadCommand(args);
        // This is the only upload executable. No normal deployment/activation command exists.
        await run(path.join(worktree, 'node_modules/.bin/wrangler'), args, { cwd: worktree, env: { CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: accountId }, logFile: path.join(packet, `${kind}-upload.jsonl`) });
      });
    } catch (e) { commandError = e; }
    if (!uploadAttempted) {
      await persist(`${kind}-upload-not-attempted.json`, { status: 'NO_UPLOAD_ATTEMPTED', workerId: worker.id, attemptId, failure: commandError?.message ?? 'Stopped before upload' });
      throw commandError ?? new Error('Upload was not attempted');
    }
    // Resolve new IDs even on uncertain CLI failure; never lose a created version's cleanup identity.
    let added;
    try { added = (await listVersions(worker.id)).filter((v) => !known.has(v.id)); }
    catch (error) {
      await persist('MANUAL-CLEANUP-REQUIRED.json', { status: 'MANUAL-CLEANUP-REQUIRED', kind, workerId: worker.id, beforeVersionIds: [...known], rcSha, attemptId, uploadMessage, unknownUploadOutcome: true, commandFailure: commandError?.message ?? null, reconciliationFailure: error.message, action: 'Fresh-list versions and match the exact unique attempt message. A before/after set alone does not establish ownership; never infer a deletion target' });
      throw error;
    }
    const owned = findOwnedUploadVersions(added, { beforeVersionIds: [...known], uploadMessage, uploadAttempted });
    await persist(`${kind}-upload-reconciliation.json`, { beforeVersionIds: [...known], addedVersionIds: added.map((v) => v.id), ownedVersionIds: owned.map((v) => v.id), workerId: worker.id, attemptId, uploadMessage, commandFailure: commandError?.message ?? null });
    if (owned.length !== 1) {
      await persist('MANUAL-CLEANUP-REQUIRED.json', { status: 'MANUAL-CLEANUP-REQUIRED', workerId: worker.id, attemptId, uploadMessage, exactAddedVersionIds: added.map((v) => v.id), exactOwnedVersionIds: owned.map((v) => v.id), reason: 'Upload ownership is not uniquely proved by the exact per-attempt nonce; no version inferred or deleted' });
      throw new Error(`Upload ownership resolved ${owned.length} matching versions; expected exactly one. ${commandError?.message ?? ''}`);
    }
    const versionId = owned[0].id;
    const state = { workerId: worker.id, versionId, attemptId, uploadMessage, unpublished: true, bindingBaseline: baseline };
    await persist(`${kind}-created-version.json`, state);
    try {
      assert.match(versionId, ID, 'Exact immutable version UUID required');
      assertSafeCleanup(state, await snapshot());
      if (commandError) throw commandError;
      const detail = (await api(`${base}/workers/workers/${KEY(worker.id)}/versions/${KEY(versionId)}`)).result;
      if (kind === 'candidate') {
        const candidates = findExistingCandidateVersions(await listVersions(worker.id), rcSha);
        assert.equal(candidates.length, 1, 'Exactly one remote candidate must exist, including concurrent uploads');
        assert.equal(candidates[0].versionId, versionId, 'New candidate identity must match durable remote annotation');
      }
      const urls = (detail?.urls ?? []).filter((u) => typeof u === 'string' && u.startsWith(`https://${versionId.slice(0, 8)}-${WORKER_NAME}.`));
      assert.equal(urls.length, 1, 'Exactly one immutable version URL required');
      state.previewUrl = assertImmutablePreviewUrl(urls[0], versionId);
      await persist(`${kind}-created-version.json`, state);
      return state;
    } catch (e) {
      try { await deleteVersion(state); }
      catch (cleanupError) { await persist('MANUAL-CLEANUP-REQUIRED.json', { status: 'MANUAL-CLEANUP-REQUIRED', ...state, failure: e.message, cleanupFailure: cleanupError.message }); }
      throw e;
    }
  }
  async function fetchPreview(url, authenticated = true) {
    const original = new URL(url);
    assertImmutablePreviewUrl(original.origin);
    let current = original;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const res = await fetchImpl(current.href, { redirect: 'manual', headers: authenticated ? headers() : { 'Cache-Control': 'no-cache' } });
      if (!authenticated || ![301, 302, 303, 307, 308].includes(res.status)) return res;
      const target = new URL(res.headers.get('location') ?? '', current);
      assert.equal(target.origin, original.origin, 'Authenticated fetch cannot forward Access credentials to another origin');
      assert.ok(!target.username && !target.password, 'Redirect credentials prohibited');
      current = target;
    }
    throw new Error('Too many preview redirects');
  }
  async function proveBoundary(version) {
    assertImmutablePreviewUrl(version.previewUrl, version.versionId);
    const anon = await fetchPreview(version.previewUrl, false);
    const anonymousLocation = anon.headers.get('location');
    assertAnonymousDenied({ status: anon.status, location: anonymousLocation }, version.previewUrl);
    const auth = await fetchPreview(version.previewUrl);
    assert.equal(auth.status, 200, 'Authenticated Access success required');
    const xRobotsTag = auth.headers.get('x-robots-tag'); assertNoindexHeader(xRobotsTag);
    const body = await auth.text();
    assert.equal(body, GUARD_HTML, 'Guard response must contain exact harmless guard bytes');
    return { status: 'PASS', anonymousStatus: anon.status, anonymousLocation, authenticatedStatus: auth.status, xRobotsTag, guardSha256: sha256(body) };
  }
  async function deleteVersion(state) {
    const before = await snapshot();
    assertSafeCleanup(state, before);
    await api(`${base}/workers/workers/${KEY(state.workerId)}/versions/${KEY(state.versionId)}`, { method: 'DELETE', context: { workerId: state.workerId, versionId: state.versionId, cleanupProved: true } });
    const exists = await api(`${base}/workers/workers/${KEY(state.workerId)}/versions/${KEY(state.versionId)}`, { allow404: true });
    assert.equal(exists, null, 'Deleted version must be absent by exact GET');
    assertBindingsUnchanged(before, await snapshot());
    if (state.previewUrl) {
      const res = await fetchPreview(state.previewUrl);
      assert.ok([404, 410].includes(res.status), `Deleted immutable URL must be gone; got ${res.status}`);
    }
    return { status: 'PASS', deletedVersionId: state.versionId, workerId: state.workerId, accessRetained: true, productionUntouched: true };
  }
  async function browserSmoke(version) {
    return withCandidate(async (worktree) => {
      await run('npx', ['playwright', 'install', 'chromium', 'firefox', 'webkit'], { cwd: worktree });
      const playwright = await import(pathToFileURL(path.join(worktree, 'node_modules/@playwright/test/index.mjs')).href);
      const findings = [];
      for (const engine of ['chromium', 'firefox', 'webkit']) {
        const browser = await playwright[engine].launch({ headless: true });
        try {
          const context = await browser.newContext({ serviceWorkers: 'block' });
          // Browser never receives global service credentials. Proxy each request with
          // maxRedirects=0; inspect Location before permitting any subsequent request.
          await context.route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== version.previewUrl && !['data:', 'blob:'].includes(url.protocol)) { findings.push({ engine, kind: 'unexpected-origin', url: url.href }); await route.abort(); }
            else {
              const response = await route.fetch({ headers: { ...request.headers(), ...headers() }, maxRedirects: 0 });
              if ([301, 302, 303, 307, 308].includes(response.status())) {
                const next = new URL(response.headers().location ?? '', url);
                if (next.origin !== version.previewUrl) { findings.push({ engine, kind: 'unexpected-redirect-origin', url: next.href }); await route.abort(); return; }
              }
              await route.fulfill({ response });
            }
          });
          for (const route of REAL_ROUTES) {
            const page = await context.newPage();
            page.on('pageerror', (e) => findings.push({ engine, route, kind: 'pageerror', message: e.message }));
            page.on('console', (m) => { if (m.type() === 'error') findings.push({ engine, route, kind: 'console-error', message: m.text() }); });
            page.on('response', (res) => { if (res.status() >= 400) findings.push({ engine, route, kind: 'asset-http', url: res.url(), status: res.status() }); });
            page.on('requestfailed', (req) => { if (!req.failure()?.errorText?.includes('ERR_ABORTED') && !req.failure()?.errorText?.includes('NS_BINDING_ABORTED')) findings.push({ engine, route, kind: 'request-failure', url: req.url(), message: req.failure()?.errorText }); });
            const response = await page.goto(`${version.previewUrl}${route}`, { waitUntil: 'networkidle' });
            assert.equal(response?.status(), 200, `${engine} ${route}: HTTP 200`);
            for (const width of [1440, 1024, 820, 430, 390, 360, 320]) {
              await page.setViewportSize({ width, height: 900 });
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${engine} ${route}: overflow at ${width}`);
            }
            await page.setViewportSize({ width: 720, height: 450 }); // 1440x900 CSS-pixel equivalent of desktop 200% reflow.
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '200% equivalent reflow');
            await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); } scrollTo(0, 0); });
            const videos = page.locator('video');
            if (await videos.count()) {
              await videos.evaluateAll(async (elements) => {
                for (const video of elements) {
                  if (video.readyState < 1) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Media metadata timeout')), 20000); video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true }); video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Media load failure')); }, { once: true }); video.load(); });
                  for (const track of video.textTracks) track.mode = 'hidden';
                }
              });
              await page.waitForFunction(() => [...document.querySelectorAll('video')].every((v) => [...v.textTracks].some((t) => t.cues?.length > 0)));
              const duration = await videos.first().evaluate((v) => v.duration);
              const expected = route === AUXILIARY_ROUTE ? MEDIA.wealthsimple.durationSeconds : MEDIA.designDay.durationSeconds;
              assert.ok(Math.abs(duration - expected) <= 0.001, `${route}: browser duration`);
            }
            const broken = await page.locator('img').evaluateAll((images) => images.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
            assert.deepEqual(broken, [], `${route}: no broken images`);
            await page.close();
          }
          await context.close();
        } finally { await browser.close(); }
      }
      await persist('remote-browser-smoke.json', { browsers: ['chromium', 'firefox', 'webkit'], findings });
      assert.deepEqual(findings, [], 'No unexpected origins, errors or broken requests');
      return { browsers: ['chromium', 'firefox', 'webkit'], unexpectedOrigins: 0, errors: 0 };
    });
  }
  async function smoke(version, cert) {
    assertImmutablePreviewUrl(version.previewUrl, version.versionId);
    assert.equal(cert.rcSha, rcSha);
    const manifest = await makeManifest(path.join(packet, 'dist'));
    assert.equal(manifest.manifestSha256, cert.manifestSha256, 'Certified local bytes remain intact');
    const anonymous = await fetchPreview(version.previewUrl, false);
    assertAnonymousDenied({ status: anonymous.status, location: anonymous.headers.get('location') }, version.previewUrl);
    const routeResults = {};
    let checked = 0;
    for (const entry of manifest.entries) {
      if (['_headers', '_redirects'].includes(entry.path)) continue; // Cloudflare control files are configuration, not served assets.
      let urlPath = `/${entry.path}`;
      if (entry.path === '404.html') urlPath = '/__final_rc_missing_probe__/';
      else if (entry.path === 'index.html') urlPath = '/';
      else if (entry.path.endsWith('/index.html')) urlPath = `/${entry.path.slice(0, -11)}/`;
      const response = await fetchPreview(version.previewUrl + urlPath);
      assert.equal(response.status, entry.path === '404.html' ? 404 : 200, `${entry.path}: exact HTTP status`);
      assertNoindexHeader(response.headers.get('x-robots-tag'));
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, entry.size, `${entry.path}: remote length`);
      assert.equal(sha256(bytes), entry.sha256, `${entry.path}: remote SHA256`);
      if (entry.path.endsWith('.vtt')) { assert.match(response.headers.get('content-type') ?? '', /^text\/vtt\b/i, 'VTT MIME type required'); parseVtt(bytes.toString(), entry.path.includes('application') ? MEDIA.wealthsimple.durationSeconds : MEDIA.designDay.durationSeconds); }
      if (entry.path === 'sitemap.xml') validateSitemap(bytes.toString());
      if (entry.path.endsWith('.html')) {
        const route = entry.path === '404.html' ? '/404' : entry.path === 'index.html' ? '/' : `/${entry.path.slice(0, -11)}`;
        routeResults[route] = { status: response.status, ...assertRouteResponse({ route, status: response.status, html: bytes.toString(), xRobotsTag: response.headers.get('x-robots-tag') }) };
      }
      checked++;
    }
    assert.deepEqual(Object.keys(routeResults).sort(), [...REAL_ROUTES, '/404'].sort(), ROUTE_ACCOUNTING);
    const browsers = await browserSmoke(version);
    assertBindingsUnchanged(version.bindingBaseline, await snapshot());
    const result = { status: 'PASS', rcSha, manifestSha256: manifest.manifestSha256, checkedAssets: checked, routes: routeResults, browsers, anonymousStatus: anonymous.status, xRobotsTag: 'noindex, nofollow, noarchive', productionUntouched: true };
    await persist('remote-smoke.json', result); return result;
  }
  return { snapshot, ensureAccess, uploadGuard: () => upload('guard'), uploadCandidate: async (cert) => { assert.equal(cert.manifestSha256, certificate.manifestSha256); return upload('candidate'); }, proveBoundary, deleteVersion, smoke };
}
export async function writeOwnerPacket(packet, result) {
  const cleanup = `node scripts/final-rc-preview.mjs cleanup --rc ${result.rcSha} --authorize ${CLEANUP_AUTHORIZATION}`;
  const text = `# Final integrated private preview\n\nStatus: PASS\n\nReview URL: ${result.previewUrl}\n\n- Source SHA: \`${result.rcSha}\`\n- Tree: \`${result.treeSha}\`\n- Dist manifest SHA-256: \`${result.manifestSha256}\`\n- Worker ID: \`${result.workerId}\`\n- Unpublished version: \`${result.versionId}\`\n- ${ROUTE_ACCOUNTING}\n- Sitemap: eight portfolio routes only; production canonicals use https://parkerhamilton.ca.\n- Full integrated QA, three browsers, exact media/workbooks/captions, Access guard, anonymous denial, preview response noindex and every served asset SHA-256: PASS.\n- Production routes/custom domains/deployments unchanged. No DNS writes performed.\n\n## Cleanup and rollback identity\n\nCleanup: \`${cleanup}\`\n\nAccess protection is retained. Recorded production/LKG identity is the complete exact snapshot in production-before.json; no rollback target is inferred.\n\n\`\`\`json\n${JSON.stringify(result.rollbackIdentity, null, 2)}\n\`\`\`\n\nAWAITING PARKER FINAL INTEGRATED PREVIEW APPROVAL\n`;
  await fs.writeFile(path.join(packet, 'OWNER-REVIEW-LINK-PACKET.md'), text, { mode: 0o600 });
}
