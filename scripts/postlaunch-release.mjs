#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyCiEvidence, refreshPromotionCi, readCiProvenanceArtifact, assertSuccessfulRun } from './ci-release-evidence.mjs';
import { assertPreviewDestination, reconcileUploadEvidence, assertCompleteCandidateEvidence } from './release-evidence.mjs';

const WORKER_NAME = 'parkerhamilton-ca';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const API = 'https://api.github.com';
const CF_API = 'https://api.cloudflare.com/client/v4';
const RELEASE_REPOSITORY = 'PHamilton8/parkerhamilton-ca';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function json(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}
function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `Missing required environment variable: ${name}`);
  return value;
}
const ERROR_BODY_LIMIT = 8000;
const SENSITIVE_KEY = /(?:authorization|api[-_]?key|token|secret|password)/i;
const SECRET_ENV_NAMES = ['GITHUB_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CF_ACCESS_CLIENT_SECRET', 'CF_ACCESS_CLIENT_ID'];

function redactString(value) {
  let text = String(value);
  for (const name of SECRET_ENV_NAMES) {
    const secret = process.env[name];
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (account) text = text.split(account).join('[ACCOUNT]');
  return text;
}
function redactForLogs(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactForLogs(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactForLogs(item, depth + 1);
    }
    return out;
  }
  return value;
}
function boundedJson(value) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= ERROR_BODY_LIMIT) return serialized;
  return serialized.slice(0, ERROR_BODY_LIMIT) + '...[TRUNCATED]';
}
function apiErrorSummary(body, rawText) {
  if (!body || typeof body !== 'object') return { body: redactString(rawText).slice(0, ERROR_BODY_LIMIT) };
  const sanitized = redactForLogs(body);
  const pick = (entry) => ({
    code: entry?.code ?? null,
    message: entry?.message ?? null,
    ...(entry?.documentation_url ? { documentation_url: entry.documentation_url } : {}),
    ...(entry?.source ? { source: entry.source } : {}),
  });
  return {
    success: sanitized.success ?? null,
    errors: Array.isArray(sanitized.errors) ? sanitized.errors.slice(0, 20).map(pick) : [],
    messages: Array.isArray(sanitized.messages) ? sanitized.messages.slice(0, 20).map(pick) : [],
    ...((!Array.isArray(sanitized.errors) || sanitized.errors.length === 0) &&
       (!Array.isArray(sanitized.messages) || sanitized.messages.length === 0)
      ? { body: sanitized }
      : {}),
  };
}
export async function fetchJson(url, options = {}) {
  const target = new URL(url);
  const headers = new Headers(options.headers);
  if (headers.has('authorization')) {
    assert.ok(target.protocol === 'https:' && !target.username && !target.password && !target.port && !target.search.includes('token'), 'Clean HTTPS API destination required');
    assert.ok((target.origin === API && target.pathname.startsWith(`/repos/${RELEASE_REPOSITORY}/`)) ||
      (target.origin === 'https://api.cloudflare.com' && /^\/client\/v4\/accounts\/[a-f0-9]{32}\/workers\//.test(target.pathname)), 'Authenticated API request destination rejected');
  }
  const response = await fetch(url, { ...options, redirect: 'manual', signal: options.signal ?? AbortSignal.timeout(30000) });
  const rawText = await response.text();
  let body;
  let parsed = false;
  try {
    body = JSON.parse(rawText);
    parsed = true;
  } catch {}

  if (!response.ok) {
    const safeUrl = redactString(url);
    const detail = apiErrorSummary(parsed ? body : null, rawText);
    throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} from ${safeUrl}: ${boundedJson(detail)}`);
  }

  if (!parsed) {
    throw new Error(`Expected JSON from ${redactString(url)}; HTTP ${response.status}; body=${redactString(rawText).slice(0, ERROR_BODY_LIMIT)}`);
  }
  return body;
}
function githubHeaders() {
  return {
    Authorization: `Bearer ${requiredEnv('GITHUB_TOKEN')}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
function cloudflareHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${requiredEnv('CLOUDFLARE_API_TOKEN')}`,
    ...extra,
  };
}
function walkFiles(root, current = '') {
  const dir = path.join(root, current);
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const entry of entries) {
    const rel = path.posix.join(current.replaceAll('\\', '/'), entry.name);
    const abs = path.join(root, rel);
    if (entry.isDirectory()) out.push(...walkFiles(root, rel));
    else if (entry.isFile()) out.push(rel);
    else throw new Error(`Unsupported non-file entry in release dist: ${rel}`);
  }
  return out;
}
function distHash(root) {
  const rows = walkFiles(root).map((rel) => {
    const bytes = fs.readFileSync(path.join(root, rel));
    return { path: rel, size: bytes.length, sha256: sha256(bytes) };
  });
  const canonical = rows.map((r) => `${r.sha256}  ${r.size}  ${r.path}`).join('\n') + '\n';
  return { algorithm: 'sha256-manifest-v1', fileCount: rows.length, sha256: sha256(Buffer.from(canonical)), files: rows };
}
export async function verifyCi(sha) {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = await verifyCiEvidence({ sha, checkoutSha, repository,
    readJson: (pathname) => fetchJson(API + pathname, { headers: githubHeaders() }),
    readArtifact: (artifactId) => readCiProvenanceArtifact({ repository, artifactId, headers: githubHeaders() }),
  });
  json(result);
}
async function verifyPromotionCi(file) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(manifest.sourceSha ?? '', SHA, 'Exact reviewed source required');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  git('diff', '--quiet', 'HEAD', '--');
  const result = await refreshPromotionCi({ manifest, repository: requiredEnv('GITHUB_REPOSITORY'),
    mainSha: git('rev-parse', 'HEAD'), mainTree: git('rev-parse', 'HEAD^{tree}'),
    candidateTree: git('rev-parse', `${manifest.sourceSha}^{tree}`),
    readJson: (pathname) => fetchJson(API + pathname, { headers: githubHeaders() }),
    readArtifact: (artifactId) => readCiProvenanceArtifact({ repository: requiredEnv('GITHUB_REPOSITORY'), artifactId, headers: githubHeaders() }),
  });
  json(result);
}
function releaseEnvironment() {
  assert.equal(process.version, 'v24.22.1', 'Reviewed exact Node runtime required');
  assert.equal(process.versions.undici, '7.30.1', 'Reviewed Node fetch runtime required');
  const actual = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const expected = requiredEnv('EXPECTED_CLOUDFLARE_ACCOUNT_ID');
  assert.ok(/^[a-f0-9]{32}$/.test(actual) && /^[a-f0-9]{32}$/.test(expected) && actual === expected, 'Reviewed account binding required');
  assert.match(requiredEnv('EXPECTED_WORKERS_SUBDOMAIN'), /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Reviewed workers.dev subdomain required');
  assert.ok(requiredEnv('CLOUDFLARE_API_TOKEN'), 'Provider credential presence required');
  return { runtime: process.version, nodeUndici: process.versions.undici, accountMatchesReviewedPolicy: true,
    providerCredentialPresent: true, previewSubdomainPolicyPresent: true,
    limitation: 'Presence and destination policy checks do not attest credential scopes, environment approvals or earlier runner processes.' };
}
function requiredAccount() {
  const value = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  assert.match(value, /^[a-f0-9]{32}$/, 'Cloudflare account ID format rejected');
  assert.equal(value, requiredEnv('EXPECTED_CLOUDFLARE_ACCOUNT_ID'), 'Cloudflare account differs from reviewed policy');
  return value;
}
function collectHttpsStrings(value, out = []) {
  if (typeof value === 'string' && value.startsWith('https://')) out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectHttpsStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectHttpsStrings(item, out);
  return out;
}
export function parseWranglerOutput(file) {
  assert.ok(fs.statSync(file).size <= 1024 * 1024, 'Structured uploader output exceeds evidence limit');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const failed = lines.filter((entry) => entry.type === 'command-failed');
  assert.equal(failed.length, 0, 'Wrangler structured output reports command failure');
  const uploads = lines.filter((entry) => entry.type === 'version-upload');
  assert.equal(uploads.length, 1, `Expected exactly one version-upload record, got ${uploads.length}`);
  const upload = uploads[0];
  const versionId = upload.version_id ?? upload.versionId;
  assert.match(versionId ?? '', UUID, 'Structured output must contain exact Worker Version UUID');
  if (upload.worker_name !== undefined) assert.equal(upload.worker_name, WORKER_NAME, 'Unexpected Worker in uploader receipt');
  const urls = [...new Set(collectHttpsStrings(upload))];
  const previewUrls = urls.filter((value) => {
    try { assertPreviewDestination(value, versionId, requiredEnv('EXPECTED_WORKERS_SUBDOMAIN')); return true; }
    catch { return false; }
  });
  assert.equal(previewUrls.length, 1, 'Exactly one account-bound, version-specific preview URL required');
  return { versionId, previewUrl: previewUrls[0], workerName: WORKER_NAME, rawType: upload.type };
}

async function cfSnapshot() {
  const account = requiredAccount();
  const url = `${CF_API}/accounts/${account}/workers/scripts/${WORKER_NAME}/deployments`;
  const body = await fetchJson(url, { headers: cloudflareHeaders() });
  assert.equal(body.success, true, 'Cloudflare deployment list must succeed');
  const deployments = Array.isArray(body.result) ? body.result : body.result?.deployments;
  assert.ok(Array.isArray(deployments) && deployments.length > 0, 'At least one production deployment must exist');
  const active = deployments[0];
  assert.match(active.id ?? '', UUID, 'Active deployment UUID required');
  assert.ok(Array.isArray(active.versions) && active.versions.length > 0, 'Active deployment versions required');
  for (const item of active.versions) {
    assert.match(item.version_id ?? item.id ?? '', UUID, 'Production version UUID required');
    assert.ok(Number.isFinite(Number(item.percentage)) && Number(item.percentage) > 0 && Number(item.percentage) <= 100, 'Production allocation invalid');
  }
  const total = active.versions.reduce((sum, v) => sum + Number(v.percentage), 0);
  assert.ok(Math.abs(total - 100) < 0.0001, 'Active deployment allocations must total 100%');
  return {
    workerName: WORKER_NAME,
    deploymentId: active.id,
    versions: active.versions.map((v) => ({ versionId: v.version_id ?? v.id, percentage: Number(v.percentage) })),
    createdOn: typeof active.created_on === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(active.created_on) ? active.created_on : null,
  };
}
async function versionInventory() {
  const account = requiredAccount();
  const body = await fetchJson(`${CF_API}/accounts/${account}/workers/scripts/${WORKER_NAME}/versions`, { headers: cloudflareHeaders() });
  assert.equal(body.success, true);
  const items = body.result?.items ?? body.result;
  assert.ok(Array.isArray(items), 'Provider version window required');
  const ids = items.map((item) => item.id);
  for (const id of ids) assert.match(id ?? '', UUID);
  return [...new Set(ids)].sort();
}
export async function collectAfterState(directory, rawFile, outcome) {
  const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); } catch { return null; } };
  const [production, inventory] = await Promise.allSettled([cfSnapshot(), versionInventory()]);
  const after = production.status === 'fulfilled' ? production.value : null;
  const versionsAfter = inventory.status === 'fulfilled' ? inventory.value : null;
  let upload = null;
  try { upload = parseWranglerOutput(rawFile); } catch {}
  const evidence = reconcileUploadEvidence({ outcome, before: read('production-before.json'), after,
    versionsBefore: read('versions-before.json'), versionsAfter, upload });
  evidence.afterStateRead = { production: production.status, versionWindow: inventory.status };
  evidence.versionWindowScope = 'Provider-returned version list; absence is not proof of no partial upload';
  fs.writeFileSync(path.join(directory, 'operation-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (after) fs.writeFileSync(path.join(directory, 'production-after.json'), JSON.stringify(after, null, 2) + '\n');
  return evidence;
}
function assertProductionUnchanged(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  assert.deepEqual(after, before, 'Production deployment identity changed during non-production candidate creation');
  json({ productionUnchanged: true, deploymentId: after.deploymentId, versions: after.versions });
}
/** Follow authenticated preview redirects only within the original HTTPS origin. */
export async function fetchPreviewSameOrigin(url, accessHeaders, fetchImpl = fetch) {
  const original = new URL(url);
  assert.ok(original.protocol === 'https:' && !original.username && !original.password, 'Clean HTTPS preview request required');
  let current = original;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(current, { redirect: 'manual', headers: accessHeaders });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    assert.ok(redirects < 5, 'Too many preview redirects');
    const location = response.headers.get('location');
    assert.ok(location, 'Preview redirect requires Location');
    let target;
    try { target = new URL(location, current); }
    catch { throw new Error('Invalid preview redirect Location'); }
    assert.ok(target.protocol === 'https:' && target.origin === original.origin && !target.username && !target.password, 'Authenticated preview cannot forward Access credentials to another origin, a non-HTTPS URL, or a credential-bearing URL');
    current = target;
  }
  throw new Error('Too many preview redirects');
}
async function previewSmoke(previewUrl, versionId) {
  assertPreviewDestination(previewUrl, versionId, requiredEnv('EXPECTED_WORKERS_SUBDOMAIN'));
  const anonymous = await fetch(previewUrl, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } });
  if (![401, 403].includes(anonymous.status)) {
    assert.ok([302, 303, 307, 308].includes(anonymous.status), `Anonymous preview must be denied/challenged, got ${anonymous.status}`);
    const location = anonymous.headers.get('location') ?? '';
    const challenge = new URL(location);
    assert.ok(challenge.protocol === 'https:' && challenge.hostname.endsWith('.cloudflareaccess.com') && !challenge.username && !challenge.password && !challenge.port, 'Anonymous challenge must be a clean Cloudflare Access URL');
  }
  const accessHeaders = {
    'CF-Access-Client-Id': requiredEnv('CF_ACCESS_CLIENT_ID'),
    'CF-Access-Client-Secret': requiredEnv('CF_ACCESS_CLIENT_SECRET'),
    'Cache-Control': 'no-cache',
  };
  const routes = [
    ['/', 200],
    ['/work/askwill/', 200],
    ['/work/grocery-automation/', 200],
    ['/work/compound-growth/', 200],
    ['/work/coast-fi/', 200],
    ['/wealthsimple-2026/', 200],
    ['/gate0-preview-definitely-missing/', 404],
  ];
  const results = [];
  for (const [pathname, expected] of routes) {
    const response = await fetchPreviewSameOrigin(new URL(pathname, previewUrl), accessHeaders);
    assert.equal(response.status, expected, `${pathname}: expected HTTP ${expected}, got ${response.status}`);
    const robots = (response.headers.get('x-robots-tag') ?? '').toLowerCase();
    assert.ok(robots.includes('noindex'), `${pathname}: preview response must carry noindex`);
    results.push({ pathname, status: response.status, noindex: true });
  }
  json({ anonymousDenied: true, authenticatedRoutes: results });
}
async function resolveCandidateArtifact(tree) {
  assert.match(tree, SHA, 'Exact tree SHA required');
  const repo = requiredEnv('GITHUB_REPOSITORY');
  assert.equal(repo, RELEASE_REPOSITORY);
  const name = `review-candidate-${tree}`;
  const url = `${API}/repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`;
  const body = await fetchJson(url, { headers: githubHeaders() });
  const artifacts = (body.artifacts ?? []).filter((a) => a.name === name && !a.expired);
  assert.equal(artifacts.length, 1, `Expected exactly one non-expired candidate artifact for tree ${tree}; found ${artifacts.length}`);
  const artifact = artifacts[0];
  assert.ok(artifact.workflow_run?.id, 'Candidate artifact must carry workflow run identity');
  const run = await fetchJson(`${API}/repos/${repo}/actions/runs/${artifact.workflow_run.id}`, { headers: githubHeaders() });
  assertSuccessfulRun(run, repo, '.github/workflows/cloudflare-preview.yml');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.head_branch, 'main', 'Candidate creator must be dispatched from authoritative main');
  assert.equal(run.id, artifact.workflow_run.id);
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  json({ name, artifactId: artifact.id, runId: run.id, runAttempt: run.run_attempt, creatorSha: run.head_sha });
}
async function verifyVersion(versionId) {
  assert.match(versionId, UUID, 'Exact Worker Version UUID required');
  const account = requiredAccount();
  const url = `${CF_API}/accounts/${account}/workers/scripts/${WORKER_NAME}/versions/${versionId}`;
  const body = await fetchJson(url, { headers: cloudflareHeaders() });
  assert.equal(body.success, true, 'Cloudflare version lookup must succeed');
  assert.equal(body.result?.id, versionId, 'Resolved Cloudflare version must match candidate manifest');
  json({ versionId, exists: true });
}
function makeCandidateManifest(args) {
  const [sourceSha, treeSha, distSha, versionId, previewUrl, ciRunId, productionBeforeFile, productionAfterFile] = args;
  assert.match(sourceSha ?? '', SHA);
  assert.match(treeSha ?? '', SHA);
  assert.match(distSha ?? '', /^[0-9a-f]{64}$/i);
  assert.match(versionId ?? '', UUID);
  assertPreviewDestination(previewUrl, versionId, requiredEnv('EXPECTED_WORKERS_SUBDOMAIN'));
  const ciEvidence = JSON.parse(fs.readFileSync('.release-candidate/ci.json', 'utf8'));
  const operationEvidence = JSON.parse(fs.readFileSync('.release-candidate/operation-evidence.json', 'utf8'));
  assertCompleteCandidateEvidence(ciEvidence, operationEvidence, { sourceSha, treeSha, versionId, ciRunId: Number(ciRunId) });
  const before = JSON.parse(fs.readFileSync(productionBeforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(productionAfterFile, 'utf8'));
  assert.deepEqual(after, before, 'Production changed during candidate creation');
  json({
    schemaVersion: 2,
    status: 'REVIEW_CANDIDATE_UNPUBLISHED',
    workerName: WORKER_NAME,
    sourceSha,
    treeSha,
    distSha256: distSha,
    versionId,
    previewUrl,
    ciRunId: Number(ciRunId),
    ciEvidence,
    operationEvidence,
    candidateWorkflowRunId: Number(requiredEnv('GITHUB_RUN_ID')),
    candidateWorkflowAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
    productionSnapshot: before,
    createdAt: new Date().toISOString(),
  });
}
function verifyManifest(file, tree, artifactFile) {
  assert.match(tree, SHA);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.status, 'REVIEW_CANDIDATE_UNPUBLISHED');
  assert.equal(manifest.workerName, WORKER_NAME);
  assert.equal(manifest.treeSha, tree, 'Current main tree must exactly match reviewed candidate tree');
  assert.match(manifest.sourceSha ?? '', SHA);
  assert.match(manifest.distSha256 ?? '', /^[0-9a-f]{64}$/i);
  assert.match(manifest.versionId ?? '', UUID);
  assertPreviewDestination(manifest.previewUrl, manifest.versionId, requiredEnv('EXPECTED_WORKERS_SUBDOMAIN'));
  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
  assert.equal(manifest.candidateWorkflowRunId, artifact.runId);
  assert.equal(manifest.candidateWorkflowAttempt, artifact.runAttempt, 'Stale creator attempt receipt rejected');
  const candidateTree = execFileSync('git', ['rev-parse', `${manifest.sourceSha}^{tree}`], { encoding: 'utf8' }).trim();
  assert.equal(candidateTree, tree, 'Candidate source commit must resolve to the exact reviewed tree');
  assert.equal(manifest.ciEvidence?.sha, manifest.sourceSha);
  assert.equal(manifest.ciEvidence?.checkoutSha, manifest.sourceSha);
  assertCompleteCandidateEvidence(manifest.ciEvidence, manifest.operationEvidence, {
    sourceSha: manifest.sourceSha, treeSha: manifest.treeSha, versionId: manifest.versionId, ciRunId: manifest.ciRunId,
  });
  json(manifest);
}

async function activateVersion(versionId, message) {
  assert.match(versionId, UUID, 'Exact Worker Version UUID required');
  assert.ok(message && message.length <= 1000, 'Deployment message required and must fit Cloudflare annotation limit');
  const account = requiredAccount();
  const url = `${CF_API}/accounts/${account}/workers/scripts/${WORKER_NAME}/deployments`;
  const body = await fetchJson(url, {
    method: 'POST',
    headers: cloudflareHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      strategy: 'percentage',
      versions: [{ version_id: versionId, percentage: 100 }],
      annotations: { 'workers/message': message, 'workers/triggered_by': 'deployment' },
    }),
  });
  assert.equal(body.success, true, 'Cloudflare exact-version deployment must succeed');
  assert.match(body.result?.id ?? '', UUID, 'Deployment UUID required');
  const versions = body.result?.versions ?? [];
  assert.equal(versions.length, 1, 'Exact-version promotion must create a single-version deployment');
  assert.equal(versions[0].version_id ?? versions[0].id, versionId);
  assert.equal(Number(versions[0].percentage), 100);
  json({ deploymentId: body.result.id, versionId, percentage: 100, createdOn: body.result.created_on ?? null });
}
function singleActiveVersion(snapshotFile) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  assert.ok(Array.isArray(snapshot.versions) && snapshot.versions.length === 1, 'Production baseline must be a single-version deployment');
  assert.equal(Number(snapshot.versions[0].percentage), 100, 'Production baseline must allocate 100% to one version');
  const versionId = snapshot.versions[0].versionId;
  assert.match(versionId ?? '', UUID);
  json({ deploymentId: snapshot.deploymentId, versionId });
}
function assertActiveVersion(snapshotFile, versionId) {
  assert.match(versionId, UUID);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  assert.equal(snapshot.versions.length, 1, 'Post-deployment production must have one active version');
  assert.equal(snapshot.versions[0].versionId, versionId, 'Active production version must equal the requested exact version');
  assert.equal(Number(snapshot.versions[0].percentage), 100, 'Exact version must receive 100% traffic');
  json({ active: true, deploymentId: snapshot.deploymentId, versionId });
}

async function productionSmoke() {
  const origin = 'https://parkerhamilton.ca';
  const routes = [
    ['/', 200],
    ['/work/askwill/', 200],
    ['/work/grocery-automation/', 200],
    ['/work/compound-growth/', 200],
    ['/work/coast-fi/', 200],
    ['/work/smith-manoeuvre/', 200],
    ['/wealthsimple-2026/', 200],
    ['/gate0-production-definitely-missing/', 404],
  ];
  const results = [];
  for (const [pathname, expected] of routes) {
    const response = await fetch(origin + pathname, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, expected, `${pathname}: expected HTTP ${expected}, got ${response.status}`);
    results.push({ pathname, status: response.status });
  }
  json({ origin, routes: results });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
  switch (command) {
  case 'release-environment':
    json(releaseEnvironment());
    break;
  case 'cf-version-inventory':
    json(await versionInventory());
    break;
  case 'collect-after-state':
    { const evidence = await collectAfterState(args[0], args[1], args[2]);
      json(evidence);
      if (evidence.reconciliationRequired) process.exitCode = 1;
    }
    break;
  case 'dist-hash':
    json(distHash(args[0] ?? 'dist'));
    break;
  case 'verify-ci':
    await verifyCi(args[0]);
    break;
  case 'verify-promotion-ci':
    await verifyPromotionCi(args[0]);
    break;
  case 'parse-upload-output':
    json(parseWranglerOutput(args[0]));
    break;
  case 'cf-snapshot':
    json(await cfSnapshot());
    break;
  case 'assert-production-unchanged':
    assertProductionUnchanged(args[0], args[1]);
    break;
  case 'preview-smoke':
    await previewSmoke(args[0], args[1]);
    break;
  case 'resolve-candidate-artifact':
    await resolveCandidateArtifact(args[0]);
    break;
  case 'verify-version':
    await verifyVersion(args[0]);
    break;
  case 'activate-version':
    await activateVersion(args[0], args.slice(1).join(' '));
    break;
  case 'single-active-version':
    singleActiveVersion(args[0]);
    break;
  case 'assert-active-version':
    assertActiveVersion(args[0], args[1]);
    break;
  case 'make-candidate-manifest':
    makeCandidateManifest(args);
    break;
  case 'verify-manifest':
    verifyManifest(args[0], args[1], args[2]);
    break;
  case 'production-smoke':
    await productionSmoke();
    break;
    default:
      throw new Error(`Unknown post-launch release command: ${command ?? '(none)'}`);
  }
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Invalid structured release evidence' : redactString(error.message).slice(0, 2000);
    process.stderr.write(JSON.stringify({ status: 'FAILED', message }) + '\n');
    process.exitCode = 1;
  }
}
