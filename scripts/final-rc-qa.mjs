#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HARNESS_ROOT = process.cwd();
const targetRef = process.argv[2];
const REQUIRED_NODE = 'v24.19.0';
const BASE_SHA = '5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e';
const profile = 'final-rc';

if (!targetRef) {
  console.error('Usage: npm run qa:final-rc -- <FINAL-RC-SHA-or-ref>');
  process.exit(2);
}

const run = (cwd, cmd, args, options = {}) => {
  const started = new Date().toISOString();
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', QA_AUTHORITY_PROFILE: profile, ...options.env },
  });
  return { name: options.name ?? `${cmd} ${args.join(' ')}`, started, code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};
const git = (args, capture = true) => run(HARNESS_ROOT, 'git', args, { capture, name: `git ${args.join(' ')}` });
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const exactFailure = (step) => {
  const lines = stripAnsi(`${step.stdout}\n${step.stderr}`).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const assertions = lines.filter((line) => /^(?:✖|×)|AssertionError|Expected values|canonical mismatch|drifted from|contains forbidden|error TS\d+|ERR_|\bFAIL(?:ED)?\b/i.test(line));
  return (assertions.length ? assertions.slice(-4) : lines.slice(-4)).join(' | ').slice(0, 2200) || `exit ${step.code}`;
};

let resolved = git(['rev-parse', `${targetRef}^{commit}`]);
if (resolved.code !== 0) {
  const fetch = git(['fetch', '--no-tags', 'origin', targetRef], false);
  if (fetch.code !== 0) process.exit(fetch.code);
  resolved = git(['rev-parse', 'FETCH_HEAD^{commit}']);
}
const targetSha = resolved.stdout.trim();
const shortSha = targetSha.slice(0, 12);
const artifactDir = path.join(HARNESS_ROOT, 'artifacts', 'final-rc', shortSha);
fs.mkdirSync(artifactDir, { recursive: true });

const routeMatrix = {
  targetRef,
  targetSha,
  routeAccounting: '8 indexable portfolio routes + 1 noindex Wealthsimple auxiliary route',
  routes: {
    '/': 'FINAL HOMEPAGE V3 + FINAL GLOBAL CONTACTBAND',
    '/work/design-day': 'FINAL MINIMAL CROP + 8.475s VIDEO + RETIMED VTT',
    '/work/reporting-workflow': 'FINAL V3 / FOUR SYNCHRONIZED STAGES',
    '/work/grocery-automation': 'FINAL HOUSE RULES C / THE WORKFLOW',
    '/work/askwill': 'FINAL SEP-14 OPTION B + HOSTING C',
    '/work/coast-fi': 'FINAL FOUR-MODE INTERACTIVE / ENGINE+WORKBOOK FROZEN',
    '/work/compound-growth': 'FINAL FIVE-EXPERIMENT EVIDENCE + MONTHLY SIMULATOR',
    '/work/smith-manoeuvre': 'FINAL SIMPLIFIED PAGE + GRAPH A EMERALD',
    '/wealthsimple-2026': 'FINAL NOINDEX AUXILIARY ROUTE + VERIFIED VERBATIM CAPTIONS REQUIRED',
  },
};
fs.writeFileSync(path.join(artifactDir, 'route-matrix.json'), JSON.stringify(routeMatrix, null, 2));

const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-final-rc-'));
const steps = [];
let blockingAssertion = null;
let playwrightJson = null;

