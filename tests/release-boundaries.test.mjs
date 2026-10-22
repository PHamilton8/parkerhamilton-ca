import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPreviewDestination, reconcileUploadEvidence, assertCompleteCandidateEvidence } from '../scripts/release-evidence.mjs';
import { fetchJson, parseWranglerOutput, collectAfterState } from '../scripts/postlaunch-release.mjs';

const version = '12345678-1234-4123-8123-123456789abc';
const previousVersion = '23456789-1234-4123-8123-123456789abc';
const deployment = '34567890-1234-4123-8123-123456789abc';
const subdomain = 'reviewed-account';
const origin = `https://${version.slice(0, 8)}-parkerhamilton-ca.${subdomain}.workers.dev`;
const snapshot = { workerName: 'parkerhamilton-ca', deploymentId: deployment,
  versions: [{ versionId: previousVersion, percentage: 100 }] };

test('exact preview destination binds version, Worker and reviewed account', () => {
  assert.equal(assertPreviewDestination(origin, version, subdomain).origin, origin);
  for (const value of [origin.replace(subdomain, 'foreign-account'), origin.replace('12345678-', '87654321-'),
    origin.replace('parkerhamilton-ca.', 'foreign-worker.'), origin.replace('https:', 'http:'),
    origin + ':444', origin + '?token=invented', origin + '#fragment', origin.replace('https://', 'https://invented:marker@'),
    origin + '.attacker.test']) assert.throws(() => assertPreviewDestination(value, version, subdomain));
});

test('structured uploader cannot substitute a matching-format foreign account preview', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-destination-'));
  const file = path.join(dir, 'output.ndjson');
  const old = process.env.EXPECTED_WORKERS_SUBDOMAIN;
  process.env.EXPECTED_WORKERS_SUBDOMAIN = subdomain;
  try {
    const write = (url) => fs.writeFileSync(file, JSON.stringify({ type: 'version-upload', version_id: version, preview_url: url }) + '\n');
    write(origin.replace(subdomain, 'foreign-account'));
    assert.throws(() => parseWranglerOutput(file), /account-bound/);
    write(origin);
    assert.deepEqual(parseWranglerOutput(file), { versionId: version, previewUrl: origin, workerName: 'parkerhamilton-ca', rawType: 'version-upload' });
    fs.appendFileSync(file, JSON.stringify({ type: 'command-failed', message: 'invented marker' }) + '\n');
    assert.throws(() => parseWranglerOutput(file), /command failure/);
  } finally {
    if (old === undefined) delete process.env.EXPECTED_WORKERS_SUBDOMAIN; else process.env.EXPECTED_WORKERS_SUBDOMAIN = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('authenticated API redirects are not followed and foreign recipients receive no request', async () => {
  const previous = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 302, headers: { location: 'https://foreign.test/' } }); };
  try {
    await assert.rejects(fetchJson('https://foreign.test/', { headers: { authorization: 'Bearer invented' } }), /destination rejected/);
    assert.equal(calls.length, 0);
    await assert.rejects(fetchJson('https://api.github.com/repos/PHamilton8/parkerhamilton-ca/actions/runs', {
      redirect: 'follow', headers: { authorization: 'Bearer invented' },
    }), /HTTP 302/);
    assert.equal(calls.length, 1); assert.equal(calls[0].options.redirect, 'manual');
  } finally { globalThis.fetch = previous; }
});

test('partial upload is retained as uncertain non-promotable evidence', () => {
  const common = { before: snapshot, after: snapshot, versionsBefore: [previousVersion], versionsAfter: [previousVersion, version] };
  const failed = reconcileUploadEvidence({ ...common, outcome: 'failure' });
  assert.equal(failed.status, 'NON_PROMOTABLE_OPERATION_EVIDENCE');
  assert.equal(failed.reconciliationRequired, true); assert.equal(failed.productionUnchanged, true);
  assert.deepEqual(failed.newVersionIds, [version]); assert.equal(failed.receiptVersionId, null);
  const complete = reconcileUploadEvidence({ ...common, outcome: 'success', upload: { versionId: version } });
  assert.equal(complete.reconciliationRequired, false);
  assert.equal(complete.status, 'NON_PROMOTABLE_OPERATION_EVIDENCE');
  for (const partial of [
    { after: null }, { versionsAfter: null }, { versionsAfter: [previousVersion] },
    { after: { ...snapshot, deploymentId: version } }, { upload: { versionId: previousVersion } },
  ]) assert.equal(reconcileUploadEvidence({ ...common, outcome: 'success', upload: { versionId: version }, ...partial }).reconciliationRequired, true);
});

