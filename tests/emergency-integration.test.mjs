import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PROFILE,DEFERRED,canonicalHash,readEmergencyRequest,assertAssemblyRepeat,assertFocusedSmokeReport} from '../scripts/final-rc/emergency-contract.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('normal assembler primitives and full validation workflow remain byte-identical',()=>{
  const original=execFileSync('git',['show','63ae5cc128e8ebeff69c65dba604130c337ee8bd:scripts/final-rc/assemble.mjs'],{cwd:root,encoding:'utf8'});
  const changed=fs.readFileSync(path.join(root,'scripts/final-rc/assemble.mjs'),'utf8');
  const core=original.slice(0,-'main();\n'.length);assert.ok(original.endsWith('main();\n'));
  assert.equal(changed.slice(0,core.length),core);
  assert.equal(fs.readFileSync(path.join(root,'.github/workflows/final-rc-certified-integration.yml'),'utf8'),execFileSync('git',['show','63ae5cc128e8ebeff69c65dba604130c337ee8bd:.github/workflows/final-rc-certified-integration.yml'],{cwd:root,encoding:'utf8'}));
});
test('emergency authorization is exact and rejects changed manifest, authority, or target',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'emergency-request-test-'));
  try{
    const authority='Direct owner emergency authorization fixture\n';fs.writeFileSync(path.join(dir,'authority.md'),authority);
    const manifest={execution:{authorizedIntegrationBranch:'integration/final-rc-v1'},source:'a'.repeat(40)};fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
    const request={schemaVersion:1,profile:PROFILE,approvedBy:'Parker Hamilton',repository:'PHamilton8/parkerhamilton-ca',operatorBranch:'codex/emergency-final-rc-integration',integrationBranch:'integration/final-rc-v1',productionFirst:true,privatePreviewDeferred:true,fullQaDeferred:true,authorityPath:'authority.md',authoritySha256:hash(authority),manifestPath:'manifest.json',manifestSha256:canonicalHash(manifest)};
    const save=value=>fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(value));save(request);
    assert.deepEqual(readEmergencyRequest(dir,'request.json').manifest,manifest);
    for(const delta of [{productionFirst:false},{fullQaDeferred:false},{integrationBranch:'main'},{profile:'normal'},{manifestSha256:'0'.repeat(64)},{authoritySha256:'0'.repeat(64)},{authorityPath:'../authority.md'}]){
      save({...request,...delta});assert.throws(()=>readEmergencyRequest(dir,'request.json'));
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('both cheap source reproductions require identical commits, tree, ownership and patch lineage',()=>{
  const before={finalCandidateSha:'a'.repeat(40),finalTreeSha:'b'.repeat(40),changedFiles:[{path:'src/pages/index.astro',ownerLane:'homepage'}],authorityToCommit:{homepage:{sourceCommits:['c'.repeat(40)]}}};
  assert.equal(assertAssemblyRepeat(before,structuredClone(before)).status,'PASS');
  for(const key of Object.keys(before)){const after=structuredClone(before);after[key]=null;assert.throws(()=>assertAssemblyRepeat(before,after));}
});
test('focused Chromium certificate cannot claim deferred full QA, skip routes, change bytes, or omit captions',()=>{
  const routes=['/','/work/design-day','/work/reporting-workflow','/work/grocery-automation','/work/askwill','/work/coast-fi','/work/compound-growth','/work/smith-manoeuvre','/wealthsimple-2026'];
  const files=[{path:'index.html',bytes:3,sha256:hash('abc')},{path:'404.html',bytes:3,sha256:hash('404')}].sort((a,b)=>a.path<b.path?-1:1);
  const summary={finalCandidateSha:'a'.repeat(40),finalTreeSha:'b'.repeat(40),buildArtifact:{files}};
  const report={status:'PASS',mode:'local',browser:'chromium',sourceSha:summary.finalCandidateSha,treeSha:summary.finalTreeSha,mutationPerformed:false,requestAuthentication:'NONE',failures:[],routes:routes.map(route=>({route,status:200,media:{nativePlayback:'PASS',activeCaption:'PASS'}})),trueNoindex404:'PASS',sitemap:{status:'PASS',routes:routes.slice(0,8)},assets:files.map(f=>({path:f.path,sha256:f.sha256,status:f.path==='404.html'?404:200})),distManifestSha256:hash(JSON.stringify(files.map(f=>({path:f.path,size:f.bytes,sha256:f.sha256})),null,2)+'\n')};
  assert.equal(assertFocusedSmokeReport(report,summary).status,'EMERGENCY_FOCUSED_CHROMIUM_PASS');
  const mutations=[r=>r.status='FAIL',r=>r.sourceSha='c'.repeat(40),r=>r.routes.pop(),r=>r.assets[0].sha256='0'.repeat(64),r=>r.routes.find(x=>x.route==='/wealthsimple-2026').media.activeCaption='FAIL',r=>r.trueNoindex404='FAIL',r=>r.sitemap.routes.push('/wealthsimple-2026'),r=>r.failures.push('runtime error')];
  for(const mutate of mutations){const bad=structuredClone(report);mutate(bad);assert.throws(()=>assertFocusedSmokeReport(bad,summary));}
  assert.ok(DEFERRED.includes('complete final-RC certification'));
});
test('orchestrator keeps one minimum-gate invocation and no production mutation command',()=>{
  const source=fs.readFileSync(path.join(root,'scripts/final-rc/assemble-emergency.mjs'),'utf8');
  assert.equal((source.match(/runMinimumGates\(second\.worktree/g)??[]).length,1);
  assert.equal((source.match(/buildSource\(repoRoot,policy,laneInspections,fileOwners,overlay,outputDir,/g)??[]).length,2);
  assert.doesNotMatch(source,/runFinalHarness\(|runWaveTests\(|\['deploy'|versions.*deploy|fetch\(.*cloudflare|--force.*push|push.*--force/);
  assert.match(source,/DEFERRED\.map/);
});

