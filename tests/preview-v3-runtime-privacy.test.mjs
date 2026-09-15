import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import { PRIVATE_RUNTIME_KEYS, createRuntimeRedactor, run, writeJson, assertBindingsUnchanged, bindingIdentitySha256 } from '../scripts/final-rc-preview-exec.mjs';
import { createCloudflareClient, writeOwnerPacket } from '../scripts/final-rc-preview-remote.mjs';

// Entirely synthetic fixtures: no runtime secret is read, printed, or sent anywhere.
const ENV = {
  CLOUDFLARE_API_TOKEN: 'synthetic-private-api-token-45001',
  CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CF_ACCESS_CLIENT_ID: 'synthetic-private-client-id-45002.access',
  CF_ACCESS_CLIENT_SECRET: 'synthetic-private-client-secret-45003',
  PREVIEW_REVIEW_EMAIL: 'synthetic-private-owner-45004@example.invalid',
};
for (const key of PRIVATE_RUNTIME_KEYS) process.env[key] = ENV[key];
const noValues = (text) => {
  for (const value of Object.values(ENV)) {
    assert.equal(text.includes(value), false, 'No configured fixture value may reach an output sink');
    assert.equal(text.includes(encodeURIComponent(value)), false, 'No URL-encoded fixture value may reach an output sink');
  }
};
const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'parker-runtime-privacy-'));
const WORKER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const VERSION = '33333333-3333-4333-8333-333333333333';
const previewUrl = 'https://33333333-parkerhamilton-ca.synthetic.workers.dev';
const policies = [
  { id: 'owner-policy', name: 'ParkerHamilton owner review', decision: 'allow', include: [{ email: { email: ENV.PREVIEW_REVIEW_EMAIL } }] },
  { id: 'automation-policy', name: 'ParkerHamilton automated smoke', decision: 'non_identity', include: [{ service_token: { token_id: 'matching-service-token-resource-id' } }] },
];
const response = (result) => new Response(JSON.stringify({ success: true, result, result_info: { total_pages: 1 } }), { status: 200 });
const clientFor = (packet, fetchImpl) => createCloudflareClient({ root: packet, rcSha: 'c'.repeat(40), packet, certificate: { status: 'PASS' }, env: ENV, fetchImpl });

test('redaction covers all five values, nested JSON, URL encoding and assertion properties without changing operational inputs', () => {
  const redact = createRuntimeRedactor(ENV);
  const raw = { inputs: { ...ENV }, query: encodeURIComponent(ENV.PREVIEW_REVIEW_EMAIL), safe: 'unchanged resource id', nestedKeys: { [ENV.CLOUDFLARE_API_TOKEN]: { [ENV.PREVIEW_REVIEW_EMAIL]: ENV.CF_ACCESS_CLIENT_SECRET } } };
  const sanitized = redact.value(raw);
  noValues(JSON.stringify(sanitized));
  assert.equal(sanitized.safe, raw.safe);
  assert.equal(Object.keys(sanitized.nestedKeys)[0], '[REDACTED:CLOUDFLARE_API_TOKEN]');
  assert.equal(Object.keys(sanitized.nestedKeys['[REDACTED:CLOUDFLARE_API_TOKEN]'])[0], '[REDACTED:PREVIEW_REVIEW_EMAIL]');
  assert.throws(() => redact.value({ [ENV.CLOUDFLARE_API_TOKEN]: 1, '[REDACTED:CLOUDFLARE_API_TOKEN]': 2 }), /keys must remain unambiguous/);
  assert.equal(raw.inputs.CF_ACCESS_CLIENT_SECRET, ENV.CF_ACCESS_CLIENT_SECRET);
  let original;
  try { assert.equal(ENV.CF_ACCESS_CLIENT_SECRET, ENV.PREVIEW_REVIEW_EMAIL); } catch (error) { original = error; }
  const safe = redact.error(original);
  noValues(inspect(safe));
  noValues(safe.message + safe.stack);
  assert.equal('actual' in safe, false);
  assert.equal('expected' in safe, false);
  assert.equal('cause' in safe, false);
  assert.equal(safe.code, 'ERR_ASSERTION');
});

