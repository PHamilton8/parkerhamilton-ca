import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../src/data/hero/final-config.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/lib/cathedralMonument.ts', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../src/components/visualization/CathedralMonument.astro', import.meta.url), 'utf8');
const hero = fs.readFileSync(new URL('../src/components/layout/HeroShell.astro', import.meta.url), 'utf8');

const { k, A, x0, x1, y0, render_samples: sampleCount } = config.trajectory;
const samplePoint = (t) => [
  x0 + (x1 - x0) * t,
  y0 - A * ((Math.exp(k * t) - 1) / (Math.exp(k) - 1)),
];

test('hero uses the locked HIGHEST Cathedral Monument constants', () => {
  assert.equal(config.selection.concept, 'Cathedral Monument');
  assert.equal(config.selection.colourway, 'Violet + Coral');
  assert.equal(config.selection.steepness, 'HIGHEST');
  assert.equal(k, 2);
  assert.equal(A, 324.1696);
  assert.equal(x0, 64.34);
  assert.equal(x1, 505.66);
  assert.equal(y0, 405.56);
  assert.ok(sampleCount >= 200);
  assert.equal(config.trajectory.no_spline_smoothing, true);
});

test('locked trajectory is monotonically steepening and convex in screen projection', () => {
  const points = Array.from({ length: 400 }, (_, index) => samplePoint(index / 399));
  const visibleSlopes = points.slice(1).map((point, index) => {
    const prior = points[index];
    return (prior[1] - point[1]) / (point[0] - prior[0]);
  });
  for (let index = 1; index < visibleSlopes.length; index += 1) {
    assert.ok(visibleSlopes[index] > visibleSlopes[index - 1], `slope failed at ${index}`);
  }

  const gains = Array.from({ length: 5 }, (_, index) => {
    const start = samplePoint(index / 5);
    const end = samplePoint((index + 1) / 5);
    return start[1] - end[1];
  });
  const expected = [24.9543301915, 37.2274860927, 55.5368831842, 82.8512939642, 123.5996065674];
  gains.forEach((gain, index) => assert.ok(Math.abs(gain - expected[index]) < 1e-6));
  for (let index = 1; index < gains.length; index += 1) assert.ok(gains[index] > gains[index - 1]);
  assert.equal(Math.max(...gains), gains.at(-1));
});

test('ribbon architecture and colour hierarchy are preserved exactly', () => {
  assert.deepEqual(config.cathedral_architecture.ribbon_widths, [13.4, 12, 11.2, 10.4, 9.8, 9, 8.5, 11.3, 13.8]);
  assert.deepEqual(config.cathedral_architecture.ribbon_opacities, [0.92, 0.36, 0.28, 0.42, 0.24, 0.18, 0.2, 0.34, 0.92]);
  assert.deepEqual(config.colour.ribbon_layer_colors, ['#7655DC', '#49318F', '#F26D57', '#7655DC', '#F26D57', '#F26D57', '#F26D57', '#49318F', '#7655DC']);
  assert.match(source, /0\.18 \+ 0\.82 \* t \* t/);
  assert.match(source, /2\.8 \/ 43/);
  assert.match(component, /data-cathedral-ribbon/);
  assert.doesNotMatch(component, /axis|equation|finance|chart/i);
});

test('production shell keeps the locked public hero copy', () => {
  assert.match(hero, />Researcher who <span>builds things\.<\/span><\/h1>/);
  assert.match(hero, /I investigate problems, figure out what matters, and build useful things around what I learn\./);
  assert.match(hero, /Explore my work/);
  assert.match(hero, /→/);
  assert.doesNotMatch(hero, /Hero visual in development|Reserved integration zone/);
});
