import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { promoteCleanCandidateVersion, verifyPromotionCi } from '../scripts/postlaunch-release.mjs';
import { assertQualificationFresh, MAX_EVIDENCE_AGE_MS } from '../scripts/clean-release-risk.mjs';

const VERSION = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const DEPLOYMENT = '22222222-2222-4222-8222-222222222222';
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-promotion-'));
  const cwd = process.cwd();
  const keys = ['CLOUDFLARE_ACCOUNT_ID', 'EXPECTED_CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'GITHUB_REPOSITORY'];
  const prior = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); fs.writeFileSync(path.join(dir, 'fixture'), 'synthetic-only'); git('add', 'fixture');
  git('-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'fixture');
  fs.mkdirSync(path.join(dir, '.release-production'));
  const candidateFile = path.join(dir, '.release-production/candidate.json');
  fs.writeFileSync(candidateFile, JSON.stringify({ versionId: VERSION, sourceSha: git('rev-parse', 'HEAD') }));
  process.chdir(dir);
  process.env.CLOUDFLARE_ACCOUNT_ID = process.env.EXPECTED_CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_API_TOKEN = 'synthetic-test-only';
  process.env.GITHUB_REPOSITORY = 'PHamilton8/parkerhamilton-ca';
  const audited = Date.parse('2026-10-27T20:00:00Z');
  const state = { now: audited + MAX_EVIDENCE_AGE_MS - 1, dispatches: 0 };
  const receipt = { status: 'QUALIFIED_CLEAN_AUDIT', auditedAtUtc: new Date(audited).toISOString() };
  t.mock.method(Date, 'now', () => state.now);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    state.dispatches++;
    assert.equal(JSON.parse(options.body).versions[0].version_id, VERSION);
    return new Response(JSON.stringify({ success: true, result: { id: DEPLOYMENT, versions: [{ version_id: VERSION, percentage: 100 }] } }), { status: 200 });
  });
  t.after(() => {
    process.chdir(cwd);
    for (const key of keys) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, candidateFile, receipt, state, audited };
}

test('clean promotion rejects a different version before any provider dispatch', async t => {
  const x = setup(t);
  await assert.rejects(promoteCleanCandidateVersion(OTHER, 'synthetic mismatch', () => x.receipt), /differs from reviewed candidate/);
  assert.equal(x.state.dispatches, 0);
});
test('clean promotion permits only the matching fresh candidate in mocked provider control', async t => {
  const x = setup(t);
  await promoteCleanCandidateVersion(VERSION, 'synthetic valid', () => x.receipt);
  assert.equal(x.state.dispatches, 1);
});
test('clean promotion rejects evidence that crosses expiry during final qualification', async t => {
  const x = setup(t);
  await assert.rejects(promoteCleanCandidateVersion(VERSION, 'synthetic expiry', () => {
    assertQualificationFresh(x.receipt); x.state.now++; return x.receipt;
  }), /stale/);
  assert.equal(x.state.dispatches, 0);
});
test('clean promotion rejects manifest mutation during final qualification', async t => {
  const x = setup(t);
  await assert.rejects(promoteCleanCandidateVersion(VERSION, 'synthetic changed candidate', () => {
    fs.writeFileSync(x.candidateFile, JSON.stringify({ versionId: OTHER })); return x.receipt;
  }), /candidate changed before dispatch/);
  assert.equal(x.state.dispatches, 0);
});
test('clean promotion rejects duplicate-key manifest before provider dispatch', async t => {
  const x = setup(t);
  fs.writeFileSync(x.candidateFile, `{"versionId":"${OTHER}","versionId":"${VERSION}"}`);
  await assert.rejects(promoteCleanCandidateVersion(VERSION, 'synthetic duplicate', () => x.receipt), /Duplicate/);
  assert.equal(x.state.dispatches, 0);
});
test('async latest-CI verification crossing freshness boundary rejects before promotion', async t => {
  const x = setup(t); let checks = 0, refreshed = 0, proceeded = false;
  await assert.rejects(async () => {
    await verifyPromotionCi(x.candidateFile, {
      checkApproval: () => { checks++; assertQualificationFresh(x.receipt); return x.receipt; },
      refresh: async () => { await Promise.resolve(); refreshed++; x.state.now++; return { status: 'synthetic verified' }; },
    });
    proceeded = true;
  }, /stale/);
  assert.equal(checks, 2); assert.equal(refreshed, 1); assert.equal(proceeded, false); assert.equal(x.state.dispatches, 0);
});
