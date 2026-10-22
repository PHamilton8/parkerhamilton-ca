import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RELEASE_REPOSITORY = 'PHamilton8/parkerhamilton-ca';
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const CI_PROVENANCE_FILE = 'ci-provenance.json';
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED_JOBS = ['quality', 'browser'];
const MAX_ARCHIVE_BYTES = 64 * 1024;
const MAX_JSON_BYTES = 8 * 1024;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function completeList(body, key, message) {
  assert.ok(object(body) && Array.isArray(body[key]) && Number.isSafeInteger(body.total_count)
    && body.total_count >= 0 && body.total_count <= 100 && body.total_count === body[key].length, message);
  return body[key];
}

/** Select first, then inspect its status: older success never masks a newer run. */
export function latestCiRun(body, sha, workflowId) {
  assert.match(sha ?? '', SHA, 'Exact candidate SHA required');
  assert.ok(positive(workflowId), 'CI workflow identity required');
  const runs = completeList(body, 'workflow_runs', 'CI run listing must be complete and bounded');
  assert.ok(runs.length > 0, 'Exact-SHA CI evidence required');
  const ids = new Set();
  const numbers = new Set();
  for (const run of runs) {
    assert.ok(object(run), 'Invalid CI run');
    assert.equal(run.head_sha, sha, 'CI source SHA mismatch');
    assert.equal(run.workflow_id, workflowId, 'CI workflow identity mismatch');
    assert.ok(positive(run.id) && positive(run.run_number) && positive(run.run_attempt), 'Complete run and attempt identity required');
    // The listing contains the latest attempt of each run, not one row per attempt.
    assert.ok(!ids.has(run.id) && !numbers.has(run.run_number), 'Ambiguous CI run listing');
    ids.add(run.id);
    numbers.add(run.run_number);
  }
  return [...runs].sort((a, b) => b.run_number - a.run_number)[0];
}

export function assertSuccessfulRun(run, repository, workflowPath) {
  assert.equal(repository, RELEASE_REPOSITORY, 'Only the reviewed repository is permitted');
  assert.ok(object(run), 'Workflow run required');
  assert.equal(run.repository?.full_name, repository, 'Workflow repository mismatch');
  assert.equal(run.head_repository?.full_name, repository, 'Foreign source repository is not a reviewed release input');
  assert.equal(run.path, workflowPath, 'Unexpected creator workflow');
  assert.equal(run.status, 'completed', 'Latest workflow run is pending or in progress');
  assert.equal(run.conclusion, 'success', 'Latest workflow run did not succeed');
}

/** Read-only, injectable evidence collection; it creates no candidate or receipt. */
export async function verifyCiEvidence({ sha, checkoutSha, repository, readJson, readArtifact }) {
  assert.match(sha ?? '', SHA, 'Exact candidate SHA required');
  assert.equal(checkoutSha, sha, 'Release checkout must equal the requested candidate SHA');
  return collectCiEvidence({ sha, repository, readJson, readArtifact });
}

/** Promotion may use a different main commit only when its actual tree matches. */
export async function refreshPromotionCi({ manifest, mainSha, mainTree, candidateTree, repository, readJson, readArtifact }) {
  assert.equal(manifest?.schemaVersion, 2);
  assert.equal(manifest.status, 'REVIEW_CANDIDATE_UNPUBLISHED');
  assert.match(mainSha ?? '', SHA, 'Exact promotion checkout required');
  assert.match(manifest.sourceSha ?? '', SHA, 'Exact reviewed source required');
  assert.match(manifest.treeSha ?? '', SHA, 'Exact reviewed tree required');
  assert.equal(mainTree, manifest.treeSha, 'Promotion checkout tree differs from reviewed candidate');
  assert.equal(candidateTree, manifest.treeSha, 'Reviewed source commit tree differs from candidate receipt');
  const latest = await collectCiEvidence({ sha: manifest.sourceSha, repository, readJson, readArtifact });
  assert.deepEqual(latest, manifest.ciEvidence, 'Latest CI run, attempt or job evidence changed since candidate review');
  return { schemaVersion: 1, status: 'PROMOTION_CI_REVALIDATED', mainSha, mainTree,
    candidateSha: manifest.sourceSha, candidateTree, ciEvidence: latest };
}