test('complete buffered stdout/stderr redaction handles split writes and preserves nonzero failures', async () => {
  const directory = await temp();
  const logFile = path.join(directory, 'command.jsonl');
  try {
    const source = `const keys = ${JSON.stringify(PRIVATE_RUNTIME_KEYS)}; for (const key of keys) { const value = process.env[key]; const mid = Math.floor(value.length / 2); process.stdout.write(value.slice(0, mid)); await new Promise(r => setTimeout(r, 10)); process.stdout.write(value.slice(mid) + '\\n'); process.stderr.write(value.slice(0, mid)); await new Promise(r => setTimeout(r, 10)); process.stderr.write(value.slice(mid) + '\\n'); } process.exitCode = 7;`;
    const moduleUrl = new URL('../scripts/final-rc-preview-exec.mjs', import.meta.url).href;
    const outer = `const {run} = await import(${JSON.stringify(moduleUrl)}); try { await run(process.execPath, ['--input-type=module','-e',${JSON.stringify(source)}], {env: process.env, logFile: ${JSON.stringify(logFile)}}); } catch(error) { console.error(error); process.exitCode = 7; }`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', outer], { env: { PATH: process.env.PATH, ...ENV }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 7, 'Failure must remain a failure');
    noValues(child.stdout + child.stderr);
    noValues(await fs.readFile(logFile, 'utf8'));
    assert.match(child.stdout + child.stderr, /REDACTED:CF_ACCESS_CLIENT_SECRET/);
    assert.equal(JSON.parse(await fs.readFile(logFile, 'utf8')).code, 7);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('ordinary child processes inherit none of the five configured private values', async () => {
  const source = `process.stdout.write(JSON.stringify(${JSON.stringify(PRIVATE_RUNTIME_KEYS)}.map(key => Boolean(process.env[key]))))`;
  const result = await run(process.execPath, ['-e', source], { capture: true });
  assert.deepEqual(JSON.parse(result), [false, false, false, false, false]);
});

test('Wrangler secondary disk logs cannot bypass redaction even with caller overrides', async () => {
  const source = "process.stdout.write(JSON.stringify({write:process.env.WRANGLER_WRITE_LOGS,sanitize:process.env.WRANGLER_LOG_SANITIZE,token:process.env.CLOUDFLARE_API_TOKEN,access:process.env.CF_ACCESS_CLIENT_SECRET,review:process.env.PREVIEW_REVIEW_EMAIL}))";
  const result = JSON.parse(await run(process.execPath, ['-e', source], { capture: true, env: { CLOUDFLARE_API_TOKEN: ENV.CLOUDFLARE_API_TOKEN, WRANGLER_WRITE_LOGS: 'true', WRANGLER_LOG_SANITIZE: 'false' } }));
  assert.equal(result.write, 'false');
  assert.equal(result.sanitize, 'true');
  assert.equal(result.token, ENV.CLOUDFLARE_API_TOKEN, 'Only the explicitly authorized child credential remains operational');
  assert.equal(result.access, undefined);
  assert.equal(result.review, undefined);
});

test('JSON evidence and owner Markdown packet redact configured values', async () => {
  const directory = await temp();
  try {
    await writeJson(path.join(directory, 'evidence.json'), { ...ENV, nested: { include: [{ email: ENV.PREVIEW_REVIEW_EMAIL }] } });
    await writeOwnerPacket(directory, { previewUrl, rcSha: 'c'.repeat(40), treeSha: 'd'.repeat(40), manifestSha256: 'e'.repeat(64), workerId: WORKER, versionId: VERSION, rollbackIdentity: { safe: 'NO_EXISTING_PRODUCTION_DEPLOYMENT', runtimeEcho: { ...ENV } } });
    for (const file of ['evidence.json', 'OWNER-REVIEW-LINK-PACKET.md']) noValues(await fs.readFile(path.join(directory, file), 'utf8'));
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'evidence.json'), 'utf8')).PREVIEW_REVIEW_EMAIL, '[REDACTED:PREVIEW_REVIEW_EMAIL]');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Access policy uses exact operational identities but persists and returns redacted proof', async () => {
  const directory = await temp();
  await fs.mkdir(path.join(directory, 'dist'));
  await fs.writeFile(path.join(directory, 'dist', 'index.html'), '<html><body>synthetic fixture</body></html>');
  const calls = [];
  try {
    const client = await clientFor(directory, async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.method, 'GET', 'The existing synthetic Access fixture needs no writes');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, `Bearer ${ENV.CLOUDFLARE_API_TOKEN}`);
      assert.equal(options.headers['CF-Access-Client-Secret'], undefined);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/access/identity_providers')) return response([{ id: 'otp-id', name: 'One-time PIN', type: 'onetimepin' }]);
      if (pathname.endsWith('/access/service_tokens')) return response([{ id: 'matching-service-token-resource-id', client_id: ENV.CF_ACCESS_CLIENT_ID, enabled: true }]);
      if (pathname.endsWith('/workers/workers')) return response([{ id: WORKER, name: 'parkerhamilton-ca' }]);
      if (pathname.endsWith(`/workers/workers/${WORKER}`)) return response({ id: WORKER, name: 'parkerhamilton-ca', subdomain: { enabled: false, previews_enabled: true } });
      if (pathname.endsWith('/versions')) return response([]);
      if (pathname.endsWith('/access/apps')) return response([{ id: 'app-id', name: 'ParkerHamilton Private Preview Access', destinations: [{ type: 'preview_worker', worker_id: WORKER }] }]);
      if (pathname.endsWith('/access/apps/app-id/policies')) return response(policies);
      throw new Error('Unexpected synthetic endpoint');
    });
    const proof = await client.ensureAccess();
    noValues(JSON.stringify(proof));
    noValues(await fs.readFile(path.join(directory, 'access-policy.json'), 'utf8'));
    assert.equal(proof.serviceTokenId, 'matching-service-token-resource-id');
    assert.equal(proof.policies.length, 2);
    assert.ok(calls.length > 0);
    assert.ok(calls.every(({ url }) => new URL(url).origin === 'https://api.cloudflare.com'));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('API endpoint/error diagnostics cannot expose account, raw API error echoes, or assertion data', async () => {
  const directory = await temp();
  try {
    const client = await clientFor(directory, async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ success: false, errors: [{ code: 9109, message: Object.values(ENV).join(' ') }] }), { status: 403 });
    });
    let failure;
    try { await client.snapshot(); } catch (error) { failure = error; }
    assert.ok(failure);
    noValues(inspect(failure));
    assert.match(failure.message, /HTTP 403; error codes \[9109\]/);
    assert.match(failure.message, /REDACTED:CLOUDFLARE_ACCOUNT_ID/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('normalized snapshots remain comparable after safe JSON persistence', async () => {
  const directory = await temp();
  try {
    const client = await clientFor(directory, async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/workers/workers')) return response([{ id: WORKER, name: 'parkerhamilton-ca' }]);
      if (pathname.endsWith(`/workers/workers/${WORKER}`)) return response({ id: WORKER, name: 'parkerhamilton-ca', subdomain: { enabled: false, previews_enabled: true } });
      if (pathname === '/client/v4/zones') return response([]);
      if (pathname.endsWith('/workers/domains')) return response([{ id: 'domain-id', hostname: 'synthetic.invalid', service: 'parkerhamilton-ca', account_id: ENV.CLOUDFLARE_ACCOUNT_ID }]);
      if (pathname.endsWith('/deployments')) return response({ deployments: [{ id: 'deployment-id', versions: [{ version_id: VERSION, percentage: 100 }], author_email: ENV.PREVIEW_REVIEW_EMAIL }] });
      throw new Error('Unexpected synthetic endpoint');
    });
    const before = await client.snapshot();
    await writeJson(path.join(directory, 'before.json'), before);
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'before.json'), 'utf8'));
    assertBindingsUnchanged(saved, await client.snapshot());
    noValues(JSON.stringify(saved));
    assert.equal(saved.activeDeployment.deploymentId, 'deployment-id');
    assert.equal(saved.activeDeployment.versions[0].version_id, VERSION);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('redacted metadata cannot hide a raw production binding-state change', () => {
  const before = { routes: [], domains: [{ id: 'domain-id', account_id: ENV.CLOUDFLARE_ACCOUNT_ID }], deployments: [], workersDevEnabled: false, activeDeployment: { status: 'NO_EXISTING_PRODUCTION_DEPLOYMENT', deploymentId: null, versions: [] } };
  const after = { ...before, domains: [{ id: 'domain-id', account_id: ENV.CF_ACCESS_CLIENT_ID }] };
  // Even a deliberately colliding display mask cannot bypass the raw-state digest.
  const masked = { ...before, domains: [{ id: 'domain-id', account_id: '[REDACTED]' }] };
  assert.throws(() => assertBindingsUnchanged({ ...masked, bindingIdentitySha256: bindingIdentitySha256(before) }, { ...masked, bindingIdentitySha256: bindingIdentitySha256(after) }), /Original production binding state changed/);
  assert.throws(() => assertBindingsUnchanged({ ...masked, bindingIdentitySha256: bindingIdentitySha256(before) }, masked), /Complete current binding identity required/);
});

