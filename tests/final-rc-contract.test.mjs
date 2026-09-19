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

const indexableRoutes = [
  '/',
  '/work/design-day',
  '/work/reporting-workflow',
  '/work/grocery-automation',
  '/work/askwill',
  '/work/coast-fi',
  '/work/compound-growth',
  '/work/smith-manoeuvre',
];
const auxiliaryNoindexRoutes = ['/wealthsimple-2026'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : [p];
  });
}

function parseVttTime(value) {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return NaN;
}

function latestVttCueEnd(text) {
  let latest = 0;
  for (const match of text.matchAll(/(?:^|\n)\s*([0-9:.]+)\s*-->\s*([0-9:.]+)/g)) {
    const end = parseVttTime(match[2]);
    if (Number.isFinite(end)) latest = Math.max(latest, end);
  }
  return latest;
}

test('source route accounting is exactly 8 indexable portfolio routes plus 1 noindex auxiliary route', () => {
  const pages = walk(path.join(root, 'src/pages')).filter((p) => p.endsWith('.astro'));
  const rel = pages.map((p) => path.relative(path.join(root, 'src/pages'), p).replaceAll(path.sep, '/')).sort();
  const expected = [
    '404.astro',
    'index.astro',
    'wealthsimple-2026.astro',
    'work/[slug].astro',
    ...indexableRoutes.slice(1).map((route) => `work/${route.slice('/work/'.length)}.astro`),
  ].sort();
  assert.deepEqual(rel, expected);
  assert.deepEqual(auxiliaryNoindexRoutes, ['/wealthsimple-2026']);
  const sharedShell = readText('src/pages/work/[slug].astro');
  assert.match(sharedShell, /projects\.filter\(\(project\) => project\.usesSharedShell\)/);
});

test('frozen Coast and Smith engines/workbooks plus fixed Compound research evidence remain exact', () => {
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
  };
  for (const [file, expected] of Object.entries(blobs)) assert.equal(gitBlob(file), expected, `${file} drifted from frozen owner authority`);
});

test('Compound simulator is the final owner-authorized monthly model, not the superseded annual explorer', () => {
  const page = readText('src/pages/work/compound-growth.astro');
  const engine = readText('src/lib/calculators/compoundGrowth.ts');
  const explorer = readText('src/components/compound-growth/AnnualCompoundGrowthExplorer.astro');
  const combined = `${page}\n${explorer}\n${engine}`;
  assert.match(combined, /monthly/i);
  assert.match(combined, /(?:annualReturn|annual return|return)[\s\S]{0,120}(?:8|0\.08)/i);
  assert.doesNotMatch(combined, /default[^\n]{0,80}10%/i);
  assert.doesNotMatch(combined, /starting balance[^\n]{0,80}(?:input|editable)/i);
  assert.match(explorer, /starting invested balance is fixed at \$0\./);
  assert.match(explorer, /<input\b[^>]*id="cg-monthly-contribution"[^>]*value="100"/);
  assert.match(explorer, /<input\b[^>]*id="cg-annual-return"[^>]*value="8"/);
  assert.doesNotMatch(explorer, /<input\b[^>]*(?:startingPortfolio|starting-balance|initial-balance)/i);
  assert.match(engine, /Math\.expm1\(Math\.log1p\(normalized\.annualReturn\) \/ 12\)/);
  assert.doesNotMatch(engine, /(?:import|require)[^\n]*(?:fixedExperimentalData|projection-data|experiment-4-results|experiment-summary)/);
  const fixed = readText('src/data/compound-growth/fixedExperimentalData.ts');
  assert.match(fixed, /import experimentSummarySource from '\.\/sources\/experiment-summary\.json' with \{ type: 'json' \};/);
  const summary = JSON.parse(readText('src/data/compound-growth/sources/experiment-summary.json'));
  assert.equal(summary.program.number_of_experiments, 5, 'Frozen program contains exactly five experiments');
  assert.equal(summary.program.final_analytic_n_total, 1248, 'Frozen final analytic sample totals1248');
  assert.equal(summary.experiments.length, 5, 'Exactly five frozen experiment records');
});

