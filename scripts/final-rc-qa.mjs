#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HARNESS_ROOT = process.cwd();
const targetRef = process.argv[2];
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg?.split('=')[1] ?? 'final-rc';
const allowedProfiles = new Set(['baseline', 'homepage-v3', 'reporting-v3', 'final-rc']);
if (!targetRef || !allowedProfiles.has(profile)) {
  console.error('Usage: npm run qa:final-rc -- <SHA-or-ref> [--profile=baseline|homepage-v3|reporting-v3|final-rc]');
  process.exit(2);
}

const BASE_SHA = '5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e';
const PREPARED_HARNESS_SHA = 'e62fc9002080cf876b5365bfa460b4e094f3f8ca';
const REQUIRED_NODE = 'v24.19.0';
const run = (cwd, cmd, args, options = {}) => {
  const started = new Date().toISOString();
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', QA_AUTHORITY_PROFILE: profile, ...options.env },
  });
  return {
    name: options.name ?? `${cmd} ${args.join(' ')}`,
    started,
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};
const git = (args, capture = true) => run(HARNESS_ROOT, 'git', args, { capture, name: `git ${args.join(' ')}` });
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');
const exactFailure = (step) => {
  const text = stripAnsi(`${step.stdout}\n${step.stderr}`);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const assertions = lines.filter((line) => /^(?:✖|×)|AssertionError|Expected values|canonical mismatch|drifted from|contains forbidden|error TS\d+|ERR_|\bFAIL(?:ED)?\b/i.test(line));
  const selected = assertions.length ? assertions.slice(-3) : lines.slice(-3);
  return selected.join(' | ').slice(0, 1800) || `exit ${step.code}`;
};

let resolved = git(['rev-parse', `${targetRef}^{commit}`]);
if (resolved.code !== 0) {
  const fetch = git(['fetch', '--no-tags', 'origin', targetRef], false);
  if (fetch.code !== 0) process.exit(fetch.code);
  resolved = git(['rev-parse', 'FETCH_HEAD^{commit}']);
}
const targetSha = resolved.stdout.trim();
const shortSha = targetSha.slice(0, 12);
const artifactDir = path.join(HARNESS_ROOT, 'artifacts', 'final-rc', `${shortSha}-${profile}`);
fs.mkdirSync(artifactDir, { recursive: true });

const routeMatrix = {
  targetRef,
  targetSha,
  profile,
  routes: {
    '/': profile === 'homepage-v3' || profile === 'final-rc' ? 'LOCKED ASSERTIONS REQUIRED' : 'GENERIC/DEFERRED',
    '/work/design-day': 'GENERIC + HUMAN AUDIO GATE DEFERRED',
    '/work/reporting-workflow': profile === 'reporting-v3' || profile === 'final-rc' ? 'V3 ASSERTIONS REQUIRED' : 'GENERIC/DEFERRED',
    '/work/grocery-automation': 'GENERIC; VISUAL AUTHORITY DEFERRED',
    '/work/askwill': 'GENERIC; VISUAL AUTHORITY DEFERRED',
    '/work/coast-fi': profile === 'final-rc' ? 'LOCKED GRAPH/DEFAULT + ENGINE REQUIRED' : 'ENGINE/SAFETY ONLY',
    '/work/compound-growth': profile === 'final-rc' ? 'CANONICAL DATA/ENGINE REQUIRED; VISUAL CANDIDATE DEFERRED' : 'ENGINE/SAFETY ONLY',
    '/work/smith-manoeuvre': 'ENGINE/WORKBOOK REQUIRED; GRAPH VISUAL AUTHORITY DEFERRED',
  },
};
fs.writeFileSync(path.join(artifactDir, 'route-matrix.json'), JSON.stringify(routeMatrix, null, 2));

