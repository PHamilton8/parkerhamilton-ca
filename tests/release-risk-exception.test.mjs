import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluateKnownRisk, sourceFingerprint, collectContext, cleanAuditEnv, runAudit, assertStableAuditInputs, assertCurrentApproval, assertArtifactIdentity, assertApprovalDeadline, verifyWithinApproval, AUDIT_ARGS } from '../scripts/release-risk-audit.mjs';

import { verifyPromotionCi, promoteCandidateVersion, activateVersion } from '../scripts/postlaunch-release.mjs';

const approved = JSON.parse(fs.readFileSync(new URL('../release-risk-exception.json', import.meta.url), 'utf8'));
function fixture() {
  const policy = structuredClone(approved);
  policy.binding.inputsSha256 = '1'.repeat(64);
  const sourceCommit = 'a'.repeat(40);
  const context = { releaseId: policy.releaseId, repository: policy.subject.repository, sourceCommit, sourceTree: 'b'.repeat(40),
    expectedSourceSha: sourceCommit, inputsSha256: policy.binding.inputsSha256, baseIsAncestor: true, baseTree: policy.subject.reviewedBaseTree,
    changedFromReviewedBase: [...policy.subject.allowedExceptionPaths], packageHashes: structuredClone(policy.subject.packageHashes),
    toolchain: structuredClone(policy.subject.toolchain), artifact: structuredClone(policy.subject.artifact),
    reviewedPath: 'standard-worker-version-upload', endpointOrigins: { registry: 'https://registry.npmjs.org', provider: 'https://api.cloudflare.com' },
    manualAdvisoryIds: [...policy.manualResiduals.advisoryIds] };
  return { policy, context, auditText: JSON.stringify(policy.expectedAudit.report, null, 2) + '\n', auditExitCode: 1,
    now: Date.parse('2026-10-22T05:00:00Z') };
}

test('only exact approved failing audit produces ACCEPTED_KNOWN_RISK and retains manual residuals', () => {
  const result = evaluateKnownRisk(fixture());
  assert.equal(result.status, 'ACCEPTED_KNOWN_RISK');
  assert.equal(result.npmAuditExitCode, 1);
  assert.equal(result.npmAuditPassed, false);
  assert.equal(result.vulnerablePackagesPatched, false);
  assert.equal(result.qualificationForCredentialedUpload, false);
  assert.equal(result.liveDeploymentAuthorized, false);
  assert.deepEqual(result.manualResiduals.advisoryIds, ['GHSA-qrxm-fqhp-jwvm', 'GHSA-xjj6-f33q-929c']);
  assert.equal(result.manualResiduals.notPatched, true);
});

test('source, dependencies and full artifact inputs are rechecked after audit execution', () => {
  const before = { context: fixture().context, fullArtifact: { files: ['synthetic-approved-path'] } };
  assert.doesNotThrow(() => assertStableAuditInputs(before, structuredClone(before)));
  for (const mutate of [
    (x) => { x.context.inputsSha256 = '2'.repeat(64); },
    (x) => { x.context.packageHashes['package-lock.json'] = '2'.repeat(64); },
    (x) => { x.context.artifact.fileCount = 93; },
    (x) => { x.fullArtifact.files.push('unapproved-extra'); },
  ]) { const after = structuredClone(before); mutate(after); assert.throws(() => assertStableAuditInputs(before, after), /INPUT_CHANGED_DURING_AUDIT/); }
});

test('final upload guard rejects changed artifact identity before error handling or Wrangler dispatch', () => {
  const x = fixture(); assert.doesNotThrow(() => assertArtifactIdentity(x.context.artifact, x.policy.subject.artifact));
  assert.throws(() => assertArtifactIdentity({ ...x.context.artifact, fileCount: 93 }, x.policy.subject.artifact), /ARTIFACT_CHANGED/);
  assert.throws(() => assertArtifactIdentity({ ...x.context.artifact, sha256: '2'.repeat(64) }, x.policy.subject.artifact), /ARTIFACT_CHANGED/);
  const workflow = fs.readFileSync(new URL('../.github/workflows/cloudflare-preview.yml', import.meta.url), 'utf8');
  const upload = workflow.slice(workflow.indexOf('      - name: Upload exactly one unpublished Worker Version'));
  const check = upload.indexOf('assert-risk-artifact dist > /dev/null');
  assert.ok(check >= 0 && check < upload.indexOf('set +e') && check < upload.indexOf('--wrangler versions upload'));
});

