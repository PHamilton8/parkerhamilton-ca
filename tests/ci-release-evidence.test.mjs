import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RELEASE_REPOSITORY, CI_WORKFLOW_PATH, assertSuccessfulRun, latestCiRun,
  parseCiProvenanceArchive, readCiProvenanceArtifact, verifyCiEvidence, refreshPromotionCi } from '../scripts/ci-release-evidence.mjs';

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);
const OTHER = 'd'.repeat(40);
const REPOSITORY_ID = 42;
const WORKFLOW_ID = 7;
const runFixture = (overrides = {}) => ({ id: 301, run_number: 20, run_attempt: 2, workflow_id: WORKFLOW_ID,
  head_sha: SHA, path: CI_WORKFLOW_PATH, event: 'pull_request', status: 'completed', conclusion: 'success',
  repository: { full_name: RELEASE_REPOSITORY, id: REPOSITORY_ID },
  head_repository: { full_name: RELEASE_REPOSITORY, id: REPOSITORY_ID }, ...overrides });
const list = (items, key) => ({ total_count: items.length, [key]: items });

function fixtures() {
  const run = runFixture();
  const state = { run, listings: null, paths: [], artifactReads: [],
    jobs: ['quality', 'browser'].map((name, index) => ({ name, id: 501 + index,
      run_id: run.id, head_sha: SHA, run_attempt: run.run_attempt, status: 'completed', conclusion: 'success' })),
    artifacts: ['quality', 'browser'].map((name, index) => ({ id: 601 + index,
      name: `ci-provenance-${run.id}-${run.run_attempt}-${name}`, expired: false, size_in_bytes: 400,
      workflow_run: { id: run.id, head_sha: SHA, repository_id: REPOSITORY_ID, head_repository_id: REPOSITORY_ID } })),
    provenance: ['quality', 'browser'].map((job) => ({ schemaVersion: 1, repository: RELEASE_REPOSITORY,
      repositoryId: REPOSITORY_ID, workflowPath: CI_WORKFLOW_PATH, runId: run.id, runAttempt: run.run_attempt,
      job, expectedSha: SHA, checkoutSha: SHA, checkoutTree: TREE, workflowBlobSha: BLOB, cleanTrackedTree: true })),
    sourceCommit: { sha: SHA, tree: { sha: TREE } }, sourceWorkflow: { type: 'file', path: CI_WORKFLOW_PATH, sha: BLOB },
    workflow: { id: WORKFLOW_ID, path: CI_WORKFLOW_PATH } };
  let listingIndex = 0;
  const readJson = async (path) => {
    state.paths.push(path);
    if (path === `/repos/${RELEASE_REPOSITORY}/actions/workflows/ci.yml`) return state.workflow;
    if (path === `/repos/${RELEASE_REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${SHA}&per_page=100`) {
      return state.listings ? state.listings[Math.min(listingIndex++, state.listings.length - 1)] : list([state.run], 'workflow_runs');
    }
    if (path === `/repos/${RELEASE_REPOSITORY}/actions/runs/${state.run.id}/attempts/${state.run.run_attempt}/jobs?per_page=100`) {
      return state.jobsBody ?? list(state.jobs, 'jobs');
    }
    if (path === `/repos/${RELEASE_REPOSITORY}/actions/runs/${state.run.id}/artifacts?per_page=100`) {
      return state.artifactsBody ?? list(state.artifacts, 'artifacts');
    }
    if (path === `/repos/${RELEASE_REPOSITORY}/git/commits/${SHA}`) return state.sourceCommit;
    if (path === `/repos/${RELEASE_REPOSITORY}/contents/${CI_WORKFLOW_PATH}?ref=${SHA}`) return state.sourceWorkflow;
    throw new Error(`Unexpected synthetic read: ${path}`);
  };
  const readArtifact = async (id) => { state.artifactReads.push(id); return state.provenance[state.artifacts.findIndex((item) => item.id === id)]; };
  return { state, readJson, readArtifact, verify: (overrides = {}) => verifyCiEvidence({ sha: SHA, checkoutSha: SHA,
    repository: RELEASE_REPOSITORY, readJson, readArtifact, ...overrides }) };
}

