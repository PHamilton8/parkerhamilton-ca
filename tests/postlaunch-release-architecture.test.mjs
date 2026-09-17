import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const candidate = read('.github/workflows/cloudflare-preview.yml');
const promote = read('.github/workflows/cloudflare-production-release.yml');
const rollback = read('.github/workflows/cloudflare-rollback-production.yml');
const helper = read('scripts/postlaunch-release.mjs');

function excludes(text, patterns, label) {
  for (const pattern of patterns) assert.doesNotMatch(text, pattern, `${label} must not contain ${pattern}`);
}

test('Create Review Candidate uploads an immutable version without production traffic', () => {
  assert.match(candidate, /^name: Create Review Candidate$/m);
  assert.match(candidate, /workflow_dispatch:/);
  assert.match(candidate, /environment: preview/);
  assert.match(candidate, /CREATE REVIEW CANDIDATE/);
  assert.match(candidate, /verify-ci/);
  assert.match(candidate, /npm run release:build/);
  assert.match(candidate, /npm run infra:validate/);
  assert.match(candidate, /wrangler versions upload/);
  assert.match(candidate, /parse-upload-output/);
  assert.match(candidate, /preview-smoke/);
  assert.match(candidate, /assert-production-unchanged/);
  assert.match(candidate, /review-candidate-\$\{\{ steps\.identity\.outputs\.tree_sha \}\}/);
  excludes(candidate, [
    /wrangler\s+deploy\b/,
    /wrangler\s+versions\s+deploy\b/,
    /wrangler\s+rollback\b/,
    /activate-version/,
    /refs\/heads\/prep\/final-release-tooling/,
    /refs\/heads\/integration\/final-rc/,
  ], 'candidate workflow');
});

test('Promote Reviewed Version resolves the reviewed artifact and never rebuilds or uploads', () => {
  assert.match(promote, /^name: Promote Reviewed Version$/m);
  assert.match(promote, /environment: production/);
  assert.match(promote, /PROMOTE parkerhamilton\.ca/);
  assert.match(promote, /resolve-candidate-artifact/);
  assert.match(promote, /verify-manifest/);
  assert.match(promote, /verify-version/);
  assert.match(promote, /activate-version/);
  assert.match(promote, /production-smoke/);
  assert.match(promote, /gh release create/);
  excludes(promote, [
    /npm\s+ci\b/,
    /npm\s+run\s+(?:build|release:build)\b/,
    /wrangler\s+versions\s+upload\b/,
    /wrangler\s+deploy\b/,
    /wrangler\s+versions\s+deploy\b/,
    /wrangler\s+rollback\b/,
  ], 'promotion workflow');
});

test('Rollback Production uses exact known-good identity and contains no rebuild/upload path', () => {
  assert.match(rollback, /^name: Rollback Production$/m);
  assert.match(rollback, /environment: production/);
  assert.match(rollback, /ROLLBACK parkerhamilton\.ca/);
  assert.match(rollback, /release_tag:/);
  assert.match(rollback, /target_version_id:/);
  assert.match(rollback, /verify-version/);
  assert.match(rollback, /activate-version/);
  assert.match(rollback, /production-smoke/);
  excludes(rollback, [
    /npm\s+ci\b/,
    /npm\s+run\s+(?:build|release:build)\b/,
    /wrangler\s+versions\s+upload\b/,
    /wrangler\s+deploy\b/,
    /wrangler\s+versions\s+deploy\b/,
    /wrangler\s+rollback\b/,
  ], 'rollback workflow');
});

test('Exact-version activation is a single-version 100% Cloudflare deployment', () => {
  assert.match(helper, /async function activateVersion\(versionId, message\)/);
  assert.match(helper, /strategy:\s*'percentage'/);
  assert.match(helper, /versions:\s*\[\{ version_id: versionId, percentage: 100 \}\]/);
  assert.match(helper, /assert\.equal\(Number\(versions\[0\]\.percentage\), 100\)/);
  assert.match(helper, /Current main tree must exactly match reviewed candidate tree/);
});

test('Candidate artifact resolution fails closed unless exactly one non-expired tree match exists', () => {
  assert.match(helper, /review-candidate-\$\{tree\}/);
  assert.match(helper, /artifacts\.length, 1/);
  assert.match(helper, /Expected exactly one non-expired candidate artifact/);
});
