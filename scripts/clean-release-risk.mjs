import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AUDIT_ARGS, cleanAuditEnv } from './release-risk-audit.mjs';

export const CLEAN_POLICY = 'release-clean-policy.json';
export const MAX_EVIDENCE_AGE_MS = 60 * 60 * 1000;
const REPOSITORY = 'PHamilton8/parkerhamilton-ca';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const hash = (b) => createHash('sha256').update(b).digest('hex');
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = (v) => hash(JSON.stringify(canonical(v)));
const same = (a, b, message) => assert.deepEqual(canonical(a), canonical(b), message);
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// JSON.parse alone silently accepts duplicate object keys; audit evidence must not.
export function strictJson(text) {
  assert.equal(typeof text, 'string', 'Complete JSON text required');
  assert.ok(text.length > 0 && text.length < 4 * 1024 * 1024, 'Bounded complete JSON required');
  const parsed = JSON.parse(text);
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g) ?? [];
  let i = 0;
  function value() {
    const t = tokens[i++];
    if (t === '{') {
      const keys = new Set();
      if (tokens[i] === '}') { i++; return; }
      do {
        const key = JSON.parse(tokens[i++]);
        assert.equal(typeof key, 'string'); assert.ok(!keys.has(key), 'Duplicate JSON key'); keys.add(key);
        assert.equal(tokens[i++], ':'); value();
        if (tokens[i] === '}') { i++; return; }
        assert.equal(tokens[i++], ',');
      } while (i < tokens.length);
      assert.fail('Incomplete object');
    }
    if (t === '[') {
      if (tokens[i] === ']') { i++; return; }
      do { value(); if (tokens[i] === ']') { i++; return; } assert.equal(tokens[i++], ','); } while (i < tokens.length);
      assert.fail('Incomplete array');
    }
    assert.ok(t !== undefined && !['}', ']', ',', ':'].includes(t), 'JSON value required');
  }
  value(); assert.equal(i, tokens.length, 'Trailing JSON input');
  return parsed;
}
export function validateCleanAudit(text, exitCode) {
  assert.equal(exitCode, 0, 'A complete zero-exit audit is required');
  const report = strictJson(text);
  same(Object.keys(report).sort(), ['auditReportVersion', 'metadata', 'vulnerabilities'], 'Unexpected audit schema/error');
  assert.equal(report.auditReportVersion, 2, 'Unsupported audit version');
  same(report.vulnerabilities, {}, 'Any vulnerability rejects normal qualification');
  same(Object.keys(report.metadata ?? {}).sort(), ['dependencies', 'vulnerabilities'], 'Incomplete audit metadata');
  same(report.metadata.vulnerabilities, { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, 'All severities must be zero');
  const deps = report.metadata.dependencies;
  same(Object.keys(deps ?? {}).sort(), ['dev', 'optional', 'peer', 'peerOptional', 'prod', 'total'], 'Incomplete dependency coverage');
  for (const v of Object.values(deps)) assert.ok(Number.isSafeInteger(v) && v >= 0, 'Invalid dependency count');
  assert.ok(deps.total > 0 && deps.prod > 0 && deps.dev > 0, 'Full dependency graph required');
  return report;
}
export function cleanFingerprint(root, tree = 'HEAD') {
  const rows = execFileSync('git', ['ls-tree', '-rz', tree], { cwd: root }).toString().split('\0').filter(Boolean).map(line => {
    const [header, name, ...extra] = line.split('\t'); const [mode, kind, blob] = header.split(' ');
    assert.ok(extra.length === 0 && name && !/[\n\r]/.test(name) && kind === 'blob' && SHA.test(blob), 'Invalid source tree');
    return { mode, kind, blob, name };
  }).filter(r => r.name !== CLEAN_POLICY).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return hash(rows.map(r => `${r.mode} ${r.kind} ${r.blob}\t${r.name}\n`).join(''));
}
function policyFor(root) {
  const p = strictJson(fs.readFileSync(path.join(root, CLEAN_POLICY), 'utf8'));
  assert.equal(p.schemaVersion, 1); assert.equal(p.mode, 'NORMAL_CLEAN_AUDIT'); assert.equal(p.repository, REPOSITORY);
  assert.match(p.inputsSha256 ?? '', HASH); assert.equal(p.evidenceMaxAgeMs, MAX_EVIDENCE_AGE_MS);
  assert.equal(p.bundledUndiciVersion, '7.30.1', 'Reviewed bundled Undici version required');
  return p;
}
function cleanWorktree(root) {
  git(root, 'diff', '--quiet', 'HEAD', '--');
  const rows = git(root, 'status', '--porcelain=v1', '--untracked-files=normal').split('\n').filter(Boolean);
  assert.ok(rows.every(line => /^\?\? \.(?:release-candidate|release-production|reviewed-candidate)\/$/.test(line)), 'Dirty/unreviewed source worktree');
  assert.ok(!fs.existsSync(path.join(root, '.npmrc')), 'Unreviewed npm config');
}
export function assertCleanSource(root) {
  const p = policyFor(root); cleanWorktree(root);
  assert.equal(cleanFingerprint(root), p.inputsSha256, 'Source inputs changed');
  assert.equal(process.version, p.runtime.node, 'Node runtime changed');
  assert.equal(process.versions.undici, p.runtime.nodeUndici, 'Node fetch runtime changed');
  assert.equal(process.versions.openssl, p.runtime.openssl, 'TLS runtime changed');
  assert.equal(process.env.GITHUB_REPOSITORY || REPOSITORY, REPOSITORY, 'Foreign repository');
  for (const [file, expected] of Object.entries(p.packageHashes)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, 'Package inputs changed');
  return p;
}
function installedToolchain(root, p) {
  const npmCli = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  const out = { npmCliSha256: hash(fs.readFileSync(npmCli)), npm: JSON.parse(fs.readFileSync(path.join(path.dirname(npmCli), '..', 'package.json'))).version,
    wranglerCliSha256: hash(fs.readFileSync(path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js'))), installedPackages: {} };
  for (const name of Object.keys(p.toolchain.installedPackages)) {
    const bytes = fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'));
    out.installedPackages[name] = { version: JSON.parse(bytes).version, sha256: hash(bytes) };
  }
  same(out, p.toolchain, 'Installed toolchain differs from reviewed fixed dependencies');
  const cli = fs.readFileSync(path.join(root, 'node_modules/wrangler/wrangler-dist/cli.js'), 'utf8');
  const versions = [...new Set([...cli.matchAll(/node_modules\/\.pnpm\/undici@([^/]+)\//g)].map(m => m[1]))];
  same(versions, [p.bundledUndiciVersion], 'Bundled Undici unknown, stale or mixed');
  return { toolchain: out, npmCli };
}
export function artifactIdentity(directory) {
  const rows = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort((a,b) => a.localeCompare(b))) { const abs = path.join(dir, name); const s = fs.lstatSync(abs); assert.ok(!s.isSymbolicLink(), 'Artifact symlink rejected');
      if (s.isDirectory()) walk(abs); else { assert.ok(s.isFile()); const b = fs.readFileSync(abs); rows.push({ path: path.relative(directory, abs).split(path.sep).join('/'), size: b.length, sha256: hash(b) }); }
    }
  }
  walk(directory);
  // Same recursive per-directory ordering as postlaunch distHash/walkFiles.
  return { algorithm: 'sha256-manifest-v1', fileCount: rows.length, sha256: hash(rows.map(r => `${r.sha256}  ${r.size}  ${r.path}`).join('\n')+'\n') };
}
function context(root, directory) {
  const p = assertCleanSource(root); const installed = installedToolchain(root, p);
  const sourceSha = git(root, 'rev-parse', 'HEAD'); assert.match(sourceSha, SHA);
  if (process.env.EXPECTED_SOURCE_SHA) assert.equal(sourceSha, process.env.EXPECTED_SOURCE_SHA, 'Unexpected CI checkout');
  return { policy: p, npmCli: installed.npmCli, value: { repository: REPOSITORY, sourceSha, sourceTree: git(root, 'rev-parse', 'HEAD^{tree}'),
    inputsSha256: p.inputsSha256, policySha256: digest(p), packageHashes: p.packageHashes, runtime: p.runtime, toolchain: installed.toolchain,
    bundledUndiciVersion: p.bundledUndiciVersion, artifact: artifactIdentity(directory) } };
}
export function assertQualificationFresh(receipt, now = Date.now()) {
  assert.equal(receipt?.status, 'QUALIFIED_CLEAN_AUDIT');
  const audited = Date.parse(receipt.auditedAtUtc); assert.ok(Number.isFinite(audited) && Number.isFinite(now), 'Invalid audit clock');
  assert.ok(now >= audited && now - audited < MAX_EVIDENCE_AGE_MS, 'Clean evidence stale or future dated');
}
export function validateReceipt(receipt, expected, now = Date.now()) {
  assert.equal(receipt?.schemaVersion, 1); assertQualificationFresh(receipt, now);
  validateCleanAudit(receipt.auditText, receipt.auditExitCode);
  assert.equal(hash(receipt.auditText), receipt.auditSha256, 'Audit digest changed');
  same(receipt.context, expected, 'Source/artifact/toolchain qualification mismatch');
  assert.equal(receipt.credentialedUploadAuthorized, false); assert.equal(receipt.deployed, false);
  return receipt;
}
export function qualify({ before, after, auditText, auditExitCode, auditedAtUtc }) {
  same(after, before, 'Source/artifact/toolchain changed during audit'); validateCleanAudit(auditText, auditExitCode);
  const receipt = { schemaVersion: 1, status: 'QUALIFIED_CLEAN_AUDIT', auditedAtUtc, auditExitCode, auditText, auditSha256: hash(auditText),
    context: before, credentialedUploadAuthorized: false, deployed: false };
  return validateReceipt(receipt, before);
}
export function runCleanAudit(root, directory) {
  const output = path.join(root, '.release-audit'); assert.ok(!fs.existsSync(output), 'Existing audit evidence must not be overwritten'); fs.mkdirSync(output);
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value,null,2)+'\n');
  try {
    const before = context(root, directory); save('clean-policy.json', before.policy); save('context.json', before.value); save('artifact.json', before.value.artifact);
    const user = path.join(output,'empty-user-config'), global = path.join(output,'empty-global-config'); fs.writeFileSync(user,'');fs.writeFileSync(global,'');
    const args = [before.npmCli, ...AUDIT_ARGS, `--userconfig=${user}`, `--globalconfig=${global}`, `--cache=${path.join(output,'npm-cache')}`];
    const out = fs.openSync(path.join(output,'audit.json'),'wx'), err = fs.openSync(path.join(output,'audit.stderr.log'),'wx');
    const startedAtUtc = new Date().toISOString(); let result;
    try { result = spawnSync(process.execPath,args,{cwd:root,env:cleanAuditEnv(),stdio:['ignore',out,err],timeout:330000}); } finally { fs.closeSync(out);fs.closeSync(err); }
    save('audit-run.json',{startedAtUtc,completedAtUtc:new Date().toISOString(),originalExitCode:result.status,signal:result.signal,error:result.error?.code??null,credentialVariablesFiltered:true,fullDependencyGraph:true,registry:'https://registry.npmjs.org'});
    assert.ok(!result.error && !result.signal, 'Incomplete audit execution');
    const after = context(root,directory); const receipt = qualify({before:before.value,after:after.value,auditText:fs.readFileSync(path.join(output,'audit.json'),'utf8'),auditExitCode:result.status,auditedAtUtc:startedAtUtc});
    save('risk-evaluation.json',receipt); return receipt;
  } catch(error) { save('risk-evaluation.json',{status:'REJECTED_CLEAN_QUALIFICATION',reason:'Audit or identity validation failed',deployed:false}); throw error; }
}
export function assertCleanArtifact(root, directory) {
  const receipt = strictJson(fs.readFileSync(path.join(root,'.release-audit/risk-evaluation.json'),'utf8'));
  const before = context(root,directory); validateReceipt(receipt,before.value);
  // Hashing and identity checks must not carry evidence past its freshness boundary.
  assertQualificationFresh(receipt); return receipt;
}
export function assertEmbeddedQualification(root, manifest) {
  const p = assertCleanSource(root), receipt = manifest.cleanQualification;
  assert.equal(receipt?.context?.sourceSha,manifest.sourceSha); assert.equal(receipt.context.sourceTree,manifest.treeSha);
  assert.match(manifest.sourceSha ?? '', SHA); assert.match(manifest.treeSha ?? '', SHA); assert.match(manifest.distSha256 ?? '', HASH);
  assert.equal(receipt.context.artifact.algorithm, 'sha256-manifest-v1');
  assert.ok(Number.isSafeInteger(receipt.context.artifact.fileCount) && receipt.context.artifact.fileCount > 0);
  assert.equal(receipt.context.artifact.sha256,manifest.distSha256);
  const expected = { ...receipt.context, repository:REPOSITORY, sourceTree:git(root,'rev-parse','HEAD^{tree}'), inputsSha256:p.inputsSha256,
    policySha256:digest(p),packageHashes:p.packageHashes,runtime:p.runtime,toolchain:p.toolchain,bundledUndiciVersion:p.bundledUndiciVersion };
  return validateReceipt(receipt,expected);
}
export function assertPromotionQualification(root) {
  return assertEmbeddedQualification(root,strictJson(fs.readFileSync(path.join(root,'.release-production/candidate.json'),'utf8')));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { assert.equal(process.argv[2],'run'); const receipt=runCleanAudit(process.cwd(),path.resolve(process.argv[3]??'dist')); console.log(JSON.stringify({status:receipt.status,auditSha256:receipt.auditSha256,sourceSha:receipt.context.sourceSha,deployed:false})); }
  catch(error) { console.error(JSON.stringify({status:'REJECTED_CLEAN_QUALIFICATION',reason:error.message.slice(0,200)}));process.exitCode=1; }
}
