import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertBrowserMediaDuration } from '../scripts/final-rc-preview-remote.mjs';
import { MEDIA, AUXILIARY_ROUTE, parseVtt } from '../scripts/final-rc-preview-exec.mjs';

test('native duration gate distinguishes exact approved container/audio and WebKit video stream without broadening tolerance', () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    assert.equal(assertBrowserMediaDuration({ engine, route: '/work/design-day', duration: 8.475 }).expected, 8.475);
    const duration = engine === 'webkit' ? 101.635 : 101.652;
    const result = assertBrowserMediaDuration({ engine, route: AUXILIARY_ROUTE, duration });
    assert.equal(result.expected, engine === 'webkit' ? 101.63486666666667 : 101.652);
    assert.equal(result.toleranceSeconds, 0.001);
  }
});

test('native duration gate rejects wrong stream, stale clips, invalid numbers and changes beyond one millisecond', () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const expected = engine === 'webkit' ? 101.63486666666667 : 101.652;
    for (const duration of [NaN, Infinity, -1, 0, 16.016, expected - 0.0011, expected + 0.0011]) {
      assert.throws(() => assertBrowserMediaDuration({ engine, route: AUXILIARY_ROUTE, duration }));
    }
    assert.throws(() => assertBrowserMediaDuration({ engine, route: '/work/design-day', duration: 16.016 }));
  }
  assert.throws(() => assertBrowserMediaDuration({ engine: 'webkit', route: AUXILIARY_ROUTE, duration: 101.652 }));
  assert.throws(() => assertBrowserMediaDuration({ engine: 'chromium', route: AUXILIARY_ROUTE, duration: 101.635 }));
  assert.throws(() => assertBrowserMediaDuration({ engine: 'unknown', route: AUXILIARY_ROUTE, duration: 101.652 }));
  assert.throws(() => assertBrowserMediaDuration({ engine: 'chromium', route: '/', duration: 101.652 }));
});

test('authoritative media hashes and VTT upper bound remain container/audio exact', () => {
  assert.equal(MEDIA.wealthsimple.durationSeconds, 101.652);
  assert.equal(MEDIA.wealthsimple.videoSha256, '585bd8d3eb5d040f06bd82515fdcbbe9a8c55d696145405c09d6db3c4fcc5f14');
  assert.equal(MEDIA.wealthsimple.posterSha256, 'cae70f2f04abc54267d34742f2349adc5920616dd3f118fa984647c9173effec');
  assert.equal(MEDIA.designDay.durationSeconds, 8.475);
  assert.equal(MEDIA.designDay.videoSha256, 'fabce52ef316d6c2f7d6c3db546f6eb6a2fe9c1295ff0f64b30269c17adf1f5b');
  const vtt = 'WEBVTT\n\n00:01:40.000 --> 00:01:41.652\nSynthetic boundary cue for parser tests only.\n';
  assert.doesNotThrow(() => parseVtt(vtt, MEDIA.wealthsimple.durationSeconds));
  assert.throws(() => parseVtt(vtt.replace('41.652', '41.653'), MEDIA.wealthsimple.durationSeconds));
});

test('remote browser smoke actually invokes the reviewed duration gate', () => {
  const source = fs.readFileSync(new URL('../scripts/final-rc-preview-remote.mjs', import.meta.url), 'utf8');
  assert.match(source, /assertBrowserMediaDuration\(\{ engine, route, duration \}\);/);
});
