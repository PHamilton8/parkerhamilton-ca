import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROFILE = 'PARKER_EMERGENCY_INITIAL_LAUNCH_2026_09_15';
export const DEFERRED = Object.freeze([
  'authenticated immutable private preview',
  'independent owner-parity preview review',
  'Firefox release QA',
  'WebKit release QA',
  'exhaustive responsive visual and interaction QA',
  'full accessibility and contrast remediation/certification',
  'complete final-RC certification'
]);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const canonicalHash = value => sha(JSON.stringify(canonical(value)));
function localFile(root,relative) {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'), 'Request path must remain inside operator checkout');
  const full=path.join(root,relative);assert.ok(fs.lstatSync(full).isFile(),'Request must reference a regular file');return full;
}
export function readEmergencyRequest(root, requestPath) {
  const request=JSON.parse(fs.readFileSync(localFile(root,requestPath),'utf8'));
  assert.equal(request.schemaVersion,1);
  assert.equal(request.profile,PROFILE);
  assert.equal(request.approvedBy,'Parker Hamilton');
  assert.equal(request.repository,'PHamilton8/parkerhamilton-ca');
  assert.equal(request.operatorBranch,'codex/emergency-final-rc-integration');
  assert.equal(request.integrationBranch,'integration/final-rc-v1');
  assert.equal(request.productionFirst,true);
  assert.equal(request.privatePreviewDeferred,true);
  assert.equal(request.fullQaDeferred,true);
  const authority=fs.readFileSync(localFile(root,request.authorityPath));
  assert.match(request.authoritySha256,/^[a-f0-9]{64}$/);
  assert.equal(sha(authority),request.authoritySha256,'Owner emergency authorization bytes changed');
  const manifest=JSON.parse(fs.readFileSync(localFile(root,request.manifestPath),'utf8'));
  assert.equal(canonicalHash(manifest),request.manifestSha256,'Exact approved lane manifest changed');
  assert.equal(manifest.execution?.authorizedIntegrationBranch,request.integrationBranch);
  return {request,manifest,requestSha256:canonicalHash(request)};
}
export function assertAssemblyRepeat(first,second) {
  for(const key of ['finalCandidateSha','finalTreeSha','changedFiles','authorityToCommit']) assert.deepEqual(second[key],first[key],'Deterministic source reproduction differs: '+key);
  assert.match(first.finalCandidateSha,/^[a-f0-9]{40}$/);
  assert.match(first.finalTreeSha,/^[a-f0-9]{40}$/);
  return {status:'PASS',reproductions:2,sourceSha:first.finalCandidateSha,treeSha:first.finalTreeSha};
}
export function assertFocusedSmokeReport(report,summary) {
  assert.equal(report.status,'PASS');assert.equal(report.mode,'local');assert.equal(report.browser,'chromium');
  assert.equal(report.sourceSha,summary.finalCandidateSha);assert.equal(report.treeSha,summary.finalTreeSha);
  assert.equal(report.mutationPerformed,false);assert.equal(report.requestAuthentication,'NONE');assert.deepEqual(report.failures,[]);
  const routes=['/','/work/design-day','/work/reporting-workflow','/work/grocery-automation','/work/askwill','/work/coast-fi','/work/compound-growth','/work/smith-manoeuvre','/wealthsimple-2026'];
  assert.deepEqual(report.routes.map(r=>r.route).toSorted(),routes.toSorted());
  for(const route of report.routes)assert.equal(route.status,200);
  assert.equal(report.trueNoindex404,'PASS');assert.equal(report.sitemap.status,'PASS');
  assert.deepEqual(report.sitemap.routes.toSorted(),routes.filter(r=>r!=='/wealthsimple-2026').toSorted());
  const entries=summary.buildArtifact.files.map(f=>({path:f.path,size:f.bytes,sha256:f.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  // File manifest uses the exact lexicographic order employed by the smoke runner.
  entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  assert.equal(report.distManifestSha256,sha(JSON.stringify(entries,null,2)+'\n'));
  const served=summary.buildArtifact.files.filter(f=>!['_headers','_redirects'].includes(f.path));
  assert.equal(report.assets.length,served.length);
  for(const asset of served){const got=report.assets.find(x=>x.path===asset.path);assert.ok(got);assert.equal(got.sha256,asset.sha256);assert.equal(got.status,asset.path==='404.html'?404:200);}
  for(const route of ['/work/design-day','/wealthsimple-2026']){const media=report.routes.find(r=>r.route===route).media;assert.equal(media.nativePlayback,'PASS');assert.equal(media.activeCaption,'PASS');}
  return {status:'EMERGENCY_FOCUSED_CHROMIUM_PASS',routes:routes.length,assets:served.length,distManifestSha256:report.distManifestSha256};
}