async function collectCiEvidence({ sha, repository, readJson, readArtifact }) {
  assert.match(sha ?? '', SHA, 'Exact candidate SHA required');
  assert.equal(repository, RELEASE_REPOSITORY, 'Only the reviewed repository is permitted');
  assert.equal(typeof readJson, 'function', 'JSON reader required');
  assert.equal(typeof readArtifact, 'function', 'Artifact reader required');
  const repoPath = `/repos/${repository}`;
  const prefix = `${repoPath}/actions`;
  const workflow = await readJson(`${prefix}/workflows/ci.yml`);
  assert.equal(workflow.path, CI_WORKFLOW_PATH, 'Unexpected CI workflow');
  assert.ok(positive(workflow.id), 'CI workflow identity required');
  // Deliberately no status/event filter: a newer pending/failed run is decisive.
  const listPath = `${prefix}/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`;
  const run = latestCiRun(await readJson(listPath), sha, workflow.id);
  assertSuccessfulRun(run, repository, CI_WORKFLOW_PATH);
  assert.ok(positive(run.repository.id) && positive(run.head_repository.id), 'Repository IDs required');
  assert.equal(run.head_repository.id, run.repository.id, 'Foreign source repository identity');
  assert.ok(['push', 'pull_request'].includes(run.event), 'Unsupported CI event');

  const jobs = completeList(await readJson(`${prefix}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`),
    'jobs', 'Complete attempt job listing required');
  const artifacts = completeList(await readJson(`${prefix}/runs/${run.id}/artifacts?per_page=100`),
    'artifacts', 'Complete provenance listing required');
  const commit = await readJson(`${repoPath}/git/commits/${sha}`);
  assert.equal(commit.sha, sha, 'Candidate commit identity mismatch');
  assert.match(commit.tree?.sha ?? '', SHA, 'Candidate tree identity required');
  const sourceWorkflow = await readJson(`${repoPath}/contents/${CI_WORKFLOW_PATH}?ref=${sha}`);
  assert.equal(sourceWorkflow.type, 'file', 'Candidate CI workflow must be a file');
  assert.equal(sourceWorkflow.path, CI_WORKFLOW_PATH, 'Candidate CI workflow path mismatch');
  assert.match(sourceWorkflow.sha ?? '', SHA, 'Candidate CI workflow blob required');

  const requiredJobs = [];
  for (const name of REQUIRED_JOBS) {
    const matches = jobs.filter((job) => job?.name === name);
    assert.equal(matches.length, 1, `Exactly one required ${name} job must exist in the latest attempt`);
    const job = matches[0];
    assert.ok(positive(job.id), 'Job identity required');
    assert.equal(job.run_id, run.id, 'Job creator run mismatch');
    assert.equal(job.head_sha, sha, 'Job source SHA mismatch');
    // GitHub's attempt-specific jobs response does not always include this field.
    if (job.run_attempt !== undefined) assert.equal(job.run_attempt, run.run_attempt, 'Stale job attempt');
    assert.equal(job.status, 'completed', `Required ${name} job is incomplete`);
    assert.equal(job.conclusion, 'success', `Required ${name} job failed or was skipped`);
    const artifactName = `ci-provenance-${run.id}-${run.run_attempt}-${name}`;
    const found = artifacts.filter((item) => item?.name === artifactName);
    assert.equal(found.length, 1, 'Unique per-job checkout provenance required');
    const artifact = found[0];
    assert.ok(positive(artifact.id), 'Artifact identity required');
    assert.equal(artifact.expired, false, 'Fresh per-job checkout provenance required');
    assert.ok(positive(artifact.size_in_bytes) && artifact.size_in_bytes <= MAX_ARCHIVE_BYTES, 'Provenance artifact exceeds its size bound');
    assert.equal(artifact.workflow_run?.id, run.id, 'Artifact creator run mismatch');
    assert.equal(artifact.workflow_run?.head_sha, sha, 'Artifact creator source mismatch');
    assert.equal(artifact.workflow_run?.repository_id, run.repository.id, 'Artifact repository mismatch');
    assert.equal(artifact.workflow_run?.head_repository_id, run.head_repository.id, 'Artifact source repository mismatch');
    const provenance = await readArtifact(artifact.id);
    assert.ok(object(provenance), 'Provenance JSON object required');
    assert.equal(provenance.schemaVersion, 1, 'Unsupported CI provenance schema');
    assert.equal(provenance.repository, repository, 'Provenance repository mismatch');
    assert.equal(provenance.repositoryId, run.repository.id, 'Provenance repository identity mismatch');
    assert.equal(provenance.workflowPath, CI_WORKFLOW_PATH, 'Provenance workflow mismatch');
    assert.equal(provenance.runId, run.id, 'Provenance creator run mismatch');
    assert.equal(provenance.runAttempt, run.run_attempt, 'Stale provenance attempt');
    assert.equal(provenance.job, name, 'Provenance job mismatch');
    assert.equal(provenance.expectedSha, sha, 'Provenance expected source mismatch');
    assert.equal(provenance.checkoutSha, sha, 'PR head metadata alone is insufficient: actual checkout differs');
    assert.equal(provenance.checkoutTree, commit.tree.sha, 'Provenance checkout tree mismatch');
    assert.equal(provenance.workflowBlobSha, sourceWorkflow.sha, 'Provenance workflow blob mismatch');
    assert.equal(provenance.cleanTrackedTree, true, 'Tracked CI source changed during checks');
    // Explicit projection prevents untrusted JSON from overwriting retained IDs.
    requiredJobs.push({ name, jobId: job.id, artifactId: artifact.id, artifactName,
      runId: run.id, runAttempt: run.run_attempt, repository, repositoryId: run.repository.id,
      expectedSha: sha, checkoutSha: provenance.checkoutSha, checkoutTree: provenance.checkoutTree,
      workflowPath: CI_WORKFLOW_PATH, workflowBlobSha: provenance.workflowBlobSha,
      cleanTrackedTree: true, conclusion: job.conclusion });
  }
  assert.notEqual(requiredJobs[0].jobId, requiredJobs[1].jobId, 'Required jobs share an identity');
  assert.notEqual(requiredJobs[0].artifactId, requiredJobs[1].artifactId, 'Required artifacts share an identity');
  const newest = latestCiRun(await readJson(listPath), sha, workflow.id);
  assertSuccessfulRun(newest, repository, CI_WORKFLOW_PATH);
  assert.equal(newest.id, run.id, 'CI run changed during evidence collection');
  assert.equal(newest.run_number, run.run_number, 'CI run number changed during evidence collection');
  assert.equal(newest.run_attempt, run.run_attempt, 'CI attempt changed during evidence collection');
  return { schemaVersion: 1, repository, repositoryId: run.repository.id, sha, checkoutSha: requiredJobs[0].checkoutSha,
    checkoutTree: commit.tree.sha, workflowBlobSha: sourceWorkflow.sha, workflowPath: CI_WORKFLOW_PATH,
    workflowRunId: run.id, runNumber: run.run_number, runAttempt: run.run_attempt,
    workflowId: workflow.id, event: run.event, conclusion: run.conclusion, requiredJobs };
}

