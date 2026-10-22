import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const POLICY_PATH = 'release-risk-exception.json';
// The approval constraints contain no source/self hash. Only binding is excluded.
const APPROVAL_SHA256 = '9972941f14024e138fa108251a14a56d36d14dc92c5f66f5c40d7c87cbeeaa2f';
export const AUDIT_ARGS = ['audit', '--audit-level=high', '--json', '--include=dev', '--include=optional', '--include=peer',
  '--registry=https://registry.npmjs.org', '--strict-ssl=true', '--fetch-timeout=300000', '--fetch-retries=0'];
const SHA = /^[a-f0-9]{40}$/;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const requireThat = (ok, code) => { if (!ok) throw new Error('RISK_EXCEPTION_' + code); };
export function assertApprovalDeadline(approval, now = Date.now()) {
  requireThat(Number.isFinite(now) && now >= Date.parse(approval.approvedAtUtc)
    && now < Date.parse(approval.expiresAtUtc), 'APPROVAL_EXPIRED_OR_NOT_YET_VALID');
}
function approvalWindow(policy, now) { assertApprovalDeadline(policy.approval, now); }

/** Synchronous final preview verification must not outlive its approval. */
export function verifyWithinApproval(approval, verify, now = Date.now) {
  assertApprovalDeadline(approval, now());
  const result = verify();
  requireThat(!(result && typeof result.then === 'function'), 'ASYNC_VERIFICATION_NOT_ALLOWED');
  assertApprovalDeadline(approval, now());
  return result;
}

export function validatePolicy(policy) {
  requireThat(policy && typeof policy === 'object' && !Array.isArray(policy), 'POLICY_INVALID');
  const { binding, ...constraints } = policy;
  requireThat(sha(JSON.stringify(canonical(constraints))) === APPROVAL_SHA256, 'APPROVAL_CHANGED');
  requireThat(equal(Object.keys(binding ?? {}).sort(), ['algorithm', 'excludedSelfDescribingPath', 'inputsSha256']), 'BINDING_INVALID');
  requireThat(binding.algorithm === 'sha256-git-inputs-v1' && binding.excludedSelfDescribingPath === POLICY_PATH
    && /^[a-f0-9]{64}$/.test(binding.inputsSha256) && binding.inputsSha256 !== '0'.repeat(64), 'BINDING_INVALID');
}

export function sourceFingerprint(root, tree = 'HEAD') {
  const bytes = execFileSync('git', ['ls-tree', '-rz', tree], { cwd: root });
  const rows = bytes.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const [header, name, ...extra] = line.split('\t');
    requireThat(extra.length === 0 && name && !/[\n\r]/.test(name), 'SOURCE_PATH_INVALID');
    const [mode, kind, blob] = header.split(' ');
    requireThat(kind === 'blob' && SHA.test(blob) && /^(100644|100755|120000)$/.test(mode), 'SOURCE_OBJECT_INVALID');
    return { mode, kind, blob, name };
  }).filter((row) => row.name !== POLICY_PATH).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return sha(rows.map((r) => `${r.mode} ${r.kind} ${r.blob}\t${r.name}\n`).join(''));
}