test('legacy exception stays expired while current pipeline selects distinct clean qualification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-expiry-'));
  try {
    const { policy } = fixture(); fs.writeFileSync(path.join(dir, 'release-risk-exception.json'), JSON.stringify(policy));
    assert.throws(() => assertCurrentApproval(dir, Date.parse(policy.approval.expiresAtUtc)), /APPROVAL_EXPIRED_OR_NOT_YET_VALID/);
    const helper = fs.readFileSync(new URL('../scripts/postlaunch-release.mjs', import.meta.url), 'utf8');
    assert.match(helper, /export async function verifyCi\(sha\) \{\n  assertCleanSource\(process.cwd\(\)\);/);
    assert.match(helper, /export async function verifyPromotionCi/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('preview hashing that crosses expiry rejects before uploader dispatch', () => {
  const approval = approved.approval;
  const deadline = Date.parse(approval.expiresAtUtc);
  let now = deadline - 1;
  let verified = 0; let dispatches = 0;
  assert.throws(() => {
    verifyWithinApproval(approval, () => { verified++; now = deadline; return 'hashed'; }, () => now);
    dispatches++;
  }, /APPROVAL_EXPIRED_OR_NOT_YET_VALID/);
  assert.equal(verified, 1); assert.equal(dispatches, 0);
  now = deadline - 1;
  assert.equal(verifyWithinApproval(approval, () => 'hashed', () => now), 'hashed');
  const source = fs.readFileSync(new URL('../scripts/release-risk-audit.mjs', import.meta.url), 'utf8');
  const guard = source.slice(source.indexOf('export function assertApprovedArtifact'), source.indexOf('export function cleanAuditEnv'));
  assert.match(guard, /return verifyWithinApproval\(approval, \(\) => \{/);
  assert.ok(guard.indexOf('dist-hash') > guard.indexOf('verifyWithinApproval'));
  assert.ok(guard.indexOf('return full') > guard.indexOf('assertArtifactIdentity'));
});

test('promotion CI/provenance verification crossing expiry rejects before mutation dispatch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-async-expiry-'));
  const cwd = process.cwd(); const oldRepository = process.env.GITHUB_REPOSITORY;
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q'); fs.writeFileSync(path.join(dir, 'fixture'), 'synthetic'); git('add', 'fixture');
    git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'fixture');
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({ sourceSha: git('rev-parse', 'HEAD') }));
    process.chdir(dir); process.env.GITHUB_REPOSITORY = 'PHamilton8/parkerhamilton-ca';
    const deadline = Date.parse(approved.approval.expiresAtUtc); let now = deadline - 1;
    let checks = 0; let verified = 0; let dispatches = 0;
    await assert.rejects(async () => {
      await verifyPromotionCi('candidate.json', {
        checkApproval: () => { checks++; assertApprovalDeadline(approved.approval, now); },
        refresh: async () => { await Promise.resolve(); verified++; now = deadline + 1; return { status: 'synthetic-success' }; },
      });
      dispatches++;
    }, /APPROVAL_EXPIRED_OR_NOT_YET_VALID/);
    assert.equal(checks, 2); assert.equal(verified, 1); assert.equal(dispatches, 0);
  } finally {
    process.chdir(cwd);
    if (oldRepository === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = oldRepository;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('candidate activation rechecks time at fetch dispatch; recovery remains independent', async (t) => {
  const keys = ['CLOUDFLARE_ACCOUNT_ID', 'EXPECTED_CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const versionId = '11111111-1111-4111-8111-111111111111';
  const deploymentId = '22222222-2222-4222-8222-222222222222';
  const deadline = Date.parse(approved.approval.expiresAtUtc); let now = deadline - 1; let calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ success: true, result: { id: deploymentId, versions: [{ version_id: versionId, percentage: 100 }] } }), { status: 200 });
  });
  process.env.CLOUDFLARE_ACCOUNT_ID = process.env.EXPECTED_CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = 'synthetic-test-only';
  try {
    await assert.rejects(promoteCandidateVersion(versionId, 'synthetic expiry crossing', () => {
      assertApprovalDeadline(approved.approval, now); now = deadline + 1; return approved.approval;
    }), /APPROVAL_EXPIRED_OR_NOT_YET_VALID/);
    assert.equal(calls, 0, 'expired candidate must never invoke even the mocked provider');
    now = deadline - 1;
    await promoteCandidateVersion(versionId, 'synthetic valid control', () => approved.approval);
    assert.equal(calls, 1, 'valid candidate reaches mock dispatch');
    now = deadline + 1;
    await activateVersion(versionId, 'synthetic recovery control');
    assert.equal(calls, 2, 'emergency recovery does not depend on candidate exception lifetime');
  } finally {
    for (const key of keys) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
  const production = fs.readFileSync(new URL('../.github/workflows/cloudflare-production-release.yml', import.meta.url), 'utf8');
  const rollback = fs.readFileSync(new URL('../.github/workflows/cloudflare-rollback-production.yml', import.meta.url), 'utf8');
  assert.match(production, /postlaunch-release\.mjs promote-version "\$VERSION_ID"/);
  assert.match(production, /postlaunch-release\.mjs activate-version "\$PREVIOUS_VERSION_ID"/);
  assert.match(rollback, /postlaunch-release\.mjs activate-version/);
});