test('retains bounded exact-SHA latest-attempt evidence from both successful jobs', async () => {
  const { state, verify } = fixtures();
  const evidence = await verify();
  assert.equal(evidence.workflowRunId, 301);
  assert.equal(evidence.runAttempt, 2);
  assert.equal(evidence.checkoutTree, TREE);
  assert.equal(evidence.workflowBlobSha, BLOB);
  assert.equal(evidence.repository, RELEASE_REPOSITORY);
  assert.deepEqual(evidence.requiredJobs.map(({ name, jobId, artifactId, runAttempt }) => ({ name, jobId, artifactId, runAttempt })), [
    { name: 'quality', jobId: 501, artifactId: 601, runAttempt: 2 },
    { name: 'browser', jobId: 502, artifactId: 602, runAttempt: 2 },
  ]);
  assert.ok(state.paths.some((path) => path.includes('/attempts/2/jobs?')));
  assert.equal(state.paths.filter((path) => path.includes('/runs?head_sha=')).length, 2);
  assert.ok(state.paths.every((path) => !path.includes('status=') && !path.includes('event=')));
});

test('attempt-specific endpoint remains authoritative when GitHub omits job.run_attempt', async () => {
  const { state, verify } = fixtures();
  state.jobs.forEach((job) => delete job.run_attempt);
  assert.equal((await verify()).runAttempt, 2);
});

async function promotionFixture() {
  const fixture = fixtures();
  const ciEvidence = await fixture.verify();
  const manifest = { schemaVersion: 2, status: 'REVIEW_CANDIDATE_UNPUBLISHED', sourceSha: SHA, treeSha: TREE, ciEvidence };
  fixture.state.paths.length = 0;
  fixture.state.artifactReads.length = 0;
  return { ...fixture, manifest, promote: (overrides = {}) => refreshPromotionCi({ manifest,
    mainSha: OTHER, mainTree: TREE, candidateTree: TREE, repository: RELEASE_REPOSITORY,
    readJson: fixture.readJson, readArtifact: fixture.readArtifact, ...overrides }) };
}

test('promotion refreshes both required jobs and accepts a different main SHA only with the reviewed tree', async () => {
  const { state, manifest, promote } = await promotionFixture();
  const result = await promote();
  assert.equal(result.status, 'PROMOTION_CI_REVALIDATED');
  assert.equal(result.mainSha, OTHER);
  assert.equal(result.candidateSha, SHA);
  assert.deepEqual(result.ciEvidence, manifest.ciEvidence);
  assert.deepEqual(state.artifactReads, [601, 602]);
  assert.equal(state.paths.filter((pathname) => pathname.includes('/runs?head_sha=' + SHA)).length, 2);
  assert.ok(state.paths.every((pathname) => !pathname.includes(OTHER)));
});

for (const newer of [
  { status: 'queued', conclusion: null }, { status: 'in_progress', conclusion: null },
  { status: 'completed', conclusion: 'failure' },
]) test(`promotion rejects saved success after newer ${newer.status}/${newer.conclusion} CI`, async () => {
  const { state, promote } = await promotionFixture();
  state.listings = [list([state.run, runFixture({ id: 302, run_number: 21, run_attempt: 1, ...newer })], 'workflow_runs')];
  await assert.rejects(promote(), /Latest workflow run/);
  assert.equal(state.artifactReads.length, 0);
});

for (const change of ['new successful run', 'new successful attempt']) test(`promotion requires review again after ${change}`, async () => {
  const { state, promote } = await promotionFixture();
  if (change === 'new successful run') { state.run.id = 302; state.run.run_number = 21; }
  else state.run.run_attempt = 3;
  state.jobs.forEach((job) => { job.id += 10; job.run_id = state.run.id; job.run_attempt = state.run.run_attempt; });
  state.artifacts.forEach((artifact, index) => {
    artifact.id += 10;
    artifact.name = `ci-provenance-${state.run.id}-${state.run.run_attempt}-${state.jobs[index].name}`;
    artifact.workflow_run.id = state.run.id;
  });
  state.provenance.forEach((item) => { item.runId = state.run.id; item.runAttempt = state.run.run_attempt; });
  await assert.rejects(promote(), /changed since candidate review/);
  assert.deepEqual(state.artifactReads, [611, 612]);
});

