import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const approvedPath = 'public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx';
const approvedBytes = readFileSync(new URL(`../${approvedPath}`, import.meta.url));
function scan(path, bytes) {
  const root = mkdtempSync(join(tmpdir(), 'smith-download-safety-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    mkdirSync(join(root, 'public/downloads'), { recursive: true });
    copyFileSync(new URL('../scripts/public-safety-scan.mjs', import.meta.url), join(root, 'scan.mjs'));
    writeFileSync(join(root, path), bytes);
    return spawnSync(process.execPath, ['scan.mjs'], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('approved Smith V2 workbook passes only at its approved path with exact bytes', () => {
  const result = scan(approvedPath, approvedBytes);
  assert.equal(result.status, 0, result.stderr);
});

test('a changed workbook at the approved path is rejected', () => {
  const changed = Buffer.from(approvedBytes);
  changed[changed.length - 1] ^= 1;
  const result = scan(approvedPath, changed);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no exact approved download match/);
});

test('unapproved workbook names and private source types remain rejected', () => {
  for (const name of ['Smith_Manoeuvre_Public_Sanitized.xlsx', 'other.xlsx', 'original.xlsm', 'source.zip', 'private.docx']) {
    const result = scan(`public/downloads/${name}`, approvedBytes);
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /no exact approved download match/);
  }
});