for (const [name, mutate] of [
  ['missing report', (x) => { x.auditText = undefined; }],
  ['empty report', (x) => { x.auditText = ''; }],
  ['truncated report', (x) => { x.auditText = x.auditText.slice(0, -30); }],
  ['registry error JSON', (x) => { x.auditText = JSON.stringify({ error: { code: 'ETIMEDOUT' } }); }],
  ['duplicate JSON key', (x) => { x.auditText = x.auditText.replace('"auditReportVersion": 2,', '"auditReportVersion": 2, "auditReportVersion": 2,'); }],
  ['unexpected report format', (x) => { x.auditText = x.auditText.trim(); }],
  ['zero original exit', (x) => { x.auditExitCode = 0; }],
  ['other original exit', (x) => { x.auditExitCode = 2; }],
  ['killed or unknown audit status', (x) => { x.auditExitCode = null; }],
  ['coerced exit string', (x) => { x.auditExitCode = '1'; }],
  ['later release ID', (x) => { x.context.releaseId += '-later'; }],
  ['foreign repository', (x) => { x.context.repository = 'other/repository'; }],
  ['different requested checkout', (x) => { x.context.expectedSourceSha = 'c'.repeat(40); }],
  ['malformed checkout', (x) => { x.context.sourceCommit = 'main'; }],
  ['malformed source tree', (x) => { x.context.sourceTree = 'main'; }],
  ['unrelated history', (x) => { x.context.baseIsAncestor = false; }],
  ['changed reviewed base', (x) => { x.context.baseTree = 'c'.repeat(40); }],
  ['changed tracked source input', (x) => { x.context.inputsSha256 = '2'.repeat(64); }],
  ['new page or feature path', (x) => { x.context.changedFromReviewedBase.push('src/pages/new-feature.astro'); }],
  ['changed package manifest', (x) => { x.context.packageHashes['package.json'] = '2'.repeat(64); }],
  ['changed lock', (x) => { x.context.packageHashes['package-lock.json'] = '2'.repeat(64); }],
  ['changed Node runtime', (x) => { x.context.toolchain.node = 'v24.19.0'; }],
  ['changed built-in fetch', (x) => { x.context.toolchain.nodeUndici = '7.29.1'; }],
  ['changed TLS runtime', (x) => { x.context.toolchain.openssl = 'other'; }],
  ['changed npm', (x) => { x.context.toolchain.npm = '12.2.1'; }],
  ['changed npm CLI bytes', (x) => { x.context.toolchain.npmCliSha256 = '2'.repeat(64); }],
  ['changed Wrangler CLI bytes', (x) => { x.context.toolchain.wranglerCliSha256 = '2'.repeat(64); }],
  ['changed installed dependency version', (x) => { x.context.toolchain.installedPackages['http-cache-semantics'].version = '4.3.0'; }],
  ['changed installed package identity', (x) => { x.context.toolchain.installedPackages.miniflare.sha256 = '2'.repeat(64); }],
  ['missing installed package proof', (x) => { delete x.context.toolchain.installedPackages.undici; }],
  ['extra artifact paths', (x) => { x.context.artifact.fileCount = 93; }],
  ['changed artifact hash', (x) => { x.context.artifact.sha256 = '2'.repeat(64); }],
  ['changed inventory algorithm', (x) => { x.context.artifact.algorithm = 'other'; }],
  ['new HTTP feature path', (x) => { x.context.reviewedPath = 'custom-uploader'; }],
  ['foreign registry', (x) => { x.context.endpointOrigins.registry = 'https://foreign.invalid'; }],
  ['foreign provider API', (x) => { x.context.endpointOrigins.provider = 'https://foreign.invalid'; }],
  ['new manual advisory', (x) => { x.context.manualAdvisoryIds.push('GHSA-newx-newx-newx'); }],
  ['missing manual residual', (x) => { x.context.manualAdvisoryIds.pop(); }],
  ['unknown condition', (x) => { x.context.newlyDisclosedAdvisory = 'GHSA-newx-newx-newx'; }],
  ['expired approval', (x) => { x.now = Date.parse(x.policy.approval.expiresAtUtc); }],
  ['before approval', (x) => { x.now = Date.parse(x.policy.approval.approvedAtUtc) - 1; }],
  ['invalid clock', (x) => { x.now = NaN; }],
  ['altered approval evidence digest', (x) => { x.policy.approval.privateEvidenceSha256 = '2'.repeat(64); }],
  ['extended approval', (x) => { x.policy.approval.expiresAtUtc = '2030-01-01T00:00:00Z'; }],
  ['broadened advisory approval', (x) => { x.policy.manualResiduals.advisoryIds.push('GHSA-newx-newx-newx'); }],
  ['different self-exclusion', (x) => { x.policy.binding.excludedSelfDescribingPath = 'scripts/release-risk-audit.mjs'; }],
  ['unbound proposal', (x) => { x.policy.binding.inputsSha256 = '0'.repeat(64); }],
]) test('rejects ' + name, () => { const value = fixture(); mutate(value); assert.throws(() => evaluateKnownRisk(value), /RISK_EXCEPTION_/); });