test('promotion fails closed on changed main/source tree, checkout provenance, or unavailable current CI', async () => {
  const { state, promote } = await promotionFixture();
  await assert.rejects(promote({ mainTree: OTHER }), /checkout tree differs/);
  await assert.rejects(promote({ candidateTree: OTHER }), /source commit tree differs/);
  assert.equal(state.paths.length, 0);
  state.provenance[1].checkoutSha = OTHER;
  await assert.rejects(promote(), /actual checkout differs/);
  await assert.rejects(promote({ readJson: async () => { throw new Error('synthetic network failure'); } }), /synthetic network failure/);
});

test('canonical evidence cannot be overwritten by extra provenance JSON properties', async () => {
  const { state, verify } = fixtures();
  Object.assign(state.provenance[0], { artifactId: 999, jobId: 999, name: 'spoof', conclusion: 'failure' });
  const result = (await verify()).requiredJobs[0];
  assert.equal(result.artifactId, 601);
  assert.equal(result.jobId, 501);
  assert.equal(result.name, 'quality');
  assert.equal(result.conclusion, 'success');
});

for (const newer of [
  { status: 'queued', conclusion: null }, { status: 'in_progress', conclusion: null },
  { status: 'completed', conclusion: 'failure' }, { status: 'completed', conclusion: 'cancelled' },
]) test(`newer ${newer.status}/${newer.conclusion} CI run blocks older success`, async () => {
  const { state, verify } = fixtures();
  const latest = runFixture({ id: 302, run_number: 21, run_attempt: 1, ...newer });
  state.listings = [list([state.run, latest], 'workflow_runs')];
  await assert.rejects(verify(), /Latest workflow run/);
  assert.equal(state.artifactReads.length, 0);
});

test('latest run ordering uses monotonic workflow run_number, independent of array order', () => {
  const older = runFixture({ id: 302, run_number: 19, run_attempt: 9 });
  assert.equal(latestCiRun(list([older, runFixture()], 'workflow_runs'), SHA, WORKFLOW_ID).id, 301);
});

