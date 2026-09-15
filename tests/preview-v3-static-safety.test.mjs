import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const parse = (name) => ts.createSourceFile(name, fs.readFileSync(new URL(name, root), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const walk = (node, visitor) => { visitor(node); ts.forEachChild(node, child => walk(child, visitor)); };
test('Cloudflare mutating call sites are exactly empty Worker, preview Access, and exact version deletion', () => {
  const source = parse('scripts/final-rc-preview-remote.mjs'); const mutations = [];
  walk(source, n => {
    if (!ts.isCallExpression(n) || n.expression.getText(source) !== 'api' || !n.arguments[1]) return;
    assert.ok(ts.isObjectLiteralExpression(n.arguments[1]), 'API options cannot be dynamically assembled');
    const method = n.arguments[1].properties.find(p => p.name?.getText(source) === 'method');
    if (!method) return;
    assert.ok(ts.isPropertyAssignment(method) && ts.isStringLiteral(method.initializer), 'Mutation method must be a reviewed literal');
    mutations.push([method.initializer.text, n.arguments[0].getText(source)]);
  });
  assert.deepEqual(mutations.sort(), [
    ['POST', '`${base}/workers/workers`'],
    ['POST', '`${base}/access/apps`'],
    ['DELETE', '`${base}/workers/workers/${KEY(state.workerId)}/versions/${KEY(state.versionId)}`'],
  ].sort());
});
test('runner has no shell, dynamic code execution, or direct production CLI commands', () => {
  const forbidden = new Set(['eval', 'Function', 'exec', 'execSync', 'execFile', 'execFileSync']);
  let spawns = 0; let guardedWrangler = 0;
  for (const name of ['scripts/final-rc-preview-exec.mjs', 'scripts/final-rc-preview-remote.mjs']) {
    const source = parse(name);
    walk(source, n => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const callee = n.expression.getText(source);
        assert.ok(!forbidden.has(callee), `Unreviewed execution primitive ${callee}`);
        if (callee === 'spawn') spawns++;
        if (callee === 'run') {
          const text = n.getText(source);
          assert.doesNotMatch(text, /['"](?:deploy|rollback|triggers|secret|delete|dns|route|routes)['"]/, 'Forbidden production command');
          if (n.arguments[0]?.getText(source).includes('node_modules/.bin/wrangler')) {
            guardedWrangler++;
            const statement = n.parent.parent;
            const block = statement.parent;
            assert.ok(ts.isBlock(block), 'Wrangler invocation must be in reviewed guarded block');
            const index = block.statements.indexOf(statement);
            assert.ok(index > 0 && /assertUploadCommand\(args\)/.test(block.statements[index - 1].getText(source)), 'Upload allowlist must immediately precede Wrangler execution');
          }
        }
      }
      if (ts.isPropertyAssignment(n) && n.name.getText(source) === 'shell') assert.equal(n.initializer.kind, ts.SyntaxKind.FalseKeyword, 'Shell execution is prohibited');
    });
  }
  assert.equal(spawns, 1, 'All process execution passes the one reviewed runner');
  assert.equal(guardedWrangler, 1, 'Exactly one allowlisted unpublished upload call site');
});
test('the preview workflow passes untrusted ref via environment and excludes production branch', () => {
  const workflow = fs.readFileSync(new URL('.github/workflows/cloudflare-preview.yml', root), 'utf8');
  assert.match(workflow, /--rc "\$RC_REF" --authorize CREATE_PRIVATE_FINAL_RC_PREVIEW/);
  assert.match(workflow, /RC_REF: \$\{\{ inputs\.rc_ref \}\}/);
  assert.doesNotMatch(workflow, /run:.*\$\{\{ inputs\./);
  assert.doesNotMatch(workflow, /refs\/heads\/(?:main|master|production)\b|wrangler\s+deploy|versions\s+deploy/);
  assert.match(workflow, /contents: read/);
});
test('historical red v2 payload bytes remain untouched', () => {
  const expected = { 'scripts/final-rc-preview.payload-v2-a': 'd567a6a5c420aebd33e8ffabb7576a9732596c6aca61b3c8c647b6d0c333d6ef', 'scripts/final-rc-preview.payload-v2-b': '89b91fc14faecb75f319945bc72dd68479f521956261c3fdb54a815910c5bcb3' };
  for (const [name, digest] of Object.entries(expected)) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(name, root))).digest('hex'), digest);
});
