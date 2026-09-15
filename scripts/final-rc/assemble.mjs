#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareSourceOverlay, runSourceWave, verifyLandedOverlay, gateEnvironment, LANE_ORDER } from './source-overlay.mjs';
import { assertCompleteBrowserReport, assertDryRunIdentity } from './qa-integrity.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = path.join(SCRIPT_DIR, 'policy.json');
const SHA_RE = /^[0-9a-f]{40}$/i;
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,}$/;
const MODES = new Set(['DRY-RUN', 'EXECUTE']);

class RcError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RcError';
    this.details = details;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new RcError(`Unable to read JSON: ${filePath}`, { cause: String(error) });
  }
}

function parseArgs(argv) {
  const args = { manifest: null, mode: 'DRY-RUN', integrationBranch: null, outputDir: null, expectedDryRunSummary: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = argv[i + 1];
    if (token === '--manifest') { if (!value) throw new RcError('--manifest requires a path.'); args.manifest = value; i += 1; }
    else if (token === '--mode') { if (!value) throw new RcError('--mode requires DRY-RUN or EXECUTE.'); args.mode = value.toUpperCase(); i += 1; }
    else if (token === '--integration-branch') { if (!value) throw new RcError('--integration-branch requires a branch name.'); args.integrationBranch = value; i += 1; }
    else if (token === '--output-dir') { if (!value) throw new RcError('--output-dir requires a path.'); args.outputDir = value; i += 1; }
    else if (token === '--expected-dry-run-summary') { if (!value) throw new RcError('--expected-dry-run-summary requires a path.'); args.expectedDryRunSummary = value; i += 1; }
    else if (token === '--help' || token === '-h') { printUsage(); process.exit(0); }
    else throw new RcError(`Unknown argument: ${token}`);
  }
  if (!args.manifest) throw new RcError('--manifest is required.');
  if (!MODES.has(args.mode)) throw new RcError(`Unsupported mode: ${args.mode}`);
  return args;
}

function printUsage() {
  console.log(`ParkerHamilton.ca Final RC Assembler\n\nUsage:\n  node scripts/final-rc/assemble.mjs --manifest <path> [--mode DRY-RUN|EXECUTE] [--integration-branch integration/<name>] [--output-dir <path>] [--expected-dry-run-summary <path>]\n\nDefaults:\n  --mode DRY-RUN\n  --output-dir ../parkerhamilton-final-rc-output/<manifest-hash>\n\nEXECUTE requires a complete green DRY-RUN summary and reproduces its exact SHA, tree, and dist before publication. It never merges main, tags, releases, or deploys. It only pushes the fully validated candidate to the exact authorized integration branch named in both the manifest and CLI.`);
}

function exec(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: options.cwd, env: { ...gateEnvironment(options.env?.QA_AUTHORITY_PROFILE, options.env?.FINAL_RC_SOURCE_CONTEXT), ...(options.env || {}) }, encoding: 'utf8', input: options.input, maxBuffer: 64 * 1024 * 1024, stdio: options.stdio });
  const record = { command: [command, ...args].join(' '), cwd: options.cwd, exitCode: result.status ?? 1, durationMs: Date.now() - started, stdout: result.stdout || '', stderr: result.stderr || '' };
  if (options.logFile) { fs.mkdirSync(path.dirname(options.logFile), { recursive: true }); fs.writeFileSync(options.logFile, `${record.command}\n\nSTDOUT\n${record.stdout}\n\nSTDERR\n${record.stderr}\n`, 'utf8'); }
  if (!options.allowFailure && record.exitCode !== 0) throw new RcError(`Command failed (${record.exitCode}): ${record.command}`, record);
  return record;
}
function git(cwd, args, options = {}) { return exec('git', args, { cwd, ...options }); }
function npm(cwd, args, options = {}) { return exec('npm', args, { cwd, ...options }); }
function findRepoRoot(start = process.cwd()) { const result = git(start, ['rev-parse', '--show-toplevel'], { allowFailure: true }); if (result.exitCode !== 0) throw new RcError('Run the assembler from inside a git checkout of PHamilton8/parkerhamilton-ca.'); return result.stdout.trim(); }
function sha256Text(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function manifestHash(manifest) { return sha256Text(JSON.stringify(canonicalize(manifest))).slice(0, 16); }

function globToRegExp(glob) {
  let pattern = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*') { if (glob[i + 1] === '*') { pattern += '.*'; i += 1; } else pattern += '[^/]*'; }
    else if ('\\.^$+?()[]{}|'.includes(ch)) pattern += `\\${ch}`;
    else pattern += ch;
  }
  pattern += '$';
  return new RegExp(pattern);
}
function matchesAny(file, globs = []) { return globs.some((glob) => globToRegExp(glob).test(file)); }
function isAllowedForLane(file, lanePolicy, globalFrozen) { if (matchesAny(file, globalFrozen)) return false; if (matchesAny(file, lanePolicy.denied || [])) return false; return matchesAny(file, lanePolicy.allowed || []); }