for (const [label, mutate] of [
  ['truncated run listing', (s) => { s.listings = [{ total_count: 2, workflow_runs: [s.run] }]; }],
  ['oversized run listing', (s) => { s.listings = [{ total_count: 101, workflow_runs: [s.run] }]; }],
  ['duplicate run identities', (s) => { s.listings = [list([s.run, { ...s.run }], 'workflow_runs')]; }],
  ['ambiguous run numbers', (s) => { s.listings = [list([s.run, { ...s.run, id: 302 }], 'workflow_runs')]; }],
  ['wrong workflow identity', (s) => { s.run.workflow_id = 8; }],
  ['wrong workflow path', (s) => { s.run.path += '@refs/heads/other'; }],
  ['foreign workflow repository', (s) => { s.run.repository.full_name = 'other/repo'; }],
  ['foreign head repository', (s) => { s.run.head_repository.full_name = 'other/repo'; }],
  ['foreign head repository ID', (s) => { s.run.head_repository.id = 43; }],
  ['wrong source metadata', (s) => { s.run.head_sha = OTHER; }],
  ['unsupported run event', (s) => { s.run.event = 'workflow_dispatch'; }],
  ['missing attempt', (s) => { delete s.run.run_attempt; }],
  ['missing quality job', (s) => { s.jobs.shift(); }],
  ['duplicate required job', (s) => { s.jobs.push({ ...s.jobs[0], id: 503 }); }],
  ['skipped browser job', (s) => { s.jobs[1].conclusion = 'skipped'; }],
  ['pending browser job', (s) => { s.jobs[1].status = 'in_progress'; }],
  ['wrong job run', (s) => { s.jobs[1].run_id = 999; }],
  ['stale job attempt', (s) => { s.jobs[1].run_attempt = 1; }],
  ['wrong job head SHA', (s) => { s.jobs[1].head_sha = OTHER; }],
  ['invalid job ID', (s) => { s.jobs[0].id = 0; }],
  ['shared job ID', (s) => { s.jobs[1].id = s.jobs[0].id; }],
  ['truncated jobs', (s) => { s.jobsBody = { total_count: 3, jobs: s.jobs }; }],
  ['stale attempt artifact name', (s) => { s.artifacts[0].name = 'ci-provenance-301-1-quality'; }],
  ['expired provenance artifact', (s) => { s.artifacts[0].expired = true; }],
  ['missing expiration metadata', (s) => { delete s.artifacts[0].expired; }],
  ['duplicate provenance artifacts', (s) => { s.artifacts.push({ ...s.artifacts[0], id: 603 }); }],
  ['invalid artifact ID', (s) => { s.artifacts[0].id = 0; }],
  ['oversized artifact', (s) => { s.artifacts[0].size_in_bytes = 65537; }],
  ['wrong artifact creator run', (s) => { s.artifacts[0].workflow_run.id = 999; }],
  ['wrong artifact creator SHA', (s) => { s.artifacts[0].workflow_run.head_sha = OTHER; }],
  ['foreign artifact repository', (s) => { s.artifacts[0].workflow_run.repository_id = 43; }],
  ['foreign artifact head repository', (s) => { s.artifacts[0].workflow_run.head_repository_id = 43; }],
  ['truncated artifacts', (s) => { s.artifactsBody = { total_count: 3, artifacts: s.artifacts }; }],
  ['wrong provenance schema', (s) => { s.provenance[0].schemaVersion = 2; }],
  ['foreign provenance repository', (s) => { s.provenance[0].repository = 'other/repo'; }],
  ['foreign provenance repository ID', (s) => { s.provenance[0].repositoryId = 43; }],
  ['foreign provenance workflow', (s) => { s.provenance[0].workflowPath = '.github/workflows/other.yml'; }],
  ['wrong provenance creator run', (s) => { s.provenance[0].runId = 999; }],
  ['stale provenance attempt', (s) => { s.provenance[0].runAttempt = 1; }],
  ['wrong provenance job', (s) => { s.provenance[0].job = 'browser'; }],
  ['wrong expected provenance source', (s) => { s.provenance[0].expectedSha = OTHER; }],
  ['PR synthetic merge checkout', (s) => { s.provenance[0].checkoutSha = OTHER; }],
  ['wrong checkout tree', (s) => { s.provenance[0].checkoutTree = OTHER; }],
  ['wrong workflow blob', (s) => { s.provenance[0].workflowBlobSha = OTHER; }],
  ['modified tracked source', (s) => { s.provenance[0].cleanTrackedTree = false; }],
  ['wrong candidate commit', (s) => { s.sourceCommit.sha = OTHER; }],
  ['wrong candidate workflow path', (s) => { s.sourceWorkflow.path = 'other.yml'; }],
]) test(`rejects ${label}`, async () => {
  const { state, verify } = fixtures();
  mutate(state);
  await assert.rejects(verify());
});

test('release checkout must equal the requested candidate SHA before reading evidence', async () => {
  const { state, verify } = fixtures();
  await assert.rejects(verify({ checkoutSha: OTHER }), /Release checkout/);
  assert.equal(state.paths.length, 0);
});

test('wrong requested repository fails before any reader call', async () => {
  const { state, verify } = fixtures();
  await assert.rejects(verify({ repository: 'other/repo' }), /reviewed repository/);
  assert.equal(state.paths.length, 0);
});

for (const [label, change] of [
  ['new run', { id: 302, run_number: 21 }], ['new attempt', { run_attempt: 3 }],
  ['newer pending run', { id: 302, run_number: 21, status: 'queued', conclusion: null }],
  ['latest run becomes failed', { conclusion: 'failure' }],
]) test(`collection race rejects ${label}`, async () => {
  const { state, verify } = fixtures();
  state.listings = [list([state.run], 'workflow_runs'), list([runFixture(change)], 'workflow_runs')];
  await assert.rejects(verify(), /Latest workflow run|changed during evidence collection/);
  assert.equal(state.artifactReads.length, 2);
});

