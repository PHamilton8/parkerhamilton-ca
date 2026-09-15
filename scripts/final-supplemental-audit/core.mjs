import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const INDEXABLE = ['/', '/work/design-day', '/work/reporting-workflow', '/work/grocery-automation', '/work/askwill', '/work/coast-fi', '/work/compound-growth', '/work/smith-manoeuvre'];
export const ROUTES = [...INDEXABLE, '/wealthsimple-2026'];
export const WIDTHS = [1440, 1024, 820, 430, 390, 360, 320];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function safeBase(value, mode) {
  assert(['local', 'preview', 'production'].includes(mode), 'Known audit mode required');
  const url = new URL(value);
  assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use a clean origin');
  if (mode === 'local') assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Local audit uses loopback HTTP');
  else assert(url.protocol === 'https:' && !url.port, 'Remote audit requires standard HTTPS');
  if (mode === 'preview') assert(/^[a-z0-9]{8,}-[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname), 'Immutable versioned Worker preview required');
  if (mode === 'production') assert(url.origin === 'https://parkerhamilton.ca', 'Production apex only');
  return url.origin;
}
export function authHeaders(mode, environment) {
  if (mode !== 'preview') return {};
  assert(environment.CF_ACCESS_CLIENT_ID?.trim() && environment.CF_ACCESS_CLIENT_SECRET?.trim(), 'Preview service credentials must be available securely');
  return { 'CF-Access-Client-Id': environment.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': environment.CF_ACCESS_CLIENT_SECRET };
}
export function sameOriginRequest(url, base, method = 'GET') {
  const target = new URL(url);
  assert.equal(target.origin, base, 'Automatic cross-origin request rejected');
  assert(['GET', 'HEAD'].includes(method.toUpperCase()), 'Audit network is read-only');
  assert(!target.username && !target.password, 'URL credentials rejected');
  return target;
}
export function safeRedirect(location, current, base) {
  const target = new URL(location, current);
  sameOriginRequest(target.href, base);
  return target.href;
}
export function safeError(error, environment = process.env) {
  let message = String(error?.message ?? error);
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET', 'PREVIEW_REVIEW_EMAIL']) {
    const value = environment[key];
    if (value) message = message.split(value).join('[REDACTED]');
  }
  return message.replace(/(CF-Access-Client-(?:Id|Secret)\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]').slice(0, 1800);
}
export function manifestEntries(parsed) {
  const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? parsed.files;
  assert(Array.isArray(entries) && entries.length > 0, 'Nonempty certified file manifest required');
  const map = new Map();
  for (const item of entries) {
    assert(typeof item.path === 'string' && item.path && !item.path.startsWith('/') && !item.path.split('/').includes('..'), 'Manifest path is relative and contained');
    assert(/^[a-f0-9]{64}$/.test(item.sha256), 'Exact asset SHA256 required');
    assert(!map.has(item.path), 'Duplicate manifest path rejected');
    map.set(item.path, item);
  }
  return map;
}
export function routeFile(route) { assert(ROUTES.includes(route)); return route === '/' ? 'index.html' : `${route.slice(1)}/index.html`; }
export function verifyBody(bytes, expected, label) { assert.equal(sha256(bytes), expected.sha256, `${label}: exact certified bytes`); }