try {
  const nodeGate = run(HARNESS_ROOT, 'node', ['-e', `if (process.version !== '${REQUIRED_NODE}') { console.error('Expected ${REQUIRED_NODE}, got ' + process.version); process.exit(1); } console.log(process.version);`], { capture: true, name: `Node exact ${REQUIRED_NODE}` });
  steps.push(nodeGate);
  if (nodeGate.code) blockingAssertion = `Node exact ${REQUIRED_NODE}: ${exactFailure(nodeGate)}`;

  if (!blockingAssertion) {
    const add = git(['worktree', 'add', '--detach', worktree, targetSha], false);
    steps.push(add);
    if (add.code) throw new Error('Unable to create target worktree.');

    const overlay = [
      'playwright.config.ts',
      'tests/browser/qa-profile.ts',
      'tests/browser/authority-home.spec.ts',
      'tests/browser/authority-reporting.spec.ts',
      'tests/browser/authority-coast-fi.spec.ts',
      'tests/browser/authority-compound-growth.spec.ts',
      'tests/browser/authority-global.spec.ts',
      'tests/browser/authority-pending-routes.spec.ts',
      'tests/final-rc-contract.test.mjs',
      'tests/built-route-contract.mjs',
    ];
    for (const rel of overlay) {
      const src = path.join(HARNESS_ROOT, rel);
      const dst = path.join(worktree, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }

    const checks = [
      ['git', ['merge-base', '--is-ancestor', BASE_SHA, targetSha], 'green-base ancestry', true],
      ['git', ['diff', '--check', `${BASE_SHA}..${targetSha}`], 'git diff --check', true],
      ['npm', ['ci'], 'npm ci', true],
      ['npm', ['run', 'check'], 'Astro + TypeScript checks', true],
      ['npm', ['test'], 'source + calculator/engine tests', true],
      ['node', ['--test', 'tests/final-rc-contract.test.mjs'], 'latest-authority source contracts', true],
      ['npm', ['run', 'build'], 'production build', true],
      ['node', ['--test', 'tests/built-route-contract.mjs'], 'built route/indexation/canonical contract', true],
      ['npm', ['run', 'public-safety'], 'public safety', true],
      ['npm', ['run', 'qa:contrast'], 'contrast', true],
      ['npm', ['audit', '--audit-level=high'], 'npm audit high', true],
      ['npx', ['playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit'], 'Playwright browser install', false],
    ];

    for (const [cmd, args, name, capture] of checks) {
      console.log(`[final-rc-qa] ${name}...`);
      const step = run(worktree, cmd, args, { name, capture });
      steps.push(step);
      if (step.code) { blockingAssertion = `${name}: ${capture ? exactFailure(step) : `exit ${step.code}`}`; break; }
      console.log(`[final-rc-qa] ${name}: PASS`);
    }

    if (!blockingAssertion) {
      const browserFiles = [
        'tests/browser/site.spec.ts',
        'tests/browser/authority-global.spec.ts',
        'tests/browser/authority-home.spec.ts',
        'tests/browser/authority-reporting.spec.ts',
        'tests/browser/authority-coast-fi.spec.ts',
        'tests/browser/authority-compound-growth.spec.ts',
        'tests/browser/authority-pending-routes.spec.ts',
        'tests/browser/wealthsimple-application.spec.ts',
      ];
      const browser = run(worktree, 'npx', ['playwright', 'test', ...browserFiles, '--reporter=json'], { capture: true, name: 'Playwright full final-authority suite' });
      steps.push({ ...browser, stdout: '[written to playwright.json]' });
      fs.writeFileSync(path.join(artifactDir, 'playwright.json'), browser.stdout);
      try { playwrightJson = JSON.parse(browser.stdout); } catch {}
      if (browser.code) {
        const failures = [];
        const visit = (suite) => {
          for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
            if (result.status === 'failed' || result.status === 'timedOut') failures.push({ title: spec.title, project: test.projectName, error: result.error?.message ?? result.errors?.[0]?.message ?? 'failed', attachments: result.attachments ?? [] });
          }
          for (const child of suite.suites ?? []) visit(child);
        };
        for (const suite of playwrightJson?.suites ?? []) visit(suite);
        blockingAssertion = failures[0] ? `${failures[0].project}: ${failures[0].title} — ${failures[0].error}` : `Playwright exited ${browser.code}: ${exactFailure(browser)}`;
        fs.writeFileSync(path.join(artifactDir, 'failures.json'), JSON.stringify(failures, null, 2));
      }
      const sourceResults = path.join(worktree, 'test-results');
      if (fs.existsSync(sourceResults)) fs.cpSync(sourceResults, path.join(artifactDir, 'test-results'), { recursive: true });
    }
  }
} catch (error) {
  blockingAssertion ||= error instanceof Error ? error.message : String(error);
} finally {
  if (fs.existsSync(worktree)) git(['worktree', 'remove', '--force', worktree], false);
}

const failedSteps = steps.filter((step) => step.code !== 0);
const result = {
  schemaVersion: 3,
  targetRef,
  targetSha,
  profile,
  baseSha: BASE_SHA,
  requiredNode: REQUIRED_NODE,
  routeAccounting: routeMatrix.routeAccounting,
  passed: !blockingAssertion && failedSteps.length === 0,
  blockingAssertion,
  steps: steps.map(({ stdout, stderr, ...step }) => ({ ...step, stdoutTail: stdout.slice(-3000), stderrTail: stderr.slice(-3000) })),
  artifactDir: path.relative(HARNESS_ROOT, artifactDir),
  routeMatrix,
};
fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
const summary = `# Final-RC QA V3\n\n- Target: \`${targetRef}\` → \`${targetSha}\`\n- Route accounting: ${routeMatrix.routeAccounting}\n- Result: **${result.passed ? 'PASS' : 'FAIL'}**\n- Blocking assertion: ${blockingAssertion ? `\`${blockingAssertion.replaceAll('`', "'")}\`` : 'none'}\n- Machine result: \`result.json\`\n- Route matrix: \`route-matrix.json\`\n- Playwright report: ${fs.existsSync(path.join(artifactDir, 'playwright.json')) ? '`playwright.json`' : 'not reached'}\n`;
fs.writeFileSync(path.join(artifactDir, 'summary.md'), summary);
console.log(summary);
process.exit(result.passed ? 0 : 1);