test('Homepage and global ContactBand final source authority remain intact', () => {
  const config = JSON.parse(readText('src/data/hero/final-config.json'));
  assert.equal(config.trajectory.k, 3.8);
  assert.equal(config.trajectory.render_samples, 320);
  assert.equal(config.cathedral_architecture.ribbon_count, 9);
  assert.match(readText('src/components/visualization/CathedralMonument.astro'), /viewBox="0 22\.5 610 446\.5"/);
  const contact = readText('src/components/layout/ContactBand.astro');
  assert.match(contact, /class="contact-email-action"/);
  assert.match(contact, /background:\s*#f4f7f4/i);
  assert.match(contact, /min-height:\s*44px/i);
  assert.match(contact, /padding:\s*10px 12px/i);
  assert.match(contact, /gap:\s*8px/i);
  assert.equal(gitBlob('src/components/layout/ContactBand.astro'), '711e5ac0ee1ff64aab9aa393ad35a276b1faf187');
});

test('Design Day final media and caption timing are release exact', () => {
  assert.equal(sha256('public/assets/projects/design-day/design-day-working-demo.mp4'), 'fabce52ef316d6c2f7d6c3db546f6eb6a2fe9c1295ff0f64b30269c17adf1f5b');
  const page = readText('src/pages/work/design-day.astro');
  assert.match(page, /<video\b[^>]*\bcontrols\b/i);
  assert.match(page, /preload="metadata"/i);
  assert.match(page, /<track\b[^>]*kind="captions"[^>]*src="\/assets\/projects\/design-day\/design-day-working-demo\.vtt"/i);
  const vtt = readText('public/assets/projects/design-day/design-day-working-demo.vtt');
  assert.match(vtt, /^WEBVTT/m);
  const end = latestVttCueEnd(vtt);
  assert.ok(end > 0, 'Design Day VTT must contain timed cues');
  assert.ok(end <= 8.475 + 0.001, `Design Day VTT contains stale timing beyond 8.475s: ${end}`);
});

test('Wealthsimple route remains noindex/unlisted and exact media is captioned', () => {
  const page = readText('src/pages/wealthsimple-2026.astro');
  const base = readText('src/layouts/BaseLayout.astro');
  const projects = readText('src/data/projects.ts');
  const site = readText('src/data/site.ts');
  const sitemap = readText('src/pages/sitemap.xml.ts');
  assert.match(page, /Wealthsimple 2027 - Parker Hamilton/);
  assert.doesNotMatch(page, /Wealthsimple 2026 - Parker Hamilton/);
  assert.match(page, /canonicalPath="\/wealthsimple-2026"/);
  assert.match(page, /robots="noindex, noarchive"/);
  assert.match(page, /<video\b[^>]*\bcontrols\b/i);
  assert.match(page, /preload="metadata"/i);
  assert.match(page, /<track\b[^>]*kind="captions"[^>]*src="\/assets\/application\/wealthsimple-application-video\.vtt"/i);
  assert.match(base, /robots\?:\s*string/);
  assert.doesNotMatch(projects, /\/wealthsimple-2026/);
  assert.doesNotMatch(site, /\/wealthsimple-2026/);
  assert.doesNotMatch(sitemap, /wealthsimple-2026/);
  assert.equal(sha256('public/assets/application/wealthsimple-application-video.mp4'), '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14');
  assert.equal(sha256('public/assets/application/wealthsimple-application-video-poster.webp'), 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec');
  const vtt = readText('public/assets/application/wealthsimple-application-video.vtt');
  assert.match(vtt, /^WEBVTT/m);
  assert.ok(latestVttCueEnd(vtt) > 0, 'Wealthsimple VTT must contain synchronized timed cues');
  assert.ok(latestVttCueEnd(vtt) <= 101.652, 'Wealthsimple captions must remain within the exact approved media duration');
  assert.equal((page.match(/<track\b[^>]*kind="captions"/gi) ?? []).length, 1, 'Exactly one native caption track is required');
  assert.match(page, /<track\b[^>]*srclang="en"/i);
  assert.doesNotMatch(vtt, /BLOCKED|NOT RELEASE AUTHORITY|DRAFT[- ]ONLY|\[in\/out\]/i);
});

test('approved public workbook bytes remain exact', () => {
  assert.equal(sha256('public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx'), '469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a');
  assert.equal(sha256('public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx'), '3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9');
  const downloads = fs.readdirSync(path.join(root, 'public/downloads')).sort();
  assert.deepEqual(downloads, ['Coast_FI_Calculator_Public_Sanitized.xlsx', 'Smith_Manoeuvre_Public_Sanitized_V2.xlsx']);
});

test('public/source safety rejects private Drive, local URLs, credential-like leaks, and review-only artifacts', () => {
  const candidates = [walk(path.join(root, 'src')), walk(path.join(root, 'public'))].flat().filter((p) => {
    const rel = path.relative(root, p).replaceAll(path.sep, '/');
    return /\.(astro|ts|mjs|js|json|css|svg|txt|vtt)$/.test(rel);
  });
  const forbidden = [
    /https?:\/\/(?:drive|docs)\.google\.com\//i,
    /https?:\/\/localhost(?::\d+)?/i,
    /https?:\/\/127\.0\.0\.1(?::\d+)?/i,
    /file:\/\//i,
    /AIza[0-9A-Za-z_-]{20,}/,
    /owner[- ]review/i,
    /comparison[- ]preview/i,
  ];
  for (const file of candidates) {
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    const text = readText(rel);
    for (const pattern of forbidden) assert.equal(pattern.test(text), false, `${rel} contains forbidden public/release reference ${pattern}`);
  }
});