test('failure evidence discards arbitrary keys, raw secrets and invalid provider identities', () => {
  const raw = { ...snapshot, token: 'not-an-export', errors: ['not-an-export'], createdOn: 'not-an-export' };
  const evidence = reconcileUploadEvidence({ outcome: 'not-an-export', before: raw, after: raw,
    versionsBefore: [previousVersion], versionsAfter: [previousVersion, 'not-an-export'], upload: { versionId: 'not-an-export' } });
  assert.doesNotMatch(JSON.stringify(evidence), /not-an-export|token|createdOn|errors/);
  assert.equal(evidence.reconciliationRequired, true);
});

test('manifest gate refuses failed operation evidence or stale CI attempts even with valid-looking IDs', () => {
  const sourceSha = 'a'.repeat(40); const treeSha = 'b'.repeat(40); const ciRunId = 42;
  const ci = { schemaVersion: 1, repository: 'PHamilton8/parkerhamilton-ca', sha: sourceSha, checkoutSha: sourceSha,
    checkoutTree: treeSha, workflowRunId: ciRunId, runAttempt: 2, conclusion: 'success',
    requiredJobs: ['quality', 'browser'].map((name) => ({ name, runId: ciRunId, runAttempt: 2,
      checkoutSha: sourceSha, checkoutTree: treeSha, cleanTrackedTree: true, conclusion: 'success' })) };
  const operation = reconcileUploadEvidence({ outcome: 'success', before: snapshot, after: snapshot,
    versionsBefore: [previousVersion], versionsAfter: [previousVersion, version], upload: { versionId: version } });
  const identity = { sourceSha, treeSha, versionId: version, ciRunId };
  assert.doesNotThrow(() => assertCompleteCandidateEvidence(ci, operation, identity));
  for (const changed of [{ ...operation, uploadOutcome: 'failure' }, { ...operation, reconciliationRequired: true },
    { ...operation, status: 'REVIEW_CANDIDATE_UNPUBLISHED' }, { ...operation, productionUnchanged: null }]) {
    assert.throws(() => assertCompleteCandidateEvidence(ci, changed, identity));
  }
  const stale = structuredClone(ci); stale.requiredJobs[1].runAttempt = 1;
  assert.throws(() => assertCompleteCandidateEvidence(stale, operation, identity));
  assert.throws(() => assertCompleteCandidateEvidence(ci, operation, { ...identity, treeSha: 'c'.repeat(40) }));
});

