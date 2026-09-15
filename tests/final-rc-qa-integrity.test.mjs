import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertCandidateQaIdentity, assertCompleteBrowserReport, assertDryRunIdentity, FINAL_BROWSERS } from '../scripts/final-rc/qa-integrity.mjs';

const report = () => ({ errors: [], stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ title: 'final.spec.ts', specs: [{ title: 'required gate', ok: true, tests: FINAL_BROWSERS.map(projectName => ({ projectName, expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [] }] })) }] }] });

const assembly = () => ({ status: 'PASS', mode: 'DRY-RUN', repository: 'PHamilton8/parkerhamilton-ca', manifestSha256: 'a'.repeat(64), candidateTimestamp: '2026-09-15T00:00:00Z', rollbackPoint: 'b'.repeat(40), lanes: ['homepage', 'wealthsimple', 'reporting', 'designDay', 'grocery', 'askWill', 'coast', 'compound', 'smith', 'releaseTooling'].map(lane => ({lane, skipped: false, sourceCommits: ['c'.repeat(40)]})), tests: [{name: 'actual gate', exitCode: 0}], authorityToCommit: {}, changedFiles: [], finalCandidateSha: 'd'.repeat(40), finalTreeSha: 'e'.repeat(40), buildArtifact: { hash: 'f'.repeat(64), fileCount: 1, files: [{path: 'index.html', sha256: '1'.repeat(64), bytes: 20}] }, browserCertification: assertCompleteBrowserReport(report()) });

test('EXECUTE requires byte-identical green DRY-RUN source/tree/build and all complete lanes before publication', () => {
  const dry = assembly(), execute = {...structuredClone(dry), mode: 'EXECUTE', status: 'IN_PROGRESS'};
  assert.equal(assertDryRunIdentity(dry, execute).status, 'PASS');
  for (const mutate of [
    r => { r.finalCandidateSha = '2'.repeat(40); }, r => { r.finalTreeSha = '3'.repeat(40); },
    r => { r.manifestSha256 = '4'.repeat(64); }, r => { r.buildArtifact.hash = '5'.repeat(64); },
    r => { r.buildArtifact.files[0].sha256 = '6'.repeat(64); }, r => { r.tests[0].exitCode = 1; },
    r => { r.lanes[0].skipped = true; }, r => { r.lanes.pop(); },
    r => { r.lanes[0].sourceCommits = []; }, r => { r.browserCertification.status = 'FAIL'; },
  ]) { const changed = structuredClone(execute); mutate(changed); assert.throws(() => assertDryRunIdentity(dry, changed)); }
  const red = structuredClone(dry); red.status = 'FAIL'; assert.throws(() => assertDryRunIdentity(red, execute));
  assert.throws(() => assertDryRunIdentity(undefined, execute));
});

test('complete exact three-browser success produces counted evidence', () => {
  assert.deepEqual(assertCompleteBrowserReport(report()), { status: 'PASS', counts: { chromium: 1, firefox: 1, webkit: 1 }, total: 3, skipped: 0, flaky: 0, unexpected: 0 });
});

test('missing, empty, unreadable, skipped, flaky, failed, and globally errored browser reports fail closed', () => {
  for (const bad of [null, undefined, {}, { suites: [] }, { ...report(), suites: [] }]) assert.throws(() => assertCompleteBrowserReport(bad));
  for (const key of ['skipped', 'flaky', 'unexpected']) {
    const bad = report(); bad.stats[key] = 1; assert.throws(() => assertCompleteBrowserReport(bad));
  }
  const bad = report(); bad.errors.push({ message: 'global browser failure' }); assert.throws(() => assertCompleteBrowserReport(bad));
});

test('missing browser, unknown project, no results and suppressed failures cannot pass', () => {
  for (const mutate of [
    r => { r.suites[0].specs[0].tests.pop(); r.stats.expected = 2; },
    r => { r.suites[0].specs[0].tests[0].projectName = 'custom'; },
    r => { r.suites[0].specs[0].tests[0].results = []; },
    r => { r.suites[0].specs[0].tests[0].expectedStatus = 'failed'; },
    r => { r.suites[0].specs[0].tests[0].status = 'unexpected'; },
    r => { r.suites[0].specs[0].ok = false; },
    r => { r.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    r => { r.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' }); },
    r => { r.suites[0].specs[0].tests[0].results[0].errors = [{ message: 'failure' }]; },
    r => { r.stats.expected = 99; },
  ]) { const bad = report(); mutate(bad); assert.throws(() => assertCompleteBrowserReport(bad)); }
});

test('unequal or duplicate cross-browser assertion coverage fails', () => {
  const unequal = report();
  unequal.suites[0].specs.push({ title: 'Chromium only', ok: true, tests: [structuredClone(unequal.suites[0].specs[0].tests[0])] });
  unequal.stats.expected = 4;
  assert.throws(() => assertCompleteBrowserReport(unequal), /coverage differs/);
  const duplicate = report();
  duplicate.suites[0].specs.push(structuredClone(duplicate.suites[0].specs[0])); duplicate.stats.expected = 6;
  assert.throws(() => assertCompleteBrowserReport(duplicate), /Duplicate/);
});

test('candidate QA authority is read-only and must already equal reviewed harness bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-identity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const harness = path.join(dir, 'harness'), candidate = path.join(dir, 'candidate');
  for (const root of [harness, candidate]) { fs.mkdirSync(path.join(root, 'tests'), { recursive: true }); fs.writeFileSync(path.join(root, 'tests/gate.mjs'), 'exact reviewed gate\n'); }
  const before = fs.readFileSync(path.join(candidate, 'tests/gate.mjs'));
  const identity = assertCandidateQaIdentity(harness, candidate, ['tests/gate.mjs']);
  assert.equal(identity.length, 1); assert.match(identity[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(fs.readFileSync(path.join(candidate, 'tests/gate.mjs')), before);
  assert.throws(() => assertCandidateQaIdentity(harness, candidate, ['tests/gate.mjs', 'tests/gate.mjs']));
  assert.throws(() => assertCandidateQaIdentity(harness, candidate, ['../escape']));
  fs.writeFileSync(path.join(candidate, 'tests/gate.mjs'), 'stale candidate gate\n');
  assert.throws(() => assertCandidateQaIdentity(harness, candidate, ['tests/gate.mjs']), /differs/);
  assert.equal(fs.readFileSync(path.join(candidate, 'tests/gate.mjs'), 'utf8'), 'stale candidate gate\n');
  fs.unlinkSync(path.join(candidate, 'tests/gate.mjs'));
  assert.throws(() => assertCandidateQaIdentity(harness, candidate, ['tests/gate.mjs']));
  fs.symlinkSync(path.join(harness, 'tests/gate.mjs'), path.join(candidate, 'tests/gate.mjs'));
  assert.throws(() => assertCandidateQaIdentity(harness, candidate, ['tests/gate.mjs']), /regular files/);
});
