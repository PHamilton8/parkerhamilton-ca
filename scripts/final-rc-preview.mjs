#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const EXPECTED_SHA256 = 'fd9f1dcf3961c8968d9b71c46ddaea69641ea0e3d60b7c7b77951511ade25929';
const here = path.dirname(fileURLToPath(import.meta.url));
const partsDir = path.join(here, 'final-rc-preview.payload');
const names = (await fs.readdir(partsDir)).filter((name) => /^part-\d+$/.test(name)).sort();
if (!names.length) throw new Error(`Missing payload parts under ${partsDir}`);
const base64 = (await Promise.all(names.map((name) => fs.readFile(path.join(partsDir, name), 'utf8')))).join('');
const source = gunzipSync(Buffer.from(base64, 'base64'));
const actual = createHash('sha256').update(source).digest('hex');
if (actual !== EXPECTED_SHA256) throw new Error(`Preview automation payload integrity failure: expected ${EXPECTED_SHA256}, got ${actual}`);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parker-final-rc-preview-runner-'));
const tempFile = path.join(tempDir, 'final-rc-preview-exec.mjs');
await fs.writeFile(tempFile, source, { mode: 0o700 });
const child = spawn(process.execPath, [tempFile, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: process.cwd() });
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
await fs.rm(tempDir, { recursive: true, force: true });
process.exit(typeof code === 'number' ? code : 1);