test('after-state collection executes both read-only requests after a failed partial upload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'after-state-'));
  fs.writeFileSync(path.join(dir, 'production-before.json'), JSON.stringify(snapshot));
  fs.writeFileSync(path.join(dir, 'versions-before.json'), JSON.stringify([previousVersion]));
  const names = ['CLOUDFLARE_ACCOUNT_ID', 'EXPECTED_CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32); process.env.EXPECTED_CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = 'invented-never-transmitted';
  const previous = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url)); assert.equal(options.redirect, 'manual'); assert.equal(options.method ?? 'GET', 'GET');
    return new Response(JSON.stringify({ success: true, result: String(url).endsWith('/versions') ?
      { items: [{ id: previousVersion }, { id: version }] } : [{ id: deployment, versions: [{ version_id: previousVersion, percentage: 100 }] }] }));
  };
  try {
    const evidence = await collectAfterState(dir, path.join(dir, 'missing-receipt.ndjson'), 'failure');
    assert.equal(calls.length, 2); assert.equal(evidence.reconciliationRequired, true);
    assert.deepEqual(evidence.newVersionIds, [version]);
    const retained = fs.readFileSync(path.join(dir, 'operation-evidence.json'), 'utf8');
    assert.doesNotMatch(retained, /invented-never-transmitted|authorization|api\.cloudflare/);
    assert.equal(JSON.parse(retained).status, 'NON_PROMOTABLE_OPERATION_EVIDENCE');
  } finally {
    globalThis.fetch = previous;
    for (const name of names) { if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name]; }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shell guard rejects preloads, proxy and API overrides before the next Node process without printing values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preload-'));
  const marker = path.join(dir, 'executed'); const preload = path.join(dir, 'preload.cjs');
  fs.writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');`);
  const base = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  const blocked = ['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_USE_SYSTEM_CA', 'NODE_USE_ENV_PROXY',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'OPENSSL_CONF', 'OPENSSL_MODULES', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'CLOUDFLARE_API_BASE_URL', 'CF_API_BASE_URL',
    'CLOUDFLARE_API_ENVIRONMENT', 'CLOUDFLARE_COMPLIANCE_REGION', 'WRANGLER_API_ENVIRONMENT', 'WRANGLER_API_BASE_URL',
    'BASH_ENV', 'ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH'];
  for (const name of blocked) delete base[name];
  try {
    const valid = spawnSync('bash', ['scripts/release-node.sh', '-p', 'process.version'], { env: base, encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr); assert.equal(valid.stdout.trim(), process.version);
    for (const name of blocked.filter((name) => !['BASH_ENV', 'ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH'].includes(name))) {
      const value = name === 'NODE_OPTIONS' ? `--require=${preload}` : 'invented-secret-override';
      const result = spawnSync('bash', ['scripts/release-node.sh', '-p', 'process.version'], { env: { ...base, [name]: value }, encoding: 'utf8' });
      assert.notEqual(result.status, 0, name); assert.equal(result.stdout, '');
      assert.match(result.stderr, new RegExp(name)); assert.ok(!result.stderr.includes(value));
    }
    assert.equal(fs.existsSync(marker), false, 'Guard must run before the following Node preload');
    const empty = spawnSync('bash', ['scripts/release-node.sh', '-p', 'process.version'], { env: { ...base, HTTP_PROXY: '' }, encoding: 'utf8' });
    assert.notEqual(empty.status, 0, 'Even an empty override is an unreviewed presence');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('failed workflow evidence is always preserved under a name the candidate resolver cannot promote', () => {
  const workflow = fs.readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8');
  assert.match(workflow, /Always collect sanitized provider after-state[\s\S]*?always\(\)/);
  assert.match(workflow, /name: failed-review-candidate-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /Preserve candidate evidence\n\s+if: success\(\)/);
  assert.match(workflow, /ci-rechecked\.json/);
  assert.doesNotMatch(workflow, /path:.*wrangler-upload\.log/);
});

test('Worker, environment, alias and log overrides fail before even a synthetic Wrangler dispatch', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-wrangler-guard-'));
  const marker = path.join(dir, 'dispatched');
  fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });
  const fake = path.join(dir, 'node_modules', '.bin', 'wrangler');
  fs.writeFileSync(fake, '#!/bin/sh\n: > "$SYNTHETIC_DISPATCH_MARKER"\n', { mode: 0o755 });
  const guard = path.resolve('scripts/release-node.sh');
  const names = ['WRANGLER_CI_OVERRIDE_NAME', 'CLOUDFLARE_ENV', 'WRANGLER_CI_GENERATE_PREVIEW_ALIAS',
    'WRANGLER_CI_MATCH_TAG', 'WRANGLER_LOG_PATH', 'WRANGLER_LOG_SANITIZE', 'WRANGLER_LOG'];
  const values = ['foreign-worker', 'foreign-environment', 'true', 'foreign-tag', '.release-candidate/raw-provider.json', 'false', 'debug'];
  const base = { ...process.env, WRANGLER_SEND_METRICS: 'false', SYNTHETIC_DISPATCH_MARKER: marker };
  for (const name of names) delete base[name];
  const dispatch = (env) => spawnSync('bash', [guard, '--wrangler', 'versions', 'upload'], { cwd: dir, env, encoding: 'utf8' });
  try {
    const positive = dispatch(base);
    assert.equal(positive.status, 0, positive.stderr);
    assert.equal(fs.existsSync(marker), true, 'Positive control must reach only the fake Wrangler');
    fs.unlinkSync(marker);
    for (const [index, name] of names.entries()) await t.test(name, () => {
      for (const value of [values[index], '']) {
        const result = dispatch({ ...base, [name]: value });
        assert.notEqual(result.status, 0, name);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, new RegExp(name));
        if (value) assert.equal(result.stderr.includes(value), false, 'Only the variable name may be logged');
        assert.equal(fs.existsSync(marker), false, 'Override must be rejected before dispatch');
      }
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function workflowStep(workflow, name) {
  const start = workflow.indexOf('      - name: ' + name + '\n');
  assert.notEqual(start, -1, name);
  const next = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

test('candidate and production artifacts allow named evidence files and exclude raw logs and unknown files', () => {
  for (const [filename, prefix, names, allowedFiles] of [
    ['cloudflare-preview.yml', '.release-candidate/', ['Preserve candidate evidence', 'Preserve non-promotable failure evidence'],
      ['ci.json', 'ci-rechecked.json', 'dist.json', 'environment-policy.json', 'production-before.json', 'versions-before.json',
        'upload-attempt.json', 'upload.json', 'preview-smoke.json', 'operation-evidence.json', 'production-after.json', 'production-unchanged.json', 'candidate.json']],
    ['cloudflare-production-release.yml', '.release-production/', ['Preserve failed-release evidence', 'Preserve successful release evidence'],
      ['artifact.json', 'candidate.json', 'ci-current.json', 'version-exists.json', 'production-before.json', 'previous.json', 'promotion.json',
        'production-after.json', 'after-state-unavailable.json', 'active-version.json', 'live-smoke.json', 'rollback.json', 'rollback-after.json',
        'rollback-verified.json', 'rollback-smoke.json', 'production-release-record.json', 'release-notes.md', 'release-tag.txt']],
  ]) {
    const workflow = fs.readFileSync('.github/workflows/' + filename, 'utf8');
    for (const name of names) {
      const block = workflowStep(workflow, name);
      assert.match(block, /          path: \|\n/);
      const paths = [...block.matchAll(/^            (\S+)$/gm)].map((match) => match[1]);
      assert.deepEqual(paths, allowedFiles.map((file) => prefix + file), name);
      assert.equal(new Set(paths).size, paths.length);
      assert.ok(paths.every((entry) => entry.startsWith(prefix) && !/[\*?\[\]]/.test(entry) && !entry.endsWith('/')));
      assert.ok(paths.every((entry) => /\.(?:json|md|txt)$/.test(entry)));
      assert.ok(paths.includes(prefix + 'candidate.json'));
      for (const raw of ['wrangler.log', 'wrangler-upload.log', 'raw-provider.json', 'nested/token.json']) {
        assert.equal(paths.includes(prefix + raw), false, raw + ' must not enter artifacts');
      }
    }
  }
});

test('promotion refreshes current CI after its provider reads and immediately before activation', () => {
  const workflow = fs.readFileSync('.github/workflows/cloudflare-production-release.yml', 'utf8');
  const fresh = workflowStep(workflow, 'Revalidate latest exact candidate CI immediately before promotion');
  assert.match(fresh, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(fresh, /verify-promotion-ci \.release-production\/candidate\.json > \.release-production\/ci-current\.json/);
  const index = workflow.indexOf(fresh);
  assert.ok(index > workflow.indexOf('Snapshot exact current production rollback identity'));
  assert.match(workflow.slice(index + fresh.length), /^\n      - name: Promote the exact reviewed version at 100 percent\n/);
  const helper = fs.readFileSync('scripts/postlaunch-release.mjs', 'utf8');
  assert.match(helper, /mainSha: git\('rev-parse', 'HEAD'\), mainTree: git\('rev-parse', 'HEAD\^\{tree\}'\)/);
  assert.match(helper, /candidateTree: git\('rev-parse', `\$\{manifest\.sourceSha\}\^\{tree\}`\)/);
});

test('smoke outcome failure retains evidence even when continue-on-error and rollback conclusions succeed', () => {
  const workflow = fs.readFileSync('.github/workflows/cloudflare-production-release.yml', 'utf8');
  assert.match(workflowStep(workflow, 'Focused live production smoke'), /continue-on-error: true/);
  const evidence = workflowStep(workflow, 'Preserve failed-release evidence');
  const expression = evidence.match(/if: \$\{\{ (.+) \}\}/)?.[1];
  assert.equal(expression, "always() && (!success() || steps.smoke.outcome == 'failure')");
  // GitHub success() uses conclusions; continue-on-error changes conclusion, not outcome.
  const evaluate = new Function('always', 'success', 'steps', 'return ' + expression);
  for (const scenario of [
    { name: 'smoke fails, rollback succeeds', outcome: 'failure', conclusions: ['success', 'success', 'success'], retain: true },
    { name: 'smoke fails, rollback fails', outcome: 'failure', conclusions: ['success', 'success', 'failure'], retain: true },
    { name: 'earlier step fails, smoke skipped', outcome: 'skipped', conclusions: ['failure', 'skipped'], retain: true },
    { name: 'successful release', outcome: 'success', conclusions: ['success', 'success'], retain: false },
  ]) assert.equal(evaluate(() => true, () => scenario.conclusions.every((x) => x === 'success' || x === 'skipped'),
    { smoke: { outcome: scenario.outcome } }), scenario.retain, scenario.name);
  assert.ok(workflow.indexOf(evidence) < workflow.indexOf('      - name: Fail after verified rollback'));
});