for (const [name, mutate] of [
  ['extra low advisory', (r) => { r.vulnerabilities.other = { name: 'other', severity: 'low' }; r.metadata.vulnerabilities.low = 1; r.metadata.vulnerabilities.total++; }],
  ['changed severity', (r) => { r.vulnerabilities['http-cache-semantics'].severity = 'critical'; }],
  ['different advisory', (r) => { r.vulnerabilities['http-cache-semantics'].via[0].url = 'https://github.com/advisories/GHSA-newx-newx-newx'; }],
  ['different affected path', (r) => { r.vulnerabilities['http-cache-semantics'].nodes.push('node_modules/other'); }],
  ['missing finding', (r) => { r.vulnerabilities = {}; }],
  ['inconsistent counts', (r) => { r.metadata.vulnerabilities.total = 0; }],
  ['missing dependency context', (r) => { delete r.metadata.dependencies; }],
  ['different version range', (r) => { r.vulnerabilities['http-cache-semantics'].range = '*'; }],
]) test('rejects report with ' + name, () => {
  const x = fixture(); const report = JSON.parse(x.auditText); mutate(report); x.auditText = JSON.stringify(report, null, 2) + '\n';
  assert.throws(() => evaluateKnownRisk(x), /RISK_EXCEPTION_AUDIT_CHANGED_OR_INCOMPLETE/);
});

