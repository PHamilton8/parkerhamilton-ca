import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const homepage = fs.readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const featured = fs.readFileSync(new URL('../src/components/project/ProjectCardFeatured.astro', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const projects = fs.readFileSync(new URL('../src/data/projects.ts', import.meta.url), 'utf8');
const designDayCase = fs.readFileSync(new URL('../src/pages/work/design-day.astro', import.meta.url), 'utf8');

const forbiddenPublicCopy = [
  'Smaller in the homepage hierarchy, not smaller in substance.',
  'Three projects where the research, the decisions, and the thing that got built are all visible.',
  'Laser-powered musical instrument',
  'Breach Reporting',
  'MSc Candidate',
  'LinkedIn will be added when the verified public URL is supplied.',
  'askwill.ca / staging',
  'Line Graphs, Compound Growth & Retirement Decisions',
  'Rebuilding a local service business for the web',
  'testing drove the redesign',
  'testing validated accessibility',
];

test('homepage foundation excludes internal/obsolete public copy', () => {
  const corpus = homepage + featured + projects;
  for (const phrase of forbiddenPublicCopy) assert.equal(corpus.includes(phrase), false, phrase);
});

test('thesis preview contains both representations', () => {
  assert.match(featured, /table\.webp/);
  assert.match(featured, /graph\.webp/);
  assert.equal(/thesis-layered[^}]*display\s*:\s*none/s.test(css), false);
  assert.equal(/table-figure[^}]*display\s*:\s*none/s.test(css), false);
  assert.equal(/graph-figure[^}]*display\s*:\s*none/s.test(css), false);
});

test('more-work section is not wrapped in a giant contained panel', () => {
  assert.equal(/\.more-section\s*\{[^}]*background\s*:/s.test(css), false);
  assert.equal(/\.more-section\s*\{[^}]*border-radius\s*:/s.test(css), false);
});

test('minimum metadata and caption type is at least 12px equivalent', () => {
  assert.match(css, /project-metadata[\s\S]*font-size:\s*0\.76rem/);
  assert.match(css, /figcaption[\s\S]*font-size:\s*0\.76rem/);
});


test('audited public project copy is present', () => {
  assert.match(projects, /Line Graphs, Compound Growth & Retirement Judgments/);
  assert.match(projects, /Rebuilding AskWill's digital presence/);
  assert.match(projects, /accessibility-oriented physical prototype built through interdisciplinary collaboration and informally tested with users/);
});

test('the dynamic work shell can be safely replaced by dedicated pages', () => {
  const routeShell = fs.readFileSync(new URL('../src/pages/work/[slug].astro', import.meta.url), 'utf8');
  assert.match(routeShell, /project\.usesSharedShell/);
  assert.match(projects, /usesSharedShell: true/);
});


test('Design Day has a dedicated public-safe route with the approved evidence', () => {
  assert.match(projects, /slug: 'design-day'[\s\S]*usesSharedShell: false/);
  assert.match(designDayCase, /Open 1 winner, uOttawa Design Day Winter 2023/);
  assert.match(designDayCase, /Museum inspiration \/ reference — not our prototype\./);
  assert.match(designDayCase, /<video[^>]*controls[^>]*preload="metadata"/);
  assert.match(designDayCase, /actual sound from the functioning instrument/);
  assert.match(designDayCase, /roughly five people, including about three musicians/);
  assert.match(designDayCase, /illuminated interaction points[\s\S]*electronic control logic[\s\S]*synthesized sound/);
  for (const phrase of ['laser-powered', 'laser-controlled', 'testing validated accessibility', 'testing drove a redesign', 'Arduino', 'Raspberry Pi', 'MIDI']) {
    assert.equal(designDayCase.includes(phrase), false, phrase);
  }
});