function normalizeLaneEntry(rawEntry, lane, manifest) {
  const manifestAuthorities = manifest.authorities?.[lane] || [];
  if (rawEntry === null) return { lane, skip: true, authorities: [] };
  if (typeof rawEntry === 'string') return { lane, skip: false, tip: rawEntry, commits: null, authorities: [...manifestAuthorities], allowNonDescendant: false };
  if (Array.isArray(rawEntry)) return { lane, skip: false, tip: null, commits: [...rawEntry], authorities: [...manifestAuthorities], allowNonDescendant: false };
  if (typeof rawEntry === 'object' && rawEntry) {
    const ownAuthorities = rawEntry.authorityIds ?? rawEntry.authorities ?? manifestAuthorities;
    const commits = rawEntry.commits ?? null;
    const tip = rawEntry.tip ?? null;
    if (tip && commits) throw new RcError(`${lane}: provide either tip or commits, not both.`);
    if (!tip && !commits) throw new RcError(`${lane}: non-null object must contain tip or commits.`);
    return { lane, skip: false, tip, commits: commits ? [...commits] : null, authorities: Array.isArray(ownAuthorities) ? [...ownAuthorities] : [ownAuthorities], allowNonDescendant: rawEntry.allowNonDescendant === true };
  }
  throw new RcError(`${lane}: manifest entry must be null, a commit SHA string, an array of commit SHAs, or an object.`);
}