/** This evaluates the exact approved failing report, never a clean-audit claim. */
export function evaluateKnownRisk({ policy, auditText, auditExitCode, context, now = Date.now() }) {
  validatePolicy(policy);
  approvalWindow(policy, now);
  requireThat(typeof auditText === 'string' && auditExitCode === policy.expectedAudit.exitCode, 'AUDIT_NOT_COMPLETE_EXPECTED_FAILURE');
  // Exact bytes also reject malformed/truncated/duplicate-key/error responses and new findings.
  requireThat(sha(auditText) === policy.expectedAudit.reportSha256, 'AUDIT_CHANGED_OR_INCOMPLETE');
  let report; try { report = JSON.parse(auditText); } catch { throw new Error('RISK_EXCEPTION_AUDIT_INVALID'); }
  requireThat(equal(report, policy.expectedAudit.report), 'AUDIT_CHANGED_OR_INCOMPLETE');
  requireThat(context && equal(Object.keys(context).sort(), ['artifact', 'baseIsAncestor', 'baseTree', 'changedFromReviewedBase',
    'endpointOrigins', 'expectedSourceSha', 'inputsSha256', 'manualAdvisoryIds', 'packageHashes', 'releaseId',
    'repository', 'reviewedPath', 'sourceCommit', 'sourceTree', 'toolchain'].sort()), 'CONTEXT_INVALID');
  requireThat(context.releaseId === policy.releaseId && context.repository === policy.subject.repository, 'RELEASE_IDENTITY_CHANGED');
  requireThat(SHA.test(context.sourceCommit) && SHA.test(context.sourceTree)
    && context.expectedSourceSha === context.sourceCommit, 'SOURCE_IDENTITY_CHANGED');
  requireThat(context.baseIsAncestor === true && context.baseTree === policy.subject.reviewedBaseTree, 'REVIEWED_BASE_CHANGED');
  requireThat(equal(context.changedFromReviewedBase, policy.subject.allowedExceptionPaths), 'SOURCE_SCOPE_CHANGED');
  requireThat(context.inputsSha256 === policy.binding.inputsSha256, 'SOURCE_INPUTS_CHANGED');
  requireThat(equal(context.packageHashes, policy.subject.packageHashes), 'DEPENDENCIES_CHANGED');
  requireThat(equal(context.toolchain, policy.subject.toolchain), 'TOOLCHAIN_CHANGED');
  assertArtifactIdentity(context.artifact, policy.subject.artifact);
  requireThat(context.reviewedPath === 'standard-worker-version-upload'
    && equal(context.endpointOrigins, { registry: policy.conditions.registryOrigin, provider: policy.conditions.providerApiOrigin }), 'PATH_OR_ENDPOINT_CHANGED');
  requireThat(equal(context.manualAdvisoryIds, policy.manualResiduals.advisoryIds), 'MANUAL_ADVISORIES_CHANGED');
  return { schemaVersion: 1, status: 'ACCEPTED_KNOWN_RISK', releaseId: policy.releaseId,
    npmAuditExitCode: auditExitCode, npmAuditPassed: false, vulnerablePackagesPatched: false,
    auditSha256: sha(auditText), highFindings: 1, acceptedAdvisory: 'GHSA-ch52-4w7c-c8xp',
    manualResiduals: policy.manualResiduals, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree,
    sourceInputsSha256: context.inputsSha256, packageHashes: context.packageHashes, artifact: context.artifact,
    policySha256: sha(JSON.stringify(canonical(policy))), approvedAtUtc: policy.approval.approvedAtUtc,
    expiresAtUtc: policy.approval.expiresAtUtc, evaluatedAtUtc: new Date(now).toISOString(),
    qualificationForCredentialedUpload: false, liveDeploymentAuthorized: false,
    limitation: 'Known-risk evaluation only. New upstream disclosures require re-review; unreported advisories are not discovered here. Existing CI, destination, privacy, provider and owner approval controls remain.' };
}

export function assertStableAuditInputs(before, after) {
  requireThat(equal(before, after), 'INPUT_CHANGED_DURING_AUDIT');
}

export function assertArtifactIdentity(actual, expected) {
  requireThat(equal(actual, expected), 'ARTIFACT_CHANGED');
}

function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

/** Recheck approval lifetime/source before preview or promotion CI queries. No new audit claim. */
export function assertCurrentApproval(root, now = Date.now) {
  const clock = typeof now === 'function' ? now : () => now;
  const policy = JSON.parse(fs.readFileSync(path.join(root, POLICY_PATH), 'utf8'));
  validatePolicy(policy); approvalWindow(policy, clock());
  git(root, 'diff', '--quiet', 'HEAD', '--');
  const untracked = git(root, 'status', '--porcelain=v1', '--untracked-files=normal').split('\n').filter(Boolean);
  // These are the existing workflows' downloaded/generated metadata, never source inputs.
  requireThat(untracked.every((line) => /^\?\? \.(?:release-candidate|release-production|reviewed-candidate)\/$/.test(line)), 'SOURCE_WORKTREE_DIRTY');
  requireThat(sourceFingerprint(root) === policy.binding.inputsSha256, 'SOURCE_INPUTS_CHANGED');
  requireThat(equal(git(root, 'diff', '--name-only', policy.subject.reviewedBaseCommit, 'HEAD').split('\n').filter(Boolean).sort(),
    policy.subject.allowedExceptionPaths), 'SOURCE_SCOPE_CHANGED');
  requireThat(equal(Object.fromEntries(Object.keys(policy.subject.packageHashes).map((name) => [name, sha(fs.readFileSync(path.join(root, name)))])),
    policy.subject.packageHashes), 'DEPENDENCIES_CHANGED');
  requireThat(process.version === policy.subject.toolchain.node && process.versions.undici === policy.subject.toolchain.nodeUndici
    && process.versions.openssl === policy.subject.toolchain.openssl, 'TOOLCHAIN_CHANGED');
  approvalWindow(policy, clock());
  return { status: 'APPROVAL_CURRENT', releaseId: policy.releaseId, approvedAtUtc: policy.approval.approvedAtUtc, expiresAtUtc: policy.approval.expiresAtUtc,
    expectedArtifact: policy.subject.artifact, expectedToolchain: policy.subject.toolchain };
}