test('assertSuccessfulRun can validate retained helper creator identity', () => {
  assert.doesNotThrow(() => assertSuccessfulRun(runFixture(), RELEASE_REPOSITORY, CI_WORKFLOW_PATH));
  assert.throws(() => assertSuccessfulRun(runFixture({ path: 'other.yml' }), RELEASE_REPOSITORY, CI_WORKFLOW_PATH));
});

function archive(entries = [{ name: 'ci-provenance.json', text: '{"schemaVersion":1}' }]) {
  return execFileSync('python3', ['-I', '-c', `import io,json,stat,sys,warnings,zipfile
out=io.BytesIO()
with warnings.catch_warnings():
    warnings.simplefilter('ignore',UserWarning)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
        for entry in json.load(sys.stdin):
            info=zipfile.ZipInfo(entry['name'])
            info.compress_type=zipfile.ZIP_DEFLATED
            if entry.get('symlink'): info.external_attr=(stat.S_IFLNK|0o777)<<16
            target.writestr(info,entry['text'])
sys.stdout.buffer.write(out.getvalue())`], { input: JSON.stringify(entries), maxBuffer: 128 * 1024 });
}

test('standard-library ZIP decoder accepts one bounded provenance object', () => {
  assert.deepEqual(parseCiProvenanceArchive(archive()), { schemaVersion: 1 });
});

for (const [label, entries] of [
  ['extra archive member', [{ name: 'ci-provenance.json', text: '{}' }, { name: 'secret.txt', text: 'PRIVATE' }]],
  ['duplicate member', [{ name: 'ci-provenance.json', text: '{}' }, { name: 'ci-provenance.json', text: '{}' }]],
  ['nested path', [{ name: 'dir/ci-provenance.json', text: '{}' }]],
  ['traversal path', [{ name: '../ci-provenance.json', text: '{}' }]],
  ['directory', [{ name: 'ci-provenance.json/', text: '' }]],
  ['symlink', [{ name: 'ci-provenance.json', text: '{}', symlink: true }]],
  ['empty archive', []],
  ['malformed JSON', [{ name: 'ci-provenance.json', text: 'PRIVATE invalid JSON' }]],
  ['duplicate JSON keys', [{ name: 'ci-provenance.json', text: '{"runId":1,"runId":2}' }]],
  ['JSON array', [{ name: 'ci-provenance.json', text: '[]' }]],
  ['JSON null', [{ name: 'ci-provenance.json', text: 'null' }]],
  ['oversized uncompressed JSON', [{ name: 'ci-provenance.json', text: JSON.stringify({ payload: 'x'.repeat(9000) }) }]],
]) test(`archive decoder rejects ${label} without exposing contents`, () => {
  assert.throws(() => parseCiProvenanceArchive(archive(entries)), (error) => {
    assert.equal(error.message, 'CI provenance archive is invalid or exceeds its bounds');
    assert.ok(!error.message.includes('PRIVATE'));
    return true;
  });
});

test('archive decoder rejects corrupt, truncated and oversized archives', () => {
  const valid = archive();
  for (const input of [Buffer.from('not a ZIP PRIVATE'), valid.subarray(0, 20), Buffer.alloc(65537), Buffer.alloc(0)]) {
    assert.throws(() => parseCiProvenanceArchive(input), /invalid or exceeds its bounds/);
  }
  const corrupt = Buffer.from(valid);
  // Standard zipfile writer stores the first compressed byte after this header/name.
  corrupt[30 + Buffer.byteLength('ci-provenance.json')] ^= 0xff;
  assert.throws(() => parseCiProvenanceArchive(corrupt), /invalid or exceeds its bounds/);
});

