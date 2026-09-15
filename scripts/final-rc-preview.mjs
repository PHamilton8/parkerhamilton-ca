#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RUNNER_FILES = Object.freeze(['scripts/final-rc-preview-exec.mjs', 'scripts/final-rc-preview-remote.mjs', 'scripts/validate-release-dist.mjs']);
export const HISTORICAL_V2_SHA256 = '46b2812a7d17dd50f2f4d0aedf748966df38ddf9570c11528ed8c3bc2d808e30';
export function verifyRunnerIntegrity(root) {
  const manifestPath = path.join(root, 'release/preview-runner-v3-integrity.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 3, 'Replacement integrity schema mismatch');
  assert.equal(manifest.canonicalSource, 'scripts/final-rc-preview-exec.mjs');
  assert.equal(manifest.supersedesUnrecoverableV2SourceSha256, HISTORICAL_V2_SHA256);
  assert.deepEqual(Object.keys(manifest.files).sort(), [...RUNNER_FILES].sort(), 'Canonical executable dependency allowlist mismatch');
  for (const relative of RUNNER_FILES) {
    assert.match(manifest.files[relative], /^[0-9a-f]{64}$/, `Invalid pinned digest: ${relative}`);
    const absolute = path.join(root, relative);
    assert.ok(fs.lstatSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink(), `Canonical source must be a regular file: ${relative}`);
    const actual = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    assert.equal(actual, manifest.files[relative], `Reviewed readable source integrity mismatch: ${relative}`);
  }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const integrity = verifyRunnerIntegrity(root);
  if (process.argv.length === 3 && process.argv[2] === '--verify-only') {
    console.log(JSON.stringify({ passed: true, canonicalSource: integrity.canonicalSource, sha256: integrity.files[integrity.canonicalSource], derivedPayload: 'none — readable source executes directly' }, null, 2));
  } else {
    const { runCli } = await import(pathToFileURL(path.join(root, integrity.canonicalSource)).href);
    await runCli(process.argv.slice(2));
  }
}
