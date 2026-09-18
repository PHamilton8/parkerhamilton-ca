// Final prelaunch evidence generator; production source remains untouched by capture tooling.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const routes = [
  { key: 'home', path: '/' },
  { key: 'design-day', path: '/work/design-day' },
  { key: 'reporting-workflow', path: '/work/reporting-workflow' },
  { key: 'grocery-automation', path: '/work/grocery-automation' },
  { key: 'askwill', path: '/work/askwill' },
  { key: 'coast-fi', path: '/work/coast-fi' },
  { key: 'compound-growth', path: '/work/compound-growth' },
  { key: 'smith-manoeuvre', path: '/work/smith-manoeuvre' },
  { key: 'wealthsimple', path: '/wealthsimple-2026' },
  { key: '404', path: '/404' },
] as const;

const matrix = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1180, height: 820 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 },
  { width: 320, height: 568 },
] as const;

async function prepareForCapture(page: Page) {
  const images = page.locator('img');
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    if (!(await image.isVisible())) continue;
    await image.scrollIntoViewIfNeeded();
    await expect.poll(async () => image.evaluate((element) => {
      const img = element as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    }), { timeout: 5000 }).toBe(true);
  }

  const videos = page.locator('video');
  for (let index = 0; index < await videos.count(); index += 1) {
    await videos.nth(index).evaluate(async (element) => {
      const video = element as HTMLVideoElement;
      video.pause();
      if (video.readyState >= 1) return;
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 2500);
        video.addEventListener('loadedmetadata', () => {
          window.clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    });
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

test('generate final prelaunch V2 screenshot ZIP from exact source', async ({ page }, testInfo) => {
  test.setTimeout(30 * 60 * 1000);
  test.skip(testInfo.project.name !== 'chromium', 'Final screenshot evidence is generated once in Chromium.');

  const root = path.join(process.cwd(), 'test-results', 'final-prelaunch-v2-package');
  const fullRoot = path.join(root, 'full-page');
  const seamRoot = path.join(root, 'breakpoint-seams');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(fullRoot, { recursive: true });
  fs.mkdirSync(seamRoot, { recursive: true });

  const sourceSha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  const captures: string[] = [];

  for (const route of routes) {
    const directory = path.join(fullRoot, route.key);
    fs.mkdirSync(directory, { recursive: true });
    for (const viewport of matrix) {
      await page.setViewportSize(viewport);
      const response = await page.goto(route.path, { waitUntil: 'networkidle' });
      expect(response?.status(), `${route.path} at ${viewport.width}x${viewport.height}`).toBe(200);
      await prepareForCapture(page);
      const name = `${route.key}__${viewport.width}x${viewport.height}__chromium.png`;
      const target = path.join(directory, name);
      await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
      captures.push(path.relative(root, target));
    }
  }

  const seamCaptures = [
    ...[980, 981, 1023, 1024, 1025].map((width) => ({ key: 'homepage', route: '/', width, height: 900 })),
    ...[1440, 1536, 1920].map((width) => ({ key: 'smith', route: '/work/smith-manoeuvre', width, height: 1000 })),
    ...[1536, 1920].map((width) => ({ key: 'askwill', route: '/work/askwill', width, height: 1000 })),
    ...[1280, 1366, 1440, 1536, 1920].map((width) => ({ key: 'wealthsimple', route: '/wealthsimple-2026', width, height: 1000 })),
    ...[430, 390, 375, 360, 320].map((width) => ({ key: 'reporting', route: '/work/reporting-workflow', width, height: 844 })),
  ];

  for (const capture of seamCaptures) {
    await page.setViewportSize({ width: capture.width, height: capture.height });
    const response = await page.goto(capture.route, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await prepareForCapture(page);
    const name = `${capture.key}__${capture.width}x${capture.height}__chromium__seam.png`;
    const target = path.join(seamRoot, name);
    await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
    captures.push(path.relative(root, target));
  }

  const manifest = {
    package: 'ParkerHamilton.ca Final Prelaunch V2 Visual Repairs',
    source_sha: sourceSha,
    tree_sha: treeSha,
    branch: 'integration/wave2-complete-v1',
    pull_request: 22,
    production_promoted: false,
    matrix,
    routes,
    capture_count: captures.length,
    captures,
    generated_at_utc: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const zipPath = path.join(process.cwd(), 'test-results', `parkerhamilton-final-prelaunch-v2-${sourceSha.slice(0, 12)}.zip`);
  fs.rmSync(zipPath, { force: true });
  const python = [
    'import os, sys, zipfile',
    'root, out = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for base, _, files in os.walk(root):',
    '        for name in files:',
    '            p = os.path.join(base, name)',
    '            z.write(p, os.path.relpath(p, root))',
  ].join('\n');
  execFileSync('python3', ['-c', python, root, zipPath], { stdio: 'inherit' });

  expect(fs.statSync(zipPath).size).toBeGreaterThan(100_000);
  expect(captures.length).toBe(160);
});
