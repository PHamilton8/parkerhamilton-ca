import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p));
const readText = (p) => read(p).toString('utf8');
const sha256 = (p) => crypto.createHash('sha256').update(read(p)).digest('hex');
const gitBlob = (p) => {
  const bytes = read(p);
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

const routes = [
  '/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation', '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });
}

test('route source support is limited to the eight public routes, shared-shell generator, and 404', () => {
  const pages = walk(path.join(root, 'src/pages')).filter((p) => p.endsWith('.astro'));
  const rel = pages.map((p) => path.relative(path.join(root, 'src/pages'), p).replaceAll(path.sep, '/')).sort();
  const expected = ['404.astro', 'index.astro', 'work/[slug].astro', ...routes.slice(1).map((r) => `${r.slice('/work/'.length)}.astro`).map((f) => `work/${f}`)].sort();
  assert.deepEqual(rel, expected);
  const sharedShell = readText('src/pages/work/[slug].astro');
  assert.match(sharedShell, /projects\.filter\(\(project\) => project\.usesSharedShell\)/);
});

test('frozen Coast, Smith, and Compound engine/data blobs remain green-authority exact', () => {
  const blobs = {
    'src/lib/calculators/coastFi.ts': '329fc2b3873d1ef21789ffde95fb292b6b5d0add',
    'tests/fixtures/coast-fi/coast-fi-test-cases-v2.json': '865d42bd30f04b5b1dbd3052c752c99a7c6bf674',
    'public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx': '12b617d4d277119000a356c76355fb01c0fee51b',
    'src/lib/calculators/smithManoeuvre.ts': 'a34fa6ff3d398b581023475a1c9bf5e8e96286d0',
    'tests/fixtures/smith/smith-test-cases-v2.json': '41dc718cf3c3a1925db19493763310c849fa05de',
    'public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx': '40bef343bf92dfd70e8d536fb17aba71a9c7aee9',
    'src/data/compound-growth/fixedExperimentalData.ts': 'b7846c19d29ed983dbb2c716b312866f2f6efe98',
    'src/data/compound-growth/sources/projection-data.json': 'cccf41099bf89591c7a5ff31e187fdacc8642ec5',
    'src/data/compound-growth/sources/experiment-4-results.json': '30ca6ff6dda8a7950d4655c5fd468c23d54e0019',
    'src/data/compound-growth/sources/experiment-summary.json': '6a1d5d9971a2189d6a0f8fdb4443357a226d3246',
    'src/lib/calculators/compoundGrowth.ts': 'a20bf232c15f32381556c547cf38047d5a296832',
  };
  for (const [file, expected] of Object.entries(blobs)) assert.equal(gitBlob(file), expected, `${file} drifted from frozen green authority`);
});

const profile = process.env.QA_AUTHORITY_PROFILE ?? 'baseline';
const homeAuthorityRequired = profile === 'homepage-v3' || profile === 'final-rc';

test('Homepage locked source authority is exact when the profile requires it', { skip: !homeAuthorityRequired }, () => {
  const config = JSON.parse(readText('src/data/hero/final-config.json'));
  assert.equal(config.trajectory.k, 3.8);
  assert.equal(config.trajectory.render_samples, 320);
  assert.equal(config.cathedral_architecture.ribbon_count, 9);
  assert.match(readText('src/components/visualization/CathedralMonument.astro'), /viewBox="0 22\.5 610 446\.5"/);

  const exactAssets = {
    'public/assets/projects/compound-growth/homepage-graph-v3.webp': '5d1a4d003b72cc6cef8276dd9a4737f53ffe20f5',
    'public/assets/projects/compound-growth/homepage-table-v3.webp': '844d0031668538bcc84d9b8561b78b7a51b4680a',
    'public/assets/projects/smith-manoeuvre/smith.svg': '67b9d7dc77919f06f830b8acf43dcaee9a1f04dd',
    'public/assets/projects/reporting-workflow/workflow.svg': 'f0011b1c909ce89c9e66f7c0fba4f7d7a1c5f708',
    'public/assets/projects/coast-fi/coast.svg': 'e09ff5f953ea18190d02c61b6c5487a1908651d1',
    'public/assets/projects/grocery-automation/grocery.svg': 'fcac770b3acb15148e9f8e79dbeb4412ff39935b',
  };
  for (const [file, expected] of Object.entries(exactAssets)) assert.equal(gitBlob(file), expected, `${file} drifted from owner-locked Homepage asset provenance`);
});

test('approved public workbook bytes remain exact', () => {
  assert.equal(sha256('public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx'), '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a');
  assert.equal(sha256('public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx'), '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9');
  const downloads = fs.readdirSync(path.join(root, 'public/downloads')).sort();
  assert.deepEqual(downloads, ['Coast_FI_Calculator_Public_Sanitized.xlsx', 'Smith_Manoeuvre_Public_Sanitized_V2.xlsx']);
});

test('public/source safety rejects Drive, localhost/file URLs, and credential-like leaks', () => {
  const candidates = [walk(path.join(root, 'src')), walk(path.join(root, 'public'))].flat().filter((p) => {
    const rel = path.relative(root, p).replaceAll(path.sep, '/');
    return /\.(astro|ts|mjs|js|json|css|svg|txt)$/.test(rel);
  });
  const forbidden = [
    /https?:\/\/(?:drive|docs)\.google\.com\//i,
    /https?:\/\/localhost(?::\d+)?/i,
    /https?:\/\/127\.0\.0\.1(?::\d+)?/i,
    /file:\/\//i,
    /AIza[0-9A-Za-z_-]{20,}/,
  ];
  for (const file of candidates) {
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    const text = readText(rel);
    for (const pattern of forbidden) assert.equal(pattern.test(text), false, `${rel} contains forbidden public/release reference ${pattern}`);
  }
});