const download = (fetchImpl, overrides = {}) => readCiProvenanceArtifact({ repository: RELEASE_REPOSITORY,
  artifactId: 601, headers: { Authorization: 'Bearer SYNTHETIC-NOT-A-TOKEN', Accept: 'application/vnd.github+json' }, fetchImpl, ...overrides });
const redirect = (location, status = 302) => new Response(null, { status, headers: { location } });

test('authenticated API redirect is manual; every signed hop is trusted and credential-free', async () => {
  const seen = [];
  const queue = [redirect('https://results-receiver.actions.githubusercontent.com/archive?sig=SYNTHETIC'),
    redirect('https://productionresults123.blob.core.windows.net/archive?sig=SYNTHETIC'), new Response(archive())];
  const result = await download(async (url, options) => { seen.push({ url, options }); return queue.shift(); });
  assert.deepEqual(result, { schemaVersion: 1 });
  assert.equal(seen.length, 3);
  assert.equal(seen[0].url, `https://api.github.com/repos/${RELEASE_REPOSITORY}/actions/artifacts/601/zip`);
  assert.equal(seen[0].options.headers.Authorization, 'Bearer SYNTHETIC-NOT-A-TOKEN');
  for (const { options } of seen) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
  }
  for (const { options } of seen.slice(1)) assert.equal(options.headers, undefined);
});

for (const location of [
  'http://productionresults123.blob.core.windows.net/archive',
  'https://productionresults123.blob.core.windows.net.evil.example/archive',
  'https://evilblob.core.windows.net.evil.example/archive',
  'https://blob.core.windows.net/archive',
  'https://evil.actions.githubusercontent.com/archive',
  'https://results-receiver.actions.githubusercontent.com.evil.example/archive',
  'https://api.github.com/archive', 'https://evil.example/archive',
  'https://user:pass@productionresults123.blob.core.windows.net/archive',
  'https://productionresults123.blob.core.windows.net:8443/archive',
  'https://productionresults123.blob.core.windows.net/archive#fragment',
]) test(`download rejects untrusted signed destination ${location}`, async () => {
  let reads = 0;
  await assert.rejects(download(async () => { reads++; return redirect(location); }), /artifact download or decoding failed/);
  assert.equal(reads, 1);
});

test('download validates later redirects and never follows an untrusted next hop', async () => {
  const queue = [redirect('https://productionresults123.blob.core.windows.net/archive'), redirect('https://evil.example/?sig=PRIVATE')];
  await assert.rejects(download(async () => queue.shift()), /artifact download or decoding failed/);
  assert.equal(queue.length, 0);
});

test('download redirect chain is bounded', async () => {
  let reads = 0;
  await assert.rejects(download(async () => { reads++; return redirect('https://productionresults123.blob.core.windows.net/archive'); }),
    /artifact download or decoding failed/);
  assert.equal(reads, 5);
});

test('download rejects authenticated 200 instead of treating it as an artifact', async () => {
  let reads = 0;
  await assert.rejects(download(async () => { reads++; return new Response(archive()); }), /artifact download or decoding failed/);
  assert.equal(reads, 1);
});

for (const [label, response] of [
  ['oversized Content-Length', () => new Response(archive(), { headers: { 'content-length': '65537' } })],
  ['oversized actual body', () => new Response(Buffer.alloc(65537))],
  ['lying Content-Length', () => new Response(Buffer.alloc(65537), { headers: { 'content-length': '1' } })],
  ['malformed Content-Length', () => new Response(archive(), { headers: { 'content-length': 'garbage' } })],
  ['HTTP error', () => new Response('PRIVATE signed response', { status: 403 })],
  ['invalid ZIP', () => new Response('PRIVATE signed response')],
]) test(`download rejects ${label} with sanitized error`, async () => {
  let reads = 0;
  await assert.rejects(download(async () => ++reads === 1
    ? redirect('https://productionresults123.blob.core.windows.net/archive?sig=PRIVATE') : response()), (error) => {
    assert.equal(error.message, 'CI provenance artifact download or decoding failed');
    assert.ok(!error.message.includes('PRIVATE') && !error.message.includes('SYNTHETIC-NOT-A-TOKEN'));
    return true;
  });
});