const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'parker-final-rc-'));
const steps = [];
let playwrightJson = null;
let blockingAssertion = null;

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
      ['git', ['merge-base', '--is-ancestor', BASE_SHA, targetSha], 'baseline ancestry', true],
      ['git', ['diff', '--check', `${BASE_SHA}..${targetSha}`], 'git diff --check', true],
      ['npm', ['ci'], 'npm ci', true],
      ['npm', ['run', 'check'], 'astro/types check', true],
      ['npm', ['test'], 'existing source/engine tests', true],
      ['node', ['--test', 'tests/final-rc-contract.test.mjs'], 'latest-authority frozen/static contracts', true],
      ['npm', ['run', 'build'], 'build', true],
      ['node', ['--test', 'tests/built-route-contract.mjs'], 'exact built-route/canonical contract', true],
      ['npm', ['run', 'public-safety'], 'public safety', true],
      ['npm', ['run', 'qa:contrast'], 'contrast', true],
      ['npm', ['audit', '--audit-level=high'], 'npm audit high', true],
      ['npx', ['playwright', 'install', '--with-deps', 'chromium', 'firefox', 'webkit'], 'Playwright browser install', false],
    ];
    for (const [cmd, args, name, capture] of checks) {
      console.log(`[final-rc-qa] ${name}...`);
      const step = run(worktree, cmd, args, { name, capture });
      steps.push(step);
      if (step.code) {
        blockingAssertion = `${name}: ${capture ? exactFailure(step) : `exit ${step.code}`}`;
        break;
      }
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
      ];
      const browser = run(worktree, 'npx', ['playwright', 'test', ...browserFiles, '--reporter=json'], { capture: true, name: 'Playwright full authority/browser suite' });
      steps.push({ ...browser, stdout: '[written to playwright.json]' });
      fs.writeFileSync(path.join(artifactDir, 'playwright.json'), browser.stdout);
      try { playwrightJson = JSON.parse(browser.stdout); } catch {}
      if (browser.code) {
        const failures = [];
        const visit = (suite) => {
          for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
              for (const result of test.results ?? []) {
                if (result.status === 'failed' || result.status === 'timedOut') {
                  failures.push({
                    title: spec.title,
                    project: test.projectName,
                    error: result.error?.message ?? result.errors?.[0]?.message ?? 'failed',
                    attachments: result.attachments ?? [],
                  });
                }
              }
            }
          }
          for (const child of suite.suites ?? []) visit(child);
        };
        for (const suite of playwrightJson?.suites ?? []) visit(suite);
        blockingAssertion = failures[0]
          ? `${failures[0].project}: ${failures[0].title} — ${failures[0].error}`
          : `Playwright exited ${browser.code}: ${exactFailure(browser)}`;
        fs.writeFileSync(path.join(artifactDir, 'failures.json'), JSON.stringify(failures, null, 2));
      }
      const sourceResults = path.join(worktree, 'test-results');
      if (fs.existsSync(sourceResults)) fs.cpSync(sourceResults, path.join(artifactDir, 'test-results'), { recursive: true });
    }

    if (profile === 'final-rc') {
      const ancestor = run(worktree, 'git', ['merge-base', '--is-ancestor', PREPARED_HARNESS_SHA, targetSha], { capture: true, name: 'prepared harness ancestry' });
      steps.push(ancestor);
      if (ancestor.code && !blockingAssertion) {
        blockingAssertion = `Final RC does not descend from prepared harness SHA ${PREPARED_HARNESS_SHA}.`;
      }
    }
  }
} catch (error) {
  blockingAssertion ||= error instanceof Error ? error.message : String(error);
} finally {
  if (fs.existsSync(worktree)) git(['worktree', 'remove', '--force', worktree], false);
}

const failedSteps = steps.filter((step) => step.code !== 0);
const result = {
  schemaVersion: 2,
  targetRef,
  targetSha,
  profile,
  baseSha: BASE_SHA,
  preparedHarnessSha: PREPARED_HARNESS_SHA,
  requiredNode: REQUIRED_NODE,
  passed: !blockingAssertion && failedSteps.length === 0,
  blockingAssertion,
  steps: steps.map(({ stdout, stderr, ...step }) => ({
    ...step,
    stdoutTail: stdout.slice(-3000),
    stderrTail: stderr.slice(-3000),
  })),
  artifactDir: path.relative(HARNESS_ROOT, artifactDir),
  routeMatrix,
};
fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
const summary = `# Final-RC QA V2\n\n- Target: \`${targetRef}\` → \`${targetSha}\`\n- Profile: \`${profile}\`\n- Result: **${result.passed ? 'PASS' : 'FAIL'}**\n- Blocking assertion: ${blockingAssertion ? `\`${blockingAssertion.replaceAll('`', "'")}\`` : 'none'}\n- Machine result: \`result.json\`\n- Route matrix: \`route-matrix.json\`\n- Playwright report: ${fs.existsSync(path.join(artifactDir, 'playwright.json')) ? '`playwright.json`' : 'not reached'}\n- Failure screenshots/traces/video: ${fs.existsSync(path.join(artifactDir, 'test-results')) ? '`test-results/`' : 'none'}\n`;
fs.writeFileSync(path.join(artifactDir, 'summary.md'), summary);
console.log(summary);
process.exit(result.passed ? 0 : 1);