test('source fingerprint covers tracked content, paths and modes while excluding only the self-description', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-fingerprint-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'synthetic'); };
  try {
    git('init', '--quiet'); fs.writeFileSync(path.join(dir, 'source.js'), 'first\n'); fs.writeFileSync(path.join(dir, 'release-risk-exception.json'), '{}\n'); commit();
    const first = sourceFingerprint(dir);
    fs.writeFileSync(path.join(dir, 'release-risk-exception.json'), '{"selfDescription":true}\n'); commit();
    assert.equal(sourceFingerprint(dir), first, 'Full final Git commit/tree and policy hash are sealed externally after commit');
    fs.writeFileSync(path.join(dir, 'source.js'), 'changed\n'); commit(); assert.notEqual(sourceFingerprint(dir), first);
    const second = sourceFingerprint(dir); git('mv', 'source.js', 'renamed.js'); commit(); assert.notEqual(sourceFingerprint(dir), second);
    const third = sourceFingerprint(dir); fs.chmodSync(path.join(dir, 'renamed.js'), 0o755); commit(); assert.notEqual(sourceFingerprint(dir), third);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('npm configuration and credential overrides are excluded from the audit child', () => {
  const names = ['npm_config_registry', 'NPM_CONFIG_PROXY', 'CLOUDFLARE_API_TOKEN', 'CF_ACCESS_CLIENT_SECRET', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK'];
  const previous = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    for (const name of names) process.env[name] = 'invented-never-transmitted';
    const env = cleanAuditEnv(); for (const name of names) assert.equal(env[name], undefined);
    assert.equal(env.WRANGLER_SEND_METRICS, 'false');
  } finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
});

test('unreviewed project npm config is rejected without opening it or executing npm', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-npm-config-'));
  try { fs.writeFileSync(path.join(dir, '.npmrc'), 'synthetic-config'); assert.throws(() => collectContext(dir, dir, fixture().policy, [], {}), /UNREVIEWED_NPM_CONFIG/); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('existing evidence is never overwritten or replayed as a fresh audit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-evidence-'));
  try {
    fs.mkdirSync(path.join(dir, '.release-audit')); const file = path.join(dir, '.release-audit', 'audit.json'); fs.writeFileSync(file, 'preserved');
    assert.throws(() => runAudit(dir, dir), /EVIDENCE_ALREADY_EXISTS/); assert.equal(fs.readFileSync(file, 'utf8'), 'preserved');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('workflow retains the full original severity gate, complete graph, distinct decision and always-saved named evidence', () => {
  assert.deepEqual(AUDIT_ARGS.slice(0, 6), ['audit', '--audit-level=high', '--json', '--include=dev', '--include=optional', '--include=peer']);
  assert.ok(AUDIT_ARGS.includes('--registry=https://registry.npmjs.org') && AUDIT_ARGS.includes('--strict-ssl=true'));
  const workflow = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: bash scripts\/release-node.sh scripts\/clean-release-risk.mjs run dist/);
  assert.match(workflow, /Preserve complete audit and distinct risk decision\n        if: always\(\)/);
  for (const name of ['audit.json', 'audit.stderr.log', 'audit-run.json', 'risk-evaluation.json', 'clean-policy.json', 'context.json', 'artifact.json']) {
    assert.ok(workflow.includes('            .release-audit/' + name + '\n'));
  }
  assert.doesNotMatch(workflow, /continue-on-error|--omit|--audit=false|--audit-level=critical|path: \.release-audit\//);
  assert.ok(workflow.indexOf('Complete npm audit') < workflow.indexOf('Record successful source provenance'));
  assert.equal(approved.approval.privateEvidenceSha256, 'd7748f01584088be7318a8e2a3b9202a4e6b38ead5ceeaadd642f28420807b77');
});