// zipfile parses the archive without extracting anything or trusting member paths.
// A tiny compressed archive can otherwise conceal a much larger JSON member.
const DECODE_PROVENANCE = `import io,json,stat,sys,zipfile
def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('duplicate JSON key')
        result[key]=value
    return result
data=sys.stdin.buffer.read(${MAX_ARCHIVE_BYTES + 1})
if len(data)>${MAX_ARCHIVE_BYTES}: raise ValueError('archive too large')
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    members=archive.infolist()
    if len(members)!=1: raise ValueError('unexpected archive members')
    member=members[0]
    mode=stat.S_IFMT(member.external_attr >> 16)
    if member.filename!='${CI_PROVENANCE_FILE}' or member.is_dir() or mode not in (0,stat.S_IFREG): raise ValueError('invalid archive member')
    if member.flag_bits & 1 or member.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED): raise ValueError('unsupported archive member')
    if member.file_size<=0 or member.file_size>${MAX_JSON_BYTES} or member.compress_size>${MAX_ARCHIVE_BYTES}: raise ValueError('member too large')
    with archive.open(member) as stream:
        raw=stream.read(${MAX_JSON_BYTES + 1})
    if len(raw)>${MAX_JSON_BYTES}: raise ValueError('member too large')
    result=json.loads(raw.decode('utf-8'),object_pairs_hook=unique_object)
    if not isinstance(result,dict): raise ValueError('JSON object required')
    sys.stdout.write(json.dumps(result,separators=(',',':'),ensure_ascii=True))
`;