function validateManifestShape(manifest, policy, args) {
  if (manifest.schemaVersion !== policy.schemaVersion) throw new RcError(`Manifest schemaVersion must be ${policy.schemaVersion}.`);
  if (manifest.base !== policy.authorizedBase) throw new RcError(`Manifest base must be the authorized base ${policy.authorizedBase}; got ${manifest.base}.`);
  if (!manifest.candidateTimestamp || Number.isNaN(Date.parse(manifest.candidateTimestamp))) throw new RcError('candidateTimestamp must be a fixed ISO-8601 timestamp. This prevents run metadata from depending on wall-clock time.');
  for (const lane of policy.laneOrder) if (!Object.prototype.hasOwnProperty.call(manifest, lane)) throw new RcError(`Manifest must explicitly include ${lane}: use null for an intentionally skipped lane.`);
  const allowedTopKeys = new Set(['schemaVersion', 'base', 'candidateTimestamp', ...policy.laneOrder, 'authorities', 'execution', 'notes']);
  for (const key of Object.keys(manifest)) if (!allowedTopKeys.has(key)) throw new RcError(`Unknown top-level manifest key: ${key}`);
  if (args.mode === 'EXECUTE') {
    if (!args.expectedDryRunSummary) throw new RcError('EXECUTE requires --expected-dry-run-summary from the complete green DRY-RUN.');
    const manifestBranch = manifest.execution?.authorizedIntegrationBranch;
    if (!args.integrationBranch) throw new RcError('EXECUTE requires --integration-branch.');
    if (!manifestBranch) throw new RcError('EXECUTE requires execution.authorizedIntegrationBranch in the manifest.');
    if (manifestBranch !== args.integrationBranch) throw new RcError(`EXECUTE branch mismatch: manifest authorizes ${manifestBranch}, CLI requested ${args.integrationBranch}.`);
    validateIntegrationBranch(args.integrationBranch, policy);
  } else if (args.integrationBranch || args.expectedDryRunSummary) throw new RcError('--integration-branch and --expected-dry-run-summary are accepted only with --mode EXECUTE.');
}
function validateIntegrationBranch(branch, policy) { if (policy.forbiddenIntegrationBranches.includes(branch)) throw new RcError(`Refusing forbidden integration branch: ${branch}`); if (!branch.startsWith(policy.integrationBranchPrefix)) throw new RcError(`Integration branch must start with ${policy.integrationBranchPrefix}`); if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.startsWith('/')) throw new RcError(`Unsafe integration branch name: ${branch}`); }
function verifyRepositoryIdentity(repoRoot, policy) { const remote = git(repoRoot, ['config', '--get', 'remote.origin.url'], { allowFailure: true }).stdout.trim(); if (!remote || !remote.toLowerCase().includes('phamilton8/parkerhamilton-ca')) throw new RcError(`origin does not appear to be ${policy.repository}.`, { origin: remote }); const dirty = git(repoRoot, ['status', '--porcelain=v1']).stdout.trim(); if (dirty) throw new RcError('The operator checkout is not clean. Commit/stash unrelated work before assembling.', { status: dirty }); }
function hasCommit(repoRoot, sha) { return git(repoRoot, ['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).exitCode === 0; }
function ensureCommit(repoRoot, sha) { if (!SHA_RE.test(sha)) throw new RcError(`Invalid 40-character commit SHA: ${sha}`); if (hasCommit(repoRoot, sha)) return; const fetched = git(repoRoot, ['fetch', '--no-tags', 'origin', sha], { allowFailure: true }); if (fetched.exitCode !== 0 || !hasCommit(repoRoot, sha)) throw new RcError(`Commit does not exist in the local object database and could not be fetched: ${sha}`, { fetch: fetched }); }
function isAncestor(repoRoot, ancestor, descendant) { return git(repoRoot, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true }).exitCode === 0; }
function commitParents(repoRoot, sha) { const line = git(repoRoot, ['rev-list', '--parents', '-n', '1', sha]).stdout.trim().split(/\s+/); return line.slice(1); }

function expandLane(repoRoot, base, entry) {
  if (entry.skip) return { ...entry, expandedCommits: [] };
  const rawShas = entry.tip ? [entry.tip] : entry.commits;
  if (!Array.isArray(rawShas) || rawShas.length === 0) throw new RcError(`${entry.lane}: no commits supplied.`);
  for (const sha of rawShas) ensureCommit(repoRoot, sha);
  if (entry.tip) {
    if (!isAncestor(repoRoot, base, entry.tip)) {
      if (!entry.allowNonDescendant) throw new RcError(`${entry.lane}: tip ${entry.tip} does not descend from authorized base ${base}. Use an explicit commits array plus allowNonDescendant only when a separately authorized patch truly must be applied.`);
      return { ...entry, expandedCommits: [entry.tip] };
    }
    const revs = git(repoRoot, ['rev-list', '--reverse', '--ancestry-path', `${base}..${entry.tip}`]).stdout.trim();
    const commits = revs ? revs.split(/\s+/) : [];
    if (commits.length === 0) throw new RcError(`${entry.lane}: tip ${entry.tip} is already subsumed by the base or produces no commits.`);
    return { ...entry, expandedCommits: commits };
  }
  return { ...entry, expandedCommits: [...entry.commits] };
}
function validateAuthorities(entry, lanePolicy) { if (entry.skip) return; for (const authority of entry.authorities) if (typeof authority !== 'string' || !DRIVE_ID_RE.test(authority)) throw new RcError(`${entry.lane}: invalid durable owner-authority ID: ${authority}`); if (lanePolicy.requiresAuthority && entry.authorities.length === 0) throw new RcError(`${entry.lane}: this lane is owner-gated and cannot be included without at least one durable owner-authority ID.`); for (const required of lanePolicy.requiredAuthorityIds || []) if (!entry.authorities.includes(required)) throw new RcError(`${entry.lane}: manifest is missing required durable authority ${required}.`); }
function changedFilesForCommit(repoRoot, sha) { const output = git(repoRoot, ['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', sha]).stdout.trim(); if (!output) return []; return output.split('\n').map((line) => { const [status, ...rest] = line.split('\t'); return { status, path: rest.at(-1) }; }); }
function stablePatchId(repoRoot, sha) { const patch = git(repoRoot, ['show', '--format=', '--binary', '--full-index', sha]).stdout; const result = exec('git', ['patch-id', '--stable'], { cwd: repoRoot, input: patch, allowFailure: true }); if (result.exitCode !== 0) throw new RcError(`Unable to compute stable patch-id for ${sha}.`, result); const id = result.stdout.trim().split(/\s+/)[0] || ''; if (!id) throw new RcError(`Commit ${sha} is empty or has no stable patch-id; empty commits are not valid RC inputs.`); return id; }
function validateCommitAndFootprint(repoRoot, base, laneEntry, lanePolicy, policy) { const inspected = []; for (const sha of laneEntry.expandedCommits) { ensureCommit(repoRoot, sha); const parents = commitParents(repoRoot, sha); if (parents.length > 1) throw new RcError(`${laneEntry.lane}: merge commit ${sha} is not accepted; supply one-purpose non-merge commits.`); if (sha === base || isAncestor(repoRoot, sha, base)) throw new RcError(`${laneEntry.lane}: commit ${sha} is duplicate/subsumed by the authorized base.`); const descends = isAncestor(repoRoot, base, sha); if (!descends && !laneEntry.allowNonDescendant) throw new RcError(`${laneEntry.lane}: commit ${sha} does not descend from the authorized base and allowNonDescendant is false.`); if (!descends && laneEntry.authorities.length === 0) throw new RcError(`${laneEntry.lane}: a non-descendant patch requires an explicit durable authority ID.`); const files = changedFilesForCommit(repoRoot, sha); if (files.length === 0) throw new RcError(`${laneEntry.lane}: commit ${sha} changes no files.`); for (const file of files) { if (matchesAny(file.path, policy.globalFrozen)) throw new RcError(`${laneEntry.lane}: commit ${sha} touches globally frozen file ${file.path}.`); if (!isAllowedForLane(file.path, lanePolicy, policy.globalFrozen)) throw new RcError(`${laneEntry.lane}: commit ${sha} touches out-of-scope path ${file.path}.`, { status: file.status, allowed: lanePolicy.allowed, denied: lanePolicy.denied }); } inspected.push({ sha, parents, descendsFromBase: descends, patchId: stablePatchId(repoRoot, sha), files }); } return inspected; }
function validateDuplicatesAndCollisions(laneInspections) { const seenSha = new Map(); const seenPatch = new Map(); const fileOwners = new Map(); for (const lane of laneInspections) for (const commit of lane.commits) { if (seenSha.has(commit.sha)) throw new RcError(`Duplicate/subsumed commit ${commit.sha} appears in both ${seenSha.get(commit.sha)} and ${lane.lane}.`); seenSha.set(commit.sha, lane.lane); if (seenPatch.has(commit.patchId)) { const earlier = seenPatch.get(commit.patchId); throw new RcError(`Duplicate patch detected: ${commit.sha} (${lane.lane}) duplicates ${earlier.sha} (${earlier.lane}).`); } seenPatch.set(commit.patchId, { sha: commit.sha, lane: lane.lane }); for (const file of commit.files) { const prior = fileOwners.get(file.path); if (prior && prior !== lane.lane) throw new RcError(`Cross-lane file collision before integration: ${file.path} is touched by both ${prior} and ${lane.lane}. Shared-file conflicts are never auto-resolved.`); fileOwners.set(file.path, lane.lane); } } return fileOwners; }
function assertNoExistingExecuteBranch(repoRoot, branch) { const local = git(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true }); if (local.exitCode === 0) throw new RcError(`EXECUTE refuses to overwrite existing local branch ${branch}.`); const remote = git(repoRoot, ['ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${branch}`], { allowFailure: true }); if (remote.exitCode === 0) throw new RcError(`EXECUTE refuses to overwrite existing remote branch ${branch}.`); if (![0,2].includes(remote.exitCode)) throw new RcError(`Unable to establish whether remote branch ${branch} already exists. Refusing EXECUTE.`, remote); }
function commitIdentity(repoRoot, sha) { const raw = git(repoRoot, ['show', '-s', '--format=%cn%x00%ce%x00%cI', sha]).stdout.trim(); const [name, email, date] = raw.split('\0'); if (!name || !email || !date) throw new RcError(`Could not read committer identity for ${sha}.`); return { name, email, date }; }
function collectConflictDiagnostics(worktree, lane, sourceCommit, cherryPickResult) { const unmergedRaw = git(worktree, ['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }).stdout.trim(); const unmergedFiles = unmergedRaw ? unmergedRaw.split('\n') : []; return { lane, sourceCommit, cherryPick: cherryPickResult, status: git(worktree, ['status', '--porcelain=v2'], { allowFailure: true }).stdout, unmergedFiles: unmergedFiles.map((file) => ({ path: file, indexStages: git(worktree, ['ls-files', '-u', '--', file], { allowFailure: true }).stdout, combinedDiff: git(worktree, ['diff', '--cc', '--', file], { allowFailure: true }).stdout })) }; }

function ensureNpmInstalled(worktree, testSummary, logDir, phase) { const logFile = path.join(logDir, `${String(testSummary.length + 1).padStart(3, '0')}-${phase}-npm-ci.log`); const result = npm(worktree, ['ci'], { allowFailure: true, logFile }); testSummary.push({ phase, name: 'npm ci', exitCode: result.exitCode, durationMs: result.durationMs, logFile }); if (result.exitCode !== 0) throw new RcError(`${phase}: npm ci failed.`, result); }
function packageScripts(worktree) { const pkg = readJson(path.join(worktree, 'package.json')); return new Set(Object.keys(pkg.scripts || {})); }
function runGate(worktree, testSummary, logDir, phase, command, args, env = {}) { const safeName = `${String(testSummary.length + 1).padStart(3, '0')}-${phase}-${[command, ...args].join('-').replace(/[^A-Za-z0-9._-]+/g, '_')}.log`; const logFile = path.join(logDir, safeName); const result = exec(command, args, { cwd: worktree, allowFailure: true, logFile, env }); testSummary.push({ phase, name: [command, ...args].join(' '), exitCode: result.exitCode, durationMs: result.durationMs, logFile }); if (result.exitCode !== 0) throw new RcError(`${phase}: gate failed: ${[command, ...args].join(' ')}`, result); return result; }
function runWaveTests(worktree, profile, lane, testSummary, logDir, sourceContext = null) {
  const scripts=packageScripts(worktree), phase=`wave-${lane}`;
  const finalEnv=lane==='releaseTooling'?{QA_AUTHORITY_PROFILE:'final-rc'}:{};
  const runScript=script=>{if(!scripts.has(script))throw new RcError(`${phase}: required npm script '${script}' is missing.`);runGate(worktree,testSummary,logDir,phase,'npm',['run',script],finalEnv);};
  runScript('check');
  if(sourceContext && lane!=='releaseTooling') {
    runSourceWave({worktree,...sourceContext,phase:lane,run:(command,args,env)=>runGate(worktree,testSummary,logDir,phase,command,args,env)});
  } else runScript('test:source');
  if(profile==='modelAware')runScript('test:engines');
  if(profile==='qa'||profile==='infra')runScript('test');
  if(profile==='infra')runScript('public-safety');
  runScript('build');
  if(profile==='infra'){if(scripts.has('infra:validate'))runScript('infra:validate');if(scripts.has('infra:validate-dist'))runScript('infra:validate-dist');}
}
function runFinalHarness(worktree, testSummary, logDir, completeFinalLaneSet) {
  const phase = 'final-rc';
  ensureNpmInstalled(worktree, testSummary, logDir, phase);
  const scripts = packageScripts(worktree);
  for (const script of ['check','test','public-safety','qa:contrast','build']) { if (!scripts.has(script)) throw new RcError(`${phase}: required npm script '${script}' is missing.`); runGate(worktree, testSummary, logDir, phase, 'npm', ['run', script], { QA_AUTHORITY_PROFILE: 'final-rc' }); }
  for (const infrastructureGate of ['infra:validate','infra:validate-dist','infra:preview-dry-run']) {
    if (completeFinalLaneSet && !scripts.has(infrastructureGate)) throw new RcError(`${phase}: required infrastructure gate '${infrastructureGate}' is missing.`);
    if (scripts.has(infrastructureGate)) runGate(worktree, testSummary, logDir, phase, 'npm', ['run', infrastructureGate], { QA_AUTHORITY_PROFILE: 'final-rc' });
  }
  runGate(worktree, testSummary, logDir, phase, 'npm', ['audit', '--audit-level=high']);
  if (!scripts.has('test:browser')) throw new RcError(`${phase}: required npm script 'test:browser' is missing.`);
  runGate(worktree, testSummary, logDir, phase, 'npx', ['playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit']);
  if (!completeFinalLaneSet) {
    // Preserve the original explicitly partial PREP rehearsal. It can never
    // satisfy EXECUTE's complete-lane/browser-certificate requirements.
    runGate(worktree, testSummary, logDir, phase, 'npm', ['run', 'test:browser'], { QA_AUTHORITY_PROFILE: 'final-rc' });
    return { status: 'PREP_ONLY', note: 'Partial lane rehearsal; not final browser certification.' };
  }
  const browser=runGate(worktree, testSummary, logDir, phase, 'npm', ['--silent', 'run', 'test:browser', '--', '--reporter=json'], { QA_AUTHORITY_PROFILE: 'final-rc' });
  const report=JSON.parse(browser.stdout);
  const certification=assertCompleteBrowserReport(report);
  writeJson(path.join(logDir,'final-browser-report.json'),report);
  writeJson(path.join(logDir,'final-browser-certification.json'),certification);
  return certification;
}
function diffNameStatus(repoRoot, base, head) { const out = git(repoRoot, ['diff', '--name-status', `${base}..${head}`]).stdout.trim(); if (!out) return []; return out.split('\n').map((line) => { const [status, ...rest] = line.split('\t'); return { status, path: rest.at(-1) }; }); }
function blobShaAt(repoRoot, commit, file) { const out = git(repoRoot, ['ls-tree', commit, '--', file], { allowFailure: true }).stdout.trim(); if (!out) return null; const match = out.match(/^\d+\s+\w+\s+([0-9a-f]{40})\t/); return match ? match[1] : null; }
function verifyFinalChangedFiles(worktree, base, head, fileOwners, policy) { const changed = diffNameStatus(worktree, base, head); const output = []; for (const item of changed) { if (matchesAny(item.path, policy.globalFrozen)) throw new RcError(`Final candidate unexpectedly changes frozen path ${item.path}.`); const lane = fileOwners.get(item.path); if (!lane) throw new RcError(`Final candidate changes unexpected path with no owning manifest lane: ${item.path}.`); const lanePolicy = policy.lanes[lane]; if (!isAllowedForLane(item.path, lanePolicy, policy.globalFrozen)) throw new RcError(`Final candidate path ${item.path} is not valid for owning lane ${lane}.`); output.push({ ...item, ownerLane: lane, baseBlob: blobShaAt(worktree, base, item.path), candidateBlob: item.status.startsWith('D') ? null : blobShaAt(worktree, head, item.path) }); } return output; }
function hashBuildArtifact(distDir) { if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) throw new RcError(`Build artifact directory is missing: ${distDir}`); const files = []; const walk = (dir) => { for (const name of fs.readdirSync(dir).sort()) { const full = path.join(dir, name); const stat = fs.lstatSync(full); if (stat.isDirectory()) walk(full); else files.push(full); } }; walk(distDir); const aggregate = crypto.createHash('sha256'); const entries = []; for (const full of files) { const rel = path.relative(distDir, full).split(path.sep).join('/'); const stat = fs.lstatSync(full); let contentHash; if (stat.isSymbolicLink()) contentHash = sha256Text(`symlink:${fs.readlinkSync(full)}`); else contentHash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'); entries.push({ path: rel, sha256: contentHash, bytes: stat.isFile() ? stat.size : 0 }); aggregate.update(rel); aggregate.update('\0'); aggregate.update(contentHash); aggregate.update('\n'); } return { algorithm: 'sha256', hash: aggregate.digest('hex'), fileCount: entries.length, files: entries }; }
function writeJson(filePath, data) { fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8'); }
function writeCloseout(filePath, summary) { const laneRows = summary.lanes.map((lane) => `| ${lane.lane} | ${lane.skipped ? 'SKIPPED' : lane.sourceCommits.join('<br>')} | ${lane.authorities.join('<br>') || '—'} |`).join('\n'); const tests = summary.tests.map((test) => `- ${test.exitCode === 0 ? 'PASS' : 'FAIL'} — ${test.phase}: ${test.name} (${test.durationMs} ms)`).join('\n'); const body = `# ParkerHamilton.ca Final RC Assembly Closeout\n\n- Mode: **${summary.mode}**\n- Manifest SHA-256: \`${summary.manifestSha256}\`\n- Authorized base / source-assembly rollback point: \`${summary.rollbackPoint}\`\n- Final candidate SHA: \`${summary.finalCandidateSha}\`\n- Final tree SHA: \`${summary.finalTreeSha}\`\n- Build artifact SHA-256: \`${summary.buildArtifact.hash}\`\n- Changed files: ${summary.changedFiles.length}\n- Integration branch pushed: ${summary.pushedIntegrationBranch ? `\`${summary.pushedIntegrationBranch}\`` : 'none (DRY-RUN or no push)'}\n\n## Authority → source commit lanes\n\n| Lane | Source commit(s) | Durable authority ID(s) |\n|---|---|---|\n${laneRows}\n\n## Tests\n\n${tests}\n\n## Source-assembly rollback only\n\nThe deterministic source-assembly rollback point is the immutable authorized base \`${summary.rollbackPoint}\`. This is not a production Worker deployment/version rollback identity or an inferred LKG. Production rollback identifiers must be independently read and recorded in the separate launch phase. The assembler never merges main, creates tags/releases, deploys, or changes production.\n`; fs.writeFileSync(filePath, body, 'utf8'); }
function preflightExecuteBranch(repoRoot, args, policy) { if (args.mode === 'EXECUTE') assertNoExistingExecuteBranch(repoRoot, args.integrationBranch); }

function main() {
  if (process.version !== 'v24.19.0') throw new RcError(`Expected Node v24.19.0, got ${process.version}.`);
  const args = parseArgs(process.argv.slice(2));
  const policy = readJson(POLICY_PATH);
  if (JSON.stringify(policy.laneOrder) !== JSON.stringify(LANE_ORDER)) throw new RcError('Source overlay lane order differs from authorized assembler policy.');
  const manifestPath = path.resolve(args.manifest);
  const manifest = readJson(manifestPath);
  validateManifestShape(manifest, policy, args);
  const repoRoot = findRepoRoot(); verifyRepositoryIdentity(repoRoot, policy); ensureCommit(repoRoot, policy.authorizedBase);
  const resolvedBase = git(repoRoot, ['rev-parse', `${policy.authorizedBase}^{commit}`]).stdout.trim();
  if (resolvedBase !== policy.authorizedBase) throw new RcError('Authorized base failed exact-SHA resolution.');
  preflightExecuteBranch(repoRoot, args, policy);
  const manifestSha256 = sha256Text(JSON.stringify(canonicalize(manifest)));
  const runId = `${manifest.candidateTimestamp.replace(/[^0-9TZ]/g, '')}-${manifestHash(manifest)}`;
  const outputDir = path.resolve(args.outputDir || path.join(repoRoot, '..', 'parkerhamilton-final-rc-output', runId));
  const relativeOutput = path.relative(repoRoot, outputDir);
  if (relativeOutput === '' || (!relativeOutput.startsWith('..' + path.sep) && relativeOutput !== '..')) throw new RcError('Output directory must be outside the repository checkout so evidence generation cannot dirty or be committed with the RC.');
  fs.mkdirSync(outputDir, { recursive: true }); const logDir = path.join(outputDir, 'logs'); fs.mkdirSync(logDir, { recursive: true });
  const summary = { schemaVersion: 1, status: 'IN_PROGRESS', mode: args.mode, repository: policy.repository, manifestPath, manifestSha256, candidateTimestamp: manifest.candidateTimestamp, rollbackPoint: policy.authorizedBase, lanes: [], tests: [], changedFiles: [], authorityToCommit: {}, buildArtifact: null, finalCandidateSha: null, finalTreeSha: null, pushedIntegrationBranch: null, outputDir };
  writeJson(path.join(outputDir, 'manifest.normalized-input.json'), manifest);
  let worktree = null;
  try {
    const expanded = policy.laneOrder.map((lane) => { const entry = normalizeLaneEntry(manifest[lane], lane, manifest); validateAuthorities(entry, policy.lanes[lane]); return expandLane(repoRoot, policy.authorizedBase, entry); });
    const laneInspections = expanded.map((entry) => entry.skip ? { lane: entry.lane, entry, commits: [] } : { lane: entry.lane, entry, commits: validateCommitAndFootprint(repoRoot, policy.authorizedBase, entry, policy.lanes[entry.lane], policy) });
    const fileOwners = validateDuplicatesAndCollisions(laneInspections);
    for (const lane of laneInspections) summary.lanes.push({ lane: lane.lane, skipped: lane.entry.skip, sourceCommits: lane.commits.map((commit) => commit.sha), authorities: lane.entry.authorities, files: lane.commits.flatMap((commit) => commit.files.map((file) => file.path)).filter((value, index, array) => array.indexOf(value) === index) });
    writeJson(path.join(outputDir, 'preflight-lane-plan.json'), summary.lanes);
    const toolingLane = laneInspections.find(lane => lane.lane === 'releaseTooling' && !lane.entry.skip);
    const sourceOverlay = toolingLane ? prepareSourceOverlay(repoRoot, toolingLane.commits.at(-1).sha, path.join(outputDir, 'source-overlay')) : null;
    summary.sourceOverlay = sourceOverlay;
    const includedLanes = laneInspections.filter(lane => !lane.entry.skip).map(lane => lane.lane);
    const appliedLanes = [];
    worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'parkerhamilton-final-rc-')); fs.rmSync(worktree, { recursive: true, force: true }); git(repoRoot, ['worktree', 'add', '--detach', worktree, policy.authorizedBase]); ensureNpmInstalled(worktree, summary.tests, logDir, 'bootstrap');
    const sourceToAssembled = {};
    for (const lane of laneInspections) {
      if (lane.entry.skip) continue;
      for (const commit of lane.commits) {
        const identity = commitIdentity(repoRoot, commit.sha);
        const cherry = git(worktree, ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`, 'cherry-pick', '--no-edit', commit.sha], { allowFailure: true, env: { GIT_COMMITTER_DATE: identity.date } });
        if (cherry.exitCode !== 0) { const diagnostics = collectConflictDiagnostics(worktree, lane.lane, commit.sha, cherry); writeJson(path.join(outputDir, 'conflict-diagnostics.json'), diagnostics); git(worktree, ['cherry-pick', '--abort'], { allowFailure: true }); throw new RcError(`Conflict while applying ${commit.sha} in ${lane.lane}. No ours/theirs resolution was attempted. See conflict-diagnostics.json.`, diagnostics); }
        sourceToAssembled[commit.sha] = git(worktree, ['rev-parse', 'HEAD']).stdout.trim();
      }
      const candidateAfterLane = git(worktree, ['rev-parse', 'HEAD']).stdout.trim();
      writeJson(path.join(outputDir, `changed-files-after-${lane.lane}.json`), verifyFinalChangedFiles(worktree, policy.authorizedBase, candidateAfterLane, fileOwners, policy));
      appliedLanes.push(lane.lane);
      if (lane.lane === 'releaseTooling') {
        if (sourceOverlay) verifyLandedOverlay(worktree, sourceOverlay);
        ensureNpmInstalled(worktree, summary.tests, logDir, `post-${lane.lane}`);
      }
      runWaveTests(worktree, policy.lanes[lane.lane].testProfile, lane.lane, summary.tests, logDir, sourceOverlay ? { overlay: sourceOverlay, includedLanes, appliedLanes: [...appliedLanes], contextDirectory: path.join(outputDir, 'source-wave-contexts') } : null);
    }
    summary.finalCandidateSha = git(worktree, ['rev-parse', 'HEAD']).stdout.trim();
    summary.finalTreeSha = git(worktree, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
    summary.changedFiles = verifyFinalChangedFiles(worktree, policy.authorizedBase, summary.finalCandidateSha, fileOwners, policy); writeJson(path.join(outputDir, 'changed-file-manifest.json'), summary.changedFiles);
    summary.authorityToCommit = Object.fromEntries(laneInspections.map((lane) => [lane.lane, { skipped: lane.entry.skip, authorities: lane.entry.authorities, sourceCommits: lane.commits.map((commit) => commit.sha), assembledCommits: lane.commits.map((commit) => sourceToAssembled[commit.sha]) }]));
    writeJson(path.join(outputDir, 'authority-to-commit-manifest.json'), summary.authorityToCommit);
    summary.browserCertification = runFinalHarness(worktree, summary.tests, logDir, includedLanes.length === policy.laneOrder.length);
    summary.buildArtifact = hashBuildArtifact(path.join(worktree, 'dist')); writeJson(path.join(outputDir, 'build-artifact-manifest.json'), summary.buildArtifact);
    if (args.mode === 'EXECUTE') {
      const dryRunPath=path.resolve(args.expectedDryRunSummary);
      const dryRunBytes=fs.readFileSync(dryRunPath);
      const dryRun=JSON.parse(dryRunBytes.toString('utf8'));
      summary.dryRunIdentity=assertDryRunIdentity(dryRun,summary);
      summary.dryRunIdentity.evidenceSha256=crypto.createHash('sha256').update(dryRunBytes).digest('hex');
      writeJson(path.join(outputDir,'dry-run-identity-verification.json'),summary.dryRunIdentity);
      git(repoRoot, ['branch', args.integrationBranch, summary.finalCandidateSha]);
      const push = git(repoRoot, ['push', '--set-upstream', 'origin', args.integrationBranch], { allowFailure: true });
      if (push.exitCode !== 0) { git(repoRoot, ['branch', '-D', args.integrationBranch], { allowFailure: true }); throw new RcError(`Validated RC could not be pushed to ${args.integrationBranch}; local branch was removed and no force push was attempted.`, push); }
      summary.pushedIntegrationBranch = args.integrationBranch;
    }
    summary.status = 'PASS'; writeJson(path.join(outputDir, 'test-summary.json'), summary.tests); writeJson(path.join(outputDir, 'final-rc-summary.json'), summary); writeCloseout(path.join(outputDir, 'FINAL-RC-CLOSEOUT.md'), summary);
    console.log(`FINAL RC ASSEMBLER: PASS\nMode: ${args.mode}\nCandidate: ${summary.finalCandidateSha}\nTree: ${summary.finalTreeSha}\nBuild SHA-256: ${summary.buildArtifact.hash}\nSource-assembly rollback only (not production LKG): ${summary.rollbackPoint}\nOutput: ${outputDir}`);
  } catch (error) {
    summary.status = 'FAIL'; summary.failure = { message: error instanceof Error ? error.message : String(error), details: error instanceof RcError ? error.details : {} }; writeJson(path.join(outputDir, 'test-summary.json'), summary.tests); writeJson(path.join(outputDir, 'final-rc-summary.json'), summary); console.error(`FINAL RC ASSEMBLER: FAIL\n${summary.failure.message}\nEvidence: ${outputDir}`); process.exitCode = 1;
  } finally { if (worktree) { git(repoRoot, ['worktree', 'remove', '--force', worktree], { allowFailure: true }); fs.rmSync(worktree, { recursive: true, force: true }); } }
}

// The separate owner-authorized emergency orchestrator shares these unchanged primitives.
export { RcError, readJson, parseArgs, git, sha256Text, canonicalize, manifestHash, validateManifestShape, findRepoRoot, verifyRepositoryIdentity, ensureCommit, preflightExecuteBranch, normalizeLaneEntry, validateAuthorities, expandLane, validateCommitAndFootprint, validateDuplicatesAndCollisions, writeJson, ensureNpmInstalled, commitIdentity, collectConflictDiagnostics, verifyFinalChangedFiles, hashBuildArtifact, writeCloseout, runGate, packageScripts };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