function installedPackages(root, names) {
  return Object.fromEntries(names.map((name) => {
    const bytes = fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'));
    return [name, { version: JSON.parse(bytes).version, sha256: sha(bytes) }];
  }));
}

/** Read-only final-dispatch check. Never starts Wrangler or makes a provider request. */
export function assertApprovedArtifact(root, directory) {
  const approval = assertCurrentApproval(root); const expected = approval.expectedToolchain;
  return verifyWithinApproval(approval, () => {
    const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
    requireThat(sha(fs.readFileSync(npmCli)) === expected.npmCliSha256
      && JSON.parse(fs.readFileSync(path.join(path.dirname(npmCli), '..', 'package.json'), 'utf8')).version === expected.npm, 'TOOLCHAIN_CHANGED');
    requireThat(sha(fs.readFileSync(path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js'))) === expected.wranglerCliSha256
      && equal(installedPackages(root, Object.keys(expected.installedPackages)), expected.installedPackages), 'TOOLCHAIN_CHANGED');
    const full = JSON.parse(execFileSync(process.execPath, ['scripts/postlaunch-release.mjs', 'dist-hash', directory],
      { cwd: root, env: cleanAuditEnv(), encoding: 'utf8', maxBuffer: 1024 * 1024 }));
    const { algorithm, fileCount, sha256 } = full;
    assertArtifactIdentity({ algorithm, fileCount, sha256 }, approval.expectedArtifact);
    return full;
  });
}

export function cleanAuditEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)
    && !/TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|API_KEY|ACCESS_KEY/i.test(key)
    && !/^(CF_|CLOUDFLARE_|EXPECTED_CLOUDFLARE_)/.test(key)));
  return { ...env, ASTRO_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false' };
}