export function parseCiProvenanceArchive(bytes) {
  try {
    assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= MAX_ARCHIVE_BYTES);
    const decoded = execFileSync('python3', ['-I', '-c', DECODE_PROVENANCE], {
      input: bytes, timeout: 5000, maxBuffer: MAX_JSON_BYTES * 6, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const result = JSON.parse(decoded.toString('utf8'));
    assert.ok(object(result));
    return result;
  } catch {
    throw new Error('CI provenance archive is invalid or exceeds its bounds');
  }
}

function trustedDownloadUrl(value) {
  const url = new URL(value);
  // Documented artifact hosts, restricted at DNS label boundaries:
  // https://docs.github.com/en/actions/reference/runners/github-hosted-runners#communication-requirements-for-github-hosted-runners
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash);
  assert.ok(url.hostname === 'results-receiver.actions.githubusercontent.com'
    || /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(url.hostname));
  return url;
}

async function boundedBody(response) {
  const length = response.headers.get('content-length');
  assert.ok(length === null || (/^\d+$/.test(length) && Number(length) <= MAX_ARCHIVE_BYTES));
  assert.ok(response.body, 'Archive body required');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    assert.ok(size <= MAX_ARCHIVE_BYTES, 'Archive exceeds its bound');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

/** Auth is sent once to api.github.com; signed download hops receive no headers. */
export async function readCiProvenanceArtifact({ repository, artifactId, headers, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    assert.equal(repository, RELEASE_REPOSITORY);
    assert.ok(positive(artifactId) && typeof fetchImpl === 'function');
    // GitHub documents a 302 Location response, not an authenticated archive body:
    // https://docs.github.com/en/rest/actions/artifacts#download-an-artifact
    let response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`, {
      method: 'GET', headers, redirect: 'manual', credentials: 'omit', signal: controller.signal,
    });
    assert.equal(response.status, 302);
    let next = trustedDownloadUrl(response.headers.get('location'));
    await response.body?.cancel();
    for (let hop = 0; hop < 4; hop++) {
      response = await fetchImpl(next.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        next = trustedDownloadUrl(new URL(response.headers.get('location'), next).href);
        await response.body?.cancel();
        continue;
      }
      assert.equal(response.status, 200);
      return parseCiProvenanceArchive(await boundedBody(response));
    }
    throw new Error('Too many archive redirects');
  } catch {
    // Never surface an authorization header, signed URL, HTTP body or member path.
    throw new Error('CI provenance artifact download or decoding failed');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Called only after all job checks succeed; upload remains a separate CI step. */
export function writeCiProvenance(env = process.env) {
  assert.equal(env.GITHUB_REPOSITORY, RELEASE_REPOSITORY, 'Unexpected CI repository');
  assert.ok(REQUIRED_JOBS.includes(env.GITHUB_JOB), 'Unexpected CI job');
  assert.match(env.EXPECTED_SOURCE_SHA ?? '', SHA, 'Exact source SHA required');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const checkoutSha = git('rev-parse', '--verify', 'HEAD');
  assert.equal(checkoutSha, env.EXPECTED_SOURCE_SHA, 'Actual CI checkout differs from requested source');
  const checkoutTree = git('rev-parse', '--verify', 'HEAD^{tree}');
  const workflowBlobSha = git('rev-parse', '--verify', `HEAD:${CI_WORKFLOW_PATH}`);
  assert.match(checkoutTree, SHA);
  assert.match(workflowBlobSha, SHA);
  git('diff', '--quiet', 'HEAD', '--');
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  const repositoryId = Number(env.GITHUB_REPOSITORY_ID);
  assert.ok(positive(runId) && positive(runAttempt) && positive(repositoryId), 'Complete CI identity required');
  const provenance = { schemaVersion: 1, repository: RELEASE_REPOSITORY, repositoryId,
    workflowPath: CI_WORKFLOW_PATH, runId, runAttempt, job: env.GITHUB_JOB,
    expectedSha: env.EXPECTED_SOURCE_SHA, checkoutSha, checkoutTree, workflowBlobSha, cleanTrackedTree: true };
  const output = JSON.stringify(provenance, null, 2) + '\n';
  assert.ok(Buffer.byteLength(output) <= MAX_JSON_BYTES);
  mkdirSync('.ci-provenance', { recursive: true });
  writeFileSync(`.ci-provenance/${CI_PROVENANCE_FILE}`, output, { flag: 'wx' });
  return provenance;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2], 'write-provenance', 'Expected write-provenance command');
  assert.equal(process.argv.length, 3, 'Unexpected provenance command arguments');
  writeCiProvenance();
}
