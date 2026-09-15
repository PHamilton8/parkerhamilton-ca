import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FINAL_BROWSERS = Object.freeze(['chromium', 'firefox', 'webkit']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

/** EXECUTE may publish only the complete candidate already proven by DRY-RUN. */
export function assertDryRunIdentity(dryRun, execution) {
  assert.equal(dryRun?.status, 'PASS', 'A passing DRY-RUN summary is required before publication.');
  assert.equal(dryRun.mode, 'DRY-RUN');
  assert.equal(execution.mode, 'EXECUTE');
  const lanes = ['homepage', 'wealthsimple', 'reporting', 'designDay', 'grocery', 'askWill', 'coast', 'compound', 'smith', 'releaseTooling'];
  for (const result of [dryRun, execution]) {
    assert.deepEqual(result.lanes?.map(lane => lane.lane), lanes, 'Every final lane is required.');
    for (const lane of result.lanes) {
      assert.equal(lane.skipped, false, `Final publication cannot omit ${lane.lane}.`);
      assert.ok(lane.sourceCommits.length > 0, `No source identity for ${lane.lane}.`);
    }
    assert.ok(result.tests?.length > 0, 'Missing completed assembly gates.');
    for (const step of result.tests) assert.equal(step.exitCode, 0, `Assembly gate did not pass: ${step.name}`);
    assert.match(result.finalCandidateSha, /^[a-f0-9]{40}$/);
    assert.match(result.finalTreeSha, /^[a-f0-9]{40}$/);
    assert.match(result.buildArtifact?.hash, /^[a-f0-9]{64}$/);
    assert.equal(result.buildArtifact.fileCount, result.buildArtifact.files?.length);
    assert.ok(result.buildArtifact.fileCount > 0, 'Missing certified build files.');
    assert.equal(result.browserCertification?.status, 'PASS', 'Missing complete three-browser certification.');
  }
  for (const key of ['repository', 'manifestSha256', 'candidateTimestamp', 'rollbackPoint', 'lanes', 'authorityToCommit', 'changedFiles', 'finalCandidateSha', 'finalTreeSha', 'buildArtifact', 'browserCertification']) {
    assert.deepEqual(execution[key], dryRun[key], `EXECUTE differs from the green DRY-RUN: ${key}`);
  }
  return { status: 'PASS', sourceSha: dryRun.finalCandidateSha, treeSha: dryRun.finalTreeSha, distManifestSha256: dryRun.buildArtifact.hash, manifestSha256: dryRun.manifestSha256 };
}

/** A final certification may inspect only the QA files already in its exact tree. */
export function assertCandidateQaIdentity(harnessRoot, candidateRoot, files) {
  assert.ok(Array.isArray(files) && files.length > 0, 'Expected an explicit QA file set.');
  assert.equal(new Set(files).size, files.length, 'Duplicate QA authority path.');
  return files.map(relative => {
    assert.ok(!path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'QA path must remain repository-relative.');
    const source = path.join(harnessRoot, relative), target = path.join(candidateRoot, relative);
    assert.ok(fs.lstatSync(source).isFile() && fs.lstatSync(target).isFile(), `QA authority must be regular files: ${relative}`);
    const sourceBytes = fs.readFileSync(source), candidateBytes = fs.readFileSync(target);
    assert.deepEqual(candidateBytes, sourceBytes, `Candidate QA authority differs from the reviewed harness: ${relative}`);
    return { path: relative, sha256: hash(sourceBytes), bytes: sourceBytes.length };
  });
}

/** Exit zero alone cannot prove that every final browser gate actually ran. */
export function assertCompleteBrowserReport(report) {
  assert.ok(report && typeof report === 'object', 'Missing valid Playwright JSON report.');
  assert.ok(Array.isArray(report.suites), 'Missing Playwright suites.');
  assert.deepEqual(report.errors ?? [], [], 'Playwright reported a global error.');
  const stats = report.stats;
  assert.ok(stats && Number.isInteger(stats.expected) && stats.expected > 0, 'No completed expected browser tests.');
  for (const key of ['unexpected', 'flaky', 'skipped']) assert.equal(stats[key], 0, `Final browser ${key} count must be zero.`);
  const counts = Object.fromEntries(FINAL_BROWSERS.map(name => [name, 0]));
  const coverage = Object.fromEntries(FINAL_BROWSERS.map(name => [name, []]));
  let total = 0;
  function visit(suite, ancestry = []) {
    const trail = [...ancestry, suite.title ?? ''];
    for (const spec of suite.specs ?? []) {
      assert.equal(spec.ok, true, `Browser assertion did not pass: ${spec.title}`);
      assert.ok(Array.isArray(spec.tests) && spec.tests.length > 0, `No browser executions: ${spec.title}`);
      for (const test of spec.tests) {
        assert.ok(FINAL_BROWSERS.includes(test.projectName), `Unexpected browser project: ${test.projectName}`);
        assert.equal(test.expectedStatus, 'passed', 'Skipped or expected-failure tests cannot certify a final RC.');
        assert.equal(test.status, 'expected', 'Final browser outcome must be expected success.');
        assert.ok(Array.isArray(test.results) && test.results.length > 0, 'Missing browser execution results.');
        for (const result of test.results) {
          assert.equal(result.status, 'passed', `Nonpassing browser attempt: ${spec.title}`);
          assert.deepEqual(result.errors ?? [], [], `Browser execution errors: ${spec.title}`);
          assert.ok(!result.error, `Browser execution error: ${spec.title}`);
        }
        counts[test.projectName] += 1;
        coverage[test.projectName].push(JSON.stringify([...trail, spec.title]));
        total += 1;
      }
    }
    for (const child of suite.suites ?? []) visit(child, trail);
  }
  for (const suite of report.suites) visit(suite);
  assert.equal(total, stats.expected, 'Playwright summary and execution counts differ.');
  for (const name of FINAL_BROWSERS) {
    assert.ok(counts[name] > 0, `No successful ${name} assertions.`);
    assert.equal(new Set(coverage[name]).size, coverage[name].length, `Duplicate ${name} assertion identity.`);
    assert.deepEqual(coverage[name].sort(), coverage.chromium.sort(), `Final browser assertion coverage differs for ${name}.`);
  }
  return { status: 'PASS', counts, total, skipped: 0, flaky: 0, unexpected: 0 };
}
