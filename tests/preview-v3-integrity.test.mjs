import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRunnerIntegrity } from '../scripts/final-rc-preview.mjs';
const fixture = (action) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-runner-integrity-'));
  const files = {};
  for (const name of ['scripts/final-rc-preview-exec.mjs', 'scripts/final-rc-preview-remote.mjs', 'scripts/validate-release-dist.mjs']) {
    const bytes = `export const fixture = ${JSON.stringify(name)};\n`; fs.mkdirSync(path.join(root, 'scripts'), { recursive: true }); fs.writeFileSync(path.join(root, name), bytes); files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const manifest = { schemaVersion: 3, canonicalSource: 'scripts/final-rc-preview-exec.mjs', supersedesUnrecoverableV2SourceSha256: '46b2812a7d17dd50f2f4d0aedf748966df38ddf9570c11528ed8c3bc2d808e30', files };
  fs.mkdirSync(path.join(root, 'release')); const p = path.join(root, 'release/preview-runner-v3-integrity.json'); fs.writeFileSync(p, JSON.stringify(manifest));
  try { action(root, manifest, () => fs.writeFileSync(p, JSON.stringify(manifest))); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};
test('integrity verifies exact readable source and every executable dependency', () => fixture(root => assert.equal(verifyRunnerIntegrity(root).schemaVersion, 3)));
for (const name of ['final-rc-preview-exec.mjs', 'final-rc-preview-remote.mjs', 'validate-release-dist.mjs']) test(`integrity rejects changed ${name}`, () => fixture(root => { fs.appendFileSync(path.join(root, 'scripts', name), '// changed'); assert.throws(() => verifyRunnerIntegrity(root), /integrity mismatch/); }));
test('integrity rejects omitted dependency', () => fixture((root, m, save) => { delete m.files['scripts/final-rc-preview-remote.mjs']; save(); assert.throws(() => verifyRunnerIntegrity(root), /allowlist mismatch/); }));
test('integrity rejects arbitrary path injection', () => fixture((root, m, save) => { m.files['../../other.mjs'] = '0'.repeat(64); save(); assert.throws(() => verifyRunnerIntegrity(root), /allowlist mismatch/); }));
test('integrity preserves superseded v2 provenance', () => fixture((root, m, save) => { delete m.supersedesUnrecoverableV2SourceSha256; save(); assert.throws(() => verifyRunnerIntegrity(root)); }));
test('integrity rejects readable-source symlink', () => fixture(root => { const p = path.join(root, 'scripts/final-rc-preview-exec.mjs'); fs.renameSync(p, p + '.real'); fs.symlinkSync(p + '.real', p); assert.throws(() => verifyRunnerIntegrity(root), /regular file/); }));