export function collectContext(root, artifactDirectory, policy, configArgs, env) {
  requireThat(!fs.existsSync(path.join(root, '.npmrc')), 'UNREVIEWED_NPM_CONFIG');
  git(root, 'diff', '--quiet', 'HEAD', '--');
  requireThat(!git(root, 'status', '--porcelain=v1', '--untracked-files=normal'), 'SOURCE_WORKTREE_DIRTY');
  const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  const npmCliSha256 = sha(fs.readFileSync(npmCli));
  requireThat(npmCliSha256 === policy.subject.toolchain.npmCliSha256, 'NPM_CLI_CHANGED');
  const npm = execFileSync(process.execPath, [npmCli, ...configArgs, '--version'], { cwd: root, env, encoding: 'utf8' }).trim();
  const packages = installedPackages(root, Object.keys(policy.subject.toolchain.installedPackages));
  const wranglerCliSha256 = sha(fs.readFileSync(path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js')));
  const toolchain = { node: process.version, nodeUndici: process.versions.undici, openssl: process.versions.openssl,
    npm, npmCliSha256, wranglerCliSha256, installedPackages: packages };
  requireThat(equal(toolchain, policy.subject.toolchain), 'TOOLCHAIN_CHANGED');
  const fullArtifact = JSON.parse(execFileSync(process.execPath, ['scripts/postlaunch-release.mjs', 'dist-hash', artifactDirectory],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 1024 * 1024 }));
  const { algorithm, fileCount, sha256 } = fullArtifact;
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  const context = { releaseId: policy.releaseId, repository: process.env.GITHUB_REPOSITORY || policy.subject.repository,
    sourceCommit, sourceTree: git(root, 'rev-parse', 'HEAD^{tree}'), expectedSourceSha: process.env.EXPECTED_SOURCE_SHA || sourceCommit,
    inputsSha256: sourceFingerprint(root), baseIsAncestor: spawnSync('git', ['merge-base', '--is-ancestor', policy.subject.reviewedBaseCommit, 'HEAD'], { cwd: root }).status === 0,
    baseTree: git(root, 'rev-parse', `${policy.subject.reviewedBaseCommit}^{tree}`),
    changedFromReviewedBase: git(root, 'diff', '--name-only', policy.subject.reviewedBaseCommit, 'HEAD').split('\n').filter(Boolean).sort(),
    packageHashes: Object.fromEntries(Object.keys(policy.subject.packageHashes).map((name) => [name, sha(fs.readFileSync(path.join(root, name)))])),
    toolchain, artifact: { algorithm, fileCount, sha256 }, reviewedPath: 'standard-worker-version-upload',
    endpointOrigins: { registry: 'https://registry.npmjs.org', provider: 'https://api.cloudflare.com' },
    manualAdvisoryIds: [...policy.manualResiduals.advisoryIds] };
  return { context, fullArtifact, npmCli };
}

/** Always retain raw audit output and original status; only this exact failure is accepted. */
export function runAudit(root, artifactDirectory) {
  const output = path.join(root, '.release-audit');
  requireThat(!fs.existsSync(output), 'EVIDENCE_ALREADY_EXISTS');
  fs.mkdirSync(output);
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
  let phase = 'policy';
  try {
    const policyText = fs.readFileSync(path.join(root, POLICY_PATH), 'utf8');
    const policy = JSON.parse(policyText); validatePolicy(policy);
    fs.writeFileSync(path.join(output, 'risk-policy.json'), policyText);
    const userConfig = path.join(output, 'empty-user-config'); const globalConfig = path.join(output, 'empty-global-config');
    fs.writeFileSync(userConfig, ''); fs.writeFileSync(globalConfig, '');
    const configArgs = [`--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, `--cache=${path.join(output, 'npm-cache')}`];
    const env = cleanAuditEnv(); phase = 'context';
    const { context, fullArtifact, npmCli } = collectContext(root, artifactDirectory, policy, configArgs, env);
    save('context.json', context); save('artifact.json', fullArtifact);
    phase = 'audit';
    const args = [npmCli, ...AUDIT_ARGS, ...configArgs]; const startedAtUtc = new Date().toISOString(); const start = performance.now();
    const stdout = fs.openSync(path.join(output, 'audit.json'), 'wx'); const stderr = fs.openSync(path.join(output, 'audit.stderr.log'), 'wx');
    let result; try { result = spawnSync(process.execPath, args, { cwd: root, env, stdio: ['ignore', stdout, stderr], timeout: 330000 }); }
    finally { fs.closeSync(stdout); fs.closeSync(stderr); }
    save('audit-run.json', { command: [process.execPath, ...args], startedAtUtc, elapsedMs: performance.now() - start,
      originalExitCode: result.status, signal: result.signal, executionError: result.error?.code ?? null,
      reportComplete: result.status !== null && !result.error && !result.signal,
      credentialCategoryVariablesFiltered: true, credentialValuesLogged: false,
      npmUserGlobalConfigsEmpty: true, registry: 'https://registry.npmjs.org', severityThreshold: 'high' });
    requireThat(!result.error && !result.signal, 'AUDIT_EXECUTION_ERROR');
    phase = 'identity-recheck';
    const refreshed = collectContext(root, artifactDirectory, policy, configArgs, env);
    save('context.json', { before: context, after: refreshed.context, matched: equal(context, refreshed.context) });
    assertStableAuditInputs({ context, fullArtifact }, { context: refreshed.context, fullArtifact: refreshed.fullArtifact });
    phase = 'evaluation';
    const evaluation = evaluateKnownRisk({ policy, context: refreshed.context, auditText: fs.readFileSync(path.join(output, 'audit.json'), 'utf8'), auditExitCode: result.status });
    save('risk-evaluation.json', evaluation);
    console.log(JSON.stringify(evaluation, null, 2));
    return 0;
  } catch (error) {
    const reason = /^RISK_EXCEPTION_[A-Z_]+$/.test(error.message) ? error.message : 'RISK_EXCEPTION_EVIDENCE_UNAVAILABLE_OR_INVALID';
    const failure = { schemaVersion: 1, status: 'REJECTED_RISK_EXCEPTION', phase, reason, npmAuditPassed: false, releaseAuthorization: false };
    save('risk-evaluation.json', failure); console.error(JSON.stringify(failure));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireThat(process.argv[2] === 'run' && process.argv.length === 4, 'COMMAND_INVALID');
  process.exitCode = runAudit(process.cwd(), path.resolve(process.argv[3]));
}
