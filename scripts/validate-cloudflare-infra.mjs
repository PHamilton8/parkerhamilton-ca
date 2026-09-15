import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const readText = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const readJson = (path) => JSON.parse(readText(path));

const wrangler = readJson('wrangler.jsonc');
const packageJson = readJson('package.json');

assert.deepEqual(
  Object.keys(wrangler).sort(),
  ['$schema', 'assets', 'compatibility_date', 'name', 'preview_urls', 'workers_dev'].sort(),
  'wrangler.jsonc must remain an assets-only allowlist with no dynamic infrastructure keys',
);
assert.equal(wrangler.$schema, './node_modules/wrangler/config-schema.json');
assert.equal(wrangler.name, 'parkerhamilton-ca');
assert.equal(wrangler.compatibility_date, '2026-09-10');
assert.equal(wrangler.workers_dev, false);
assert.equal(wrangler.preview_urls, true);
assert.deepEqual(
  Object.keys(wrangler.assets).sort(),
  ['directory', 'html_handling', 'not_found_handling'].sort(),
  'assets config must remain static-only',
);
assert.equal(wrangler.assets.directory, './dist');
assert.equal(wrangler.assets.not_found_handling, '404-page');
assert.equal(wrangler.assets.html_handling, 'auto-trailing-slash');

const forbiddenWranglerKeys = [
  'main',
  'binding',
  'run_worker_first',
  'vars',
  'env',
  'account_id',
  'zone_id',
  'route',
  'routes',
  'kv_namespaces',
  'r2_buckets',
  'd1_databases',
  'services',
  'unsafe',
  'durable_objects',
  'queues',
  'send_email',
  'analytics_engine_datasets',
];
const serializedWrangler = JSON.stringify(wrangler);
for (const key of forbiddenWranglerKeys) {
  assert.equal(
    new RegExp(`"${key}"\\s*:`).test(serializedWrangler),
    false,
    `wrangler.jsonc must not contain ${key}`,
  );
}

assert.equal(
  packageJson.devDependencies?.wrangler,
  '4.131.1',
  'Wrangler must be pinned exactly for reproducible builds',
);

const releaseBuild = packageJson.scripts?.['release:build'] ?? '';
assert.equal(packageJson.scripts?.['infra:preview-dry-run'], 'wrangler versions upload --dry-run', 'Preview dry run must not upload or activate a version');
assert.equal(packageJson.scripts?.['infra:validate'], 'node scripts/validate-cloudflare-infra.mjs');
assert.equal(packageJson.scripts?.['infra:validate-dist'], 'node scripts/validate-release-dist.mjs');
const requiredReleaseSteps = [
  'npm run check',
  'npm test',
  'npm run public-safety',
  'npm run build',
  'npm run infra:validate-dist',
];
let previousIndex = -1;
for (const step of requiredReleaseSteps) {
  const index = releaseBuild.indexOf(step);
  assert.ok(index > previousIndex, `release:build must include ${step} in the accepted order`);
  previousIndex = index;
}

const previewWorkflow = readText('.github/workflows/cloudflare-preview.yml');
assert.match(previewWorkflow, /workflow_dispatch:/);
// V3 supersedes the old main-only direct upload: the reviewed runner owns Access
// proof, certification and unpublished upload; the dispatch accepts no production branch.
assert.match(previewWorkflow, /refs\/heads\/prep\/final-release-tooling-v3-reviewed-replacement/);
assert.match(previewWorkflow, /refs\/heads\/integration\/final-rc-v1/);
assert.doesNotMatch(previewWorkflow, /refs\/heads\/(?:main|master|production)\b/);
assert.match(previewWorkflow, /CREATE_PRIVATE_FINAL_RC_PREVIEW/);
assert.match(previewWorkflow, /node scripts\/final-rc-preview\.mjs --verify-only/);
assert.match(previewWorkflow, /node scripts\/final-rc-preview\.mjs preview --rc "\$RC_REF" --authorize CREATE_PRIVATE_FINAL_RC_PREVIEW/);
assert.doesNotMatch(previewWorkflow, /wrangler\s+(?:deploy|rollback)|versions\s+deploy|dns_records|custom_domains/);

const productionWorkflow = readText('.github/workflows/cloudflare-production-release.yml');
assert.match(productionWorkflow, /workflow_dispatch:/);
assert.match(productionWorkflow, /refs\/heads\/main/);
assert.match(productionWorkflow, /DEPLOY parkerhamilton\.ca/);
assert.match(productionWorkflow, /wrangler deploy/);

const headers = readText('public/_headers');
assert.match(headers, /https:\/\/:version\.:subdomain\.workers\.dev\/\*/);
assert.match(headers, /X-Robots-Tag:\s*noindex, nofollow, noarchive/);
assert.match(headers, /\/_astro\/\*/);
assert.match(headers, /max-age=31556952, immutable/);
assert.match(headers, /\/downloads\/\*\.xlsx/);
assert.match(headers, /Content-Disposition:\s*attachment/);

const redirects = readText('public/_redirects');
assert.doesNotMatch(redirects, /^\s*\/\S+\s+\S+\s+30[1278]\s*$/m, 'No unreviewed site-path redirects may be introduced in this prep branch');

for (const file of [
  'wrangler.jsonc',
  'public/_headers',
  'public/_redirects',
  '.github/workflows/cloudflare-preview.yml',
  '.github/workflows/cloudflare-production-release.yml',
  '.github/workflows/cloudflare-infrastructure-qa.yml',
]) {
  const text = readText(file);
  assert.doesNotMatch(text, /askwill|resend/i, `${file} must not inherit AskWill or Resend infrastructure`);
}

console.log('PASS: Cloudflare release infrastructure remains assets-only, pinned, preview-safe, and free of foreign dynamic infrastructure.');