test('Access credentials never follow an external authenticated redirect', async () => {
  const calls = [];
  const client = await clientFor('/unused-synthetic-packet', async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response('Denied', { status: 403 });
    return new Response('', { status: 302, headers: { Location: 'https://unexpected.example.invalid/' } });
  });
  await assert.rejects(() => client.proveBoundary({ previewUrl, versionId: VERSION }), /cannot forward Access credentials/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['CF-Access-Client-Secret'], undefined);
  assert.equal(calls[1].options.headers['CF-Access-Client-Secret'], ENV.CF_ACCESS_CLIENT_SECRET);
  assert.ok(calls.every(({ url, options }) => new URL(url).origin === previewUrl && options.redirect === 'manual'));
});

test('exported CLI preserves nonzero failure while uncaught Node rendering exposes no configured value', () => {
  const moduleUrl = new URL('../scripts/final-rc-preview-exec.mjs', import.meta.url).href;
  const source = `const {runCli} = await import(${JSON.stringify(moduleUrl)}); await runCli(['preflight', '--' + process.env.CF_ACCESS_CLIENT_SECRET, 'synthetic']);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { PATH: process.env.PATH, ...ENV }, encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  noValues(child.stdout + child.stderr);
  assert.match(child.stderr, /Unknown argument.*REDACTED:CF_ACCESS_CLIENT_SECRET/);
});

test('command output memory ceiling fails closed before emitting partial buffered values', () => {
  const moduleUrl = new URL('../scripts/final-rc-preview-exec.mjs', import.meta.url).href;
  const source = "process.stdout.write(process.env.CF_ACCESS_CLIENT_SECRET); process.stdout.write(Buffer.alloc(65 * 1024 * 1024, 120));";
  const outer = `const {run} = await import(${JSON.stringify(moduleUrl)}); try { await run(process.execPath, ['-e',${JSON.stringify(source)}], {env: process.env}); } catch(error) { console.error(error); process.exitCode = 1; }`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', outer], { env: { PATH: process.env.PATH, ...ENV }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /64 MiB safety limit/);
  noValues(child.stdout + child.stderr);
  assert.equal(child.stdout.length, 0, 'Overflow must not emit the buffered prefix');
});