test('network exceptions are sanitized and wrong repository/ID never trigger a fetch', async () => {
  await assert.rejects(download(async () => { throw new Error('PRIVATE signed URL or authorization'); }),
    { message: 'CI provenance artifact download or decoding failed' });
  for (const overrides of [{ repository: 'other/repo' }, { artifactId: '../secret' }, { artifactId: 0 }]) {
    let reads = 0;
    await assert.rejects(download(async () => { reads++; }, overrides), /artifact download or decoding failed/);
    assert.equal(reads, 0);
  }
});

test('CI preserves every existing check and branch filter while attesting explicit source checkout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches: \[main, 'chore\/\*\*', 'feat\/\*\*', 'integration\/\*\*'\]/);
  for (const command of ['npm ci', 'npm run check', 'npm test', 'npm run build', 'npm run public-safety',
    'npm run qa:contrast', 'npm audit --audit-level=high', 'npx playwright install --with-deps chromium firefox webkit', 'npm run test:browser']) {
    assert.ok(workflow.includes(`- run: ${command}\n`), `Missing CI command: ${command}`);
  }
  assert.ok(!workflow.includes('--omit') && !workflow.includes('continue-on-error'));
  assert.match(workflow, /EXPECTED_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.equal(workflow.match(/ref: \$\{\{ env.EXPECTED_SOURCE_SHA \}\}/g)?.length, 2);
  assert.equal(workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE_SHA"/g)?.length, 2);
  assert.equal(workflow.match(/if: success\(\)\n        run: node scripts\/ci-release-evidence.mjs write-provenance/g)?.length, 2);
  assert.equal(workflow.match(/name: ci-provenance-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}-\$\{\{ github.job \}\}/g)?.length, 2);
  assert.match(workflow, /name: copy-locked-visual-review-baseline-\$\{\{ github.sha \}\}/);
});

test('provenance writer records actual Git objects and rejects synthetic checkout or tracked edits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-provenance-test-'));
  const script = fileURLToPath(new URL('../scripts/ci-release-evidence.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    mkdirSync(join(directory, '.github/workflows'), { recursive: true });
    writeFileSync(join(directory, CI_WORKFLOW_PATH), 'name: synthetic-ci\n');
    git('init', '--quiet');
    git('add', '.');
    git('-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'synthetic fixture');
    const sha = git('rev-parse', 'HEAD');
    const environment = { PATH: process.env.PATH, GITHUB_REPOSITORY: RELEASE_REPOSITORY, GITHUB_REPOSITORY_ID: '42',
      GITHUB_JOB: 'quality', GITHUB_RUN_ID: '301', GITHUB_RUN_ATTEMPT: '2', EXPECTED_SOURCE_SHA: sha };
    const invoke = (env = environment) => execFileSync(process.execPath, [script, 'write-provenance'], {
      cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    invoke();
    const result = JSON.parse(readFileSync(join(directory, '.ci-provenance/ci-provenance.json'), 'utf8'));
    assert.equal(result.checkoutSha, sha);
    assert.equal(result.expectedSha, sha);
    assert.equal(result.checkoutTree, git('rev-parse', 'HEAD^{tree}'));
    assert.equal(result.workflowBlobSha, git('rev-parse', `HEAD:${CI_WORKFLOW_PATH}`));
    assert.equal(result.runAttempt, 2);
    assert.equal(result.cleanTrackedTree, true);
    assert.throws(() => invoke(), /Command failed/); // no overwrite of previous evidence
    rmSync(join(directory, '.ci-provenance'), { recursive: true });
    assert.throws(() => invoke({ ...environment, EXPECTED_SOURCE_SHA: OTHER }), /Command failed/);
    assert.throws(() => invoke({ ...environment, GITHUB_JOB: 'other' }), /Command failed/);
    writeFileSync(join(directory, CI_WORKFLOW_PATH), 'name: modified-synthetic-ci\n');
    assert.throws(() => invoke(), /Command failed/);
    assert.throws(() => readFileSync(join(directory, '.ci-provenance/ci-provenance.json')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
