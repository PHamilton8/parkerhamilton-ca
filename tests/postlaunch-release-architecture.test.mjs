import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fetchJson, fetchPreviewSameOrigin } from '../scripts/postlaunch-release.mjs';

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
  assert.match(helper, /async function activateVersion\(versionId, message, beforeDispatch\)/);
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


async function withMockFetch(mock, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

test('fetchJson returns successful JSON unchanged', { concurrency: false }, async () => {
  const expected = { success: true, result: { id: 'ok' } };
  await withMockFetch(
    async () => new Response(JSON.stringify(expected), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    async () => assert.deepEqual(await fetchJson('https://example.test/success'), expected),
  );
});

test('fetchJson preserves structured Cloudflare HTTP errors and redacts secrets', { concurrency: false }, async () => {
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_API_TOKEN = 'super-secret-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'secret-account-id';
  try {
    await withMockFetch(
      async () => new Response(JSON.stringify({
        success: false,
        errors: [{
          code: 10099,
          message: 'Bad deployment super-secret-token',
          documentation_url: 'https://developers.cloudflare.com/example',
          source: { pointer: '/annotations/workers/triggered_by' },
        }],
        messages: [{ code: 10100, message: 'Additional context' }],
        token: 'super-secret-token',
      }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      }),
      async () => {
        await assert.rejects(
          fetchJson('https://api.cloudflare.com/client/v4/accounts/secret-account-id/workers/scripts/example/deployments'),
          (error) => {
            assert.match(error.message, /HTTP 400 Bad Request/);
            assert.match(error.message, /10099/);
            assert.match(error.message, /Bad deployment \[REDACTED\]/);
            assert.match(error.message, /documentation_url/);
            assert.match(error.message, /workers\/triggered_by/);
            assert.match(error.message, /10100/);
            assert.doesNotMatch(error.message, /super-secret-token/);
            assert.doesNotMatch(error.message, /secret-account-id/);
            assert.match(error.message, /\[ACCOUNT\]/);
            return true;
          },
        );
      },
    );
  } finally {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
  }
});

test('fetchJson preserves bounded non-JSON error text without leaking secrets', { concurrency: false }, async () => {
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'plain-text-secret';
  try {
    await withMockFetch(
      async () => new Response('upstream failure plain-text-secret', { status: 502, statusText: 'Bad Gateway' }),
      async () => {
        await assert.rejects(
          fetchJson('https://example.test/non-json-error'),
          (error) => {
            assert.match(error.message, /HTTP 502 Bad Gateway/);
            assert.match(error.message, /upstream failure \[REDACTED\]/);
            assert.doesNotMatch(error.message, /plain-text-secret/);
            return true;
          },
        );
      },
    );
  } finally {
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
  }
});

test('fetchJson redacts sensitive response keys even when their values do not match known env secrets', { concurrency: false }, async () => {
  await withMockFetch(
    async () => new Response(JSON.stringify({
      success: false,
      api_token: 'unregistered-secret',
      nested: { authorization: 'Bearer should-not-appear' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    async () => {
      await assert.rejects(
        fetchJson('https://example.test/sensitive-fields'),
        (error) => {
          assert.match(error.message, /\[REDACTED\]/);
          assert.doesNotMatch(error.message, /unregistered-secret/);
          assert.doesNotMatch(error.message, /should-not-appear/);
          return true;
        },
      );
    },
  );
});


test('postlaunch-release remains executable as a CLI after importing fetchJson for tests', () => {
  const result = spawnSync(process.execPath, ['scripts/postlaunch-release.mjs', 'definitely-unknown-command'], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown post-launch release command: definitely-unknown-command/);
});

const origin = 'https://12345678-parkerhamilton-ca.example.workers.dev';
const headers = { 'CF-Access-Client-Id': 'invented-id', 'CF-Access-Client-Secret': 'invented-marker' };
function fixture(responses) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.redirect, 'manual');
    assert.equal(new URL(url).origin, origin, 'Every credentialed request stays on the approved origin');
    return responses.shift();
  } };
}
test('Successful response and headers are preserved', async () => {
  const response = new Response('ok', { status: 200, headers: { 'x-robots-tag': 'noindex' } });
  const mock = fixture([response]);
  assert.equal(await fetchPreviewSameOrigin(origin, headers, mock.fetch), response);
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].options.headers, headers);
});
for (const status of [301, 302, 303, 307, 308]) {
  test(`Same-origin ${status} canonical redirect works`, async () => {
    const mock = fixture([new Response(null, { status, headers: { location: '/work/coast-fi/' } }), new Response('ok')]);
    assert.equal((await fetchPreviewSameOrigin(origin, headers, mock.fetch)).status, 200);
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[1].url, origin + '/work/coast-fi/');
  });
  test(`Cross-origin ${status} sends no credentialed follow-up`, async () => {
    const mock = fixture([new Response(null, { status, headers: { location: 'https://other.example/' } })]);
    await assert.rejects(fetchPreviewSameOrigin(origin, headers, mock.fetch), /cannot forward Access credentials/);
    assert.equal(mock.calls.length, 1);
  });
}
for (const location of ['//other.example/', origin.replace('https:', 'http:') + '/', origin.replace('.dev', '.dev:444') + '/', origin.replace('https://', 'https://user:password@') + '/']) {
  test('Protocol-relative, downgrade, changed port, and userinfo redirects fail closed: ' + new URL(location, origin).protocol + '/' + (location.includes('@') ? 'userinfo' : location.includes(':444') ? 'port' : location.startsWith('//') ? 'host' : 'scheme'), async () => {
    const mock = fixture([new Response(null, { status: 302, headers: { location } })]);
    await assert.rejects(fetchPreviewSameOrigin(origin, headers, mock.fetch), /cannot forward Access credentials/);
    assert.equal(mock.calls.length, 1);
  });
}
test('Missing and invalid Location fail without a second request', async () => {
  for (const location of [null, 'http://[invalid']) {
    const mock = fixture([new Response(null, { status: 302, headers: location ? { location } : {} })]);
    await assert.rejects(fetchPreviewSameOrigin(origin, headers, mock.fetch), /Location/);
    assert.equal(mock.calls.length, 1);
  }
});
test('Redirect loop is bounded to six same-origin requests', async () => {
  const mock = fixture(Array.from({ length: 6 }, () => new Response(null, { status: 302, headers: { location: '/' } })));
  await assert.rejects(fetchPreviewSameOrigin(origin, headers, mock.fetch), /Too many preview redirects/);
  assert.equal(mock.calls.length, 6);
});
test('Blob URL with an embedded same HTTPS origin is not a credential destination', async () => {
  const mock = fixture([new Response(null, { status: 302, headers: { location: 'blob:' + origin + '/invented' } })]);
  await assert.rejects(fetchPreviewSameOrigin(origin, headers, mock.fetch), /cannot forward Access credentials/);
  assert.equal(mock.calls.length, 1);
});
test('404 and Access denial remain available to existing status assertions', async () => {
  for (const status of [401, 403, 404]) {
    const mock = fixture([new Response(null, { status })]);
    assert.equal((await fetchPreviewSameOrigin(origin, headers, mock.fetch)).status, status);
    assert.equal(mock.calls.length, 1);
  }
});
test('Unsafe initial URL makes no request', async () => {
  for (const url of ['http://example.test', 'https://user:password@example.test']) {
    let calls = 0;
    await assert.rejects(fetchPreviewSameOrigin(url, headers, async () => { calls++; }), /Clean HTTPS/);
    assert.equal(calls, 0);
  }
});
