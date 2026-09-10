import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Report categories and filenames only; never echo a suspected secret.
const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const textRules = [
  ['Google API credential', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub credential', /(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,})/],
  ['Secret key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Access credential assignment', /(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{16,}["']/i],
  ['Absolute local path', /(?:^|[\s"'`(])(?:\/mnt\/data\/|\/workspace\/|\/Users\/|C:\\Users\\)/m],
  ['Unneeded analytics identifier', /\b(?:G-[A-Z0-9]{8,}|AW-\d{7,}|GTM-[A-Z0-9]{5,})\b/],
];
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  if (/\.(?:xlsx?|xlsm|docx?|zip|env|pem|key|sqlite|db)$/i.test(file)) failures.push([file, 'Private-source or credential file type']);
  const bytes = fs.readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [reason, pattern] of textRules) if (pattern.test(text)) failures.push([file, reason]);
  if (/^(?:src|public)\//.test(file)) {
    if (/MSc Candidate|laser-powered musical instrument|Breach Reporting|askwill\.ca\s*\/\s*staging|LinkedIn will be added/i.test(text)) failures.push([file, 'Unapproved public wording']);
    if (/https?:\/\/(?:www\.)?github\.com/.test(text)) failures.push([file, 'Unapproved public GitHub link']);
  }
}
if (failures.length) {
  for (const [file, reason] of failures) console.error(`${file}: ${reason}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${files.length} repository files scanned; no flagged credentials, private source files, local paths, analytics IDs, or unapproved public wording. Public numeric examples still require provenance review.`);
}
