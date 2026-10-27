import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strictJson, validateCleanAudit, qualify, validateReceipt, assertQualificationFresh, MAX_EVIDENCE_AGE_MS, artifactIdentity, cleanFingerprint, assertEmbeddedQualification } from '../scripts/clean-release-risk.mjs';
import { assertCurrentApproval } from '../scripts/release-risk-audit.mjs';
const clean = () => ({ auditReportVersion:2, vulnerabilities:{}, metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0},dependencies:{prod:184,dev:108,optional:111,peer:2,peerOptional:0,total:397}} });
const context = () => ({repository:'PHamilton8/parkerhamilton-ca',sourceSha:'a'.repeat(40),sourceTree:'b'.repeat(40),inputsSha256:'1'.repeat(64),policySha256:'2'.repeat(64),packageHashes:{'package.json':'3'.repeat(64)},runtime:{node:'v24.22.1'},toolchain:{npm:'11.19.1'},bundledUndiciVersion:'7.30.1',artifact:{algorithm:'sha256-manifest-v1',fileCount:66,sha256:'4'.repeat(64)}});
const receipt = () => qualify({before:context(),after:context(),auditText:JSON.stringify(clean()),auditExitCode:0,auditedAtUtc:new Date().toISOString()});
test('only complete zero-exit zero-vulnerability audit qualifies, never authorizes deployment',()=>{const r=receipt();assert.equal(r.status,'QUALIFIED_CLEAN_AUDIT');assert.equal(r.deployed,false);assert.equal(r.credentialedUploadAuthorized,false);});
for(const code of [1,2,null,'0',undefined]) test(`reject audit exit ${code}`,()=>assert.throws(()=>validateCleanAudit(JSON.stringify(clean()),code)));
for(const [name,mutate] of [
 ['entry despite zero totals',j=>j.vulnerabilities.unknown={}],['nonzero total',j=>j.metadata.vulnerabilities.total=1],['low finding',j=>j.metadata.vulnerabilities.low=1],['missing severity',j=>delete j.metadata.vulnerabilities.info],['missing dependencies',j=>delete j.metadata.dependencies],['partial dependency counts',j=>delete j.metadata.dependencies.dev],['empty graph',j=>j.metadata.dependencies.total=0],['negative counts',j=>j.metadata.dependencies.dev=-1],['error payload',j=>j.error={code:'NETWORK'}],['wrong version',j=>j.auditReportVersion=3],['missing vulnerabilities',j=>delete j.vulnerabilities],['array vulnerabilities',j=>j.vulnerabilities=[]],['missing metadata',j=>delete j.metadata],['coerced counts',j=>j.metadata.dependencies.total='397']
]) test(`reject ${name}`,()=>{const j=clean();mutate(j);assert.throws(()=>validateCleanAudit(JSON.stringify(j),0));});
for(const text of ['', '{', '{"error":{"code":"TIMEOUT"}}', '{"a":1,"a":2}', '{"nested":{"a":1,"a":2}}']) test(`reject malformed/incomplete/duplicate JSON ${text}`,()=>assert.throws(()=>validateCleanAudit(text,0)));
test('duplicate audit key is rejected even when both values look clean',()=>{const s=JSON.stringify(clean()).replace('"auditReportVersion":2','"auditReportVersion":2,"auditReportVersion":2');assert.throws(()=>validateCleanAudit(s,0),/Duplicate/);});
test('escaped duplicate keys rejected and nested distinct objects accepted',()=>{assert.throws(()=>strictJson('{"a":1,"\\u0061":2}'),/Duplicate/);assert.deepEqual(strictJson('{"a":{"x":1},"b":{"x":2}}'),{a:{x:1},b:{x:2}});});
for(const field of ['sourceSha','sourceTree','inputsSha256','policySha256','packageHashes','runtime','toolchain','artifact','bundledUndiciVersion']) test(`reject ${field} mutation during audit and before dispatch`,()=>{const changed=context();changed[field]='changed';assert.throws(()=>qualify({before:context(),after:changed,auditText:JSON.stringify(clean()),auditExitCode:0,auditedAtUtc:new Date().toISOString()}),/changed during audit/);assert.throws(()=>validateReceipt(receipt(),changed),/qualification mismatch/);});
test('audit body tampering rejected',()=>{const r=receipt();r.auditText+=' ';assert.throws(()=>validateReceipt(r,context()),/digest changed/);});
test('freshness is evidence age, rejects expiry boundary/future/invalid clock',()=>{const r=receipt(), t=Date.parse(r.auditedAtUtc);assert.doesNotThrow(()=>assertQualificationFresh(r,t));assert.throws(()=>assertQualificationFresh(r,t-1),/future/);assert.throws(()=>assertQualificationFresh(r,t+MAX_EVIDENCE_AGE_MS),/stale/);assert.throws(()=>assertQualificationFresh(r,NaN),/clock/);});
test('hashing cannot carry evidence across final-dispatch freshness boundary',()=>{const r=receipt(),t=Date.parse(r.auditedAtUtc);assertQualificationFresh(r,t+MAX_EVIDENCE_AGE_MS-1);let dispatched=false;assert.throws(()=>{assertQualificationFresh(r,t+MAX_EVIDENCE_AGE_MS);dispatched=true;});assert.equal(dispatched,false);});
test('legacy expired exception remains rejected, no normal-mode fallback',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-expired-'));try{fs.copyFileSync(new URL('../release-risk-exception.json',import.meta.url),path.join(dir,'release-risk-exception.json'));assert.throws(()=>assertCurrentApproval(dir,Date.parse('2026-10-27T20:00:00Z')),/EXPIRED/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('artifact hash detects byte/name/count changes and rejects symlinks',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clean-artifact-'));try{fs.writeFileSync(path.join(dir,'a'),'one');const a=artifactIdentity(dir);fs.writeFileSync(path.join(dir,'a'),'two');assert.notEqual(artifactIdentity(dir).sha256,a.sha256);fs.renameSync(path.join(dir,'a'),path.join(dir,'b'));assert.notEqual(artifactIdentity(dir).sha256,a.sha256);fs.symlinkSync(path.join(dir,'b'),path.join(dir,'link'));assert.throws(()=>artifactIdentity(dir),/symlink/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('clean qualification is explicit in CI and credential-free candidate audit precedes provider upload',()=>{const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');assert.match(ci,/clean-release-risk.mjs run dist/);assert.doesNotMatch(ci,/continue-on-error|--audit=false|--omit/);const preview=fs.readFileSync(new URL('../.github/workflows/cloudflare-preview.yml',import.meta.url),'utf8');assert.ok(preview.indexOf('clean-release-risk.mjs run dist')<preview.indexOf('--wrangler versions upload'));assert.match(preview,/assert-risk-artifact dist/);const helper=fs.readFileSync(new URL('../scripts/postlaunch-release.mjs',import.meta.url),'utf8');assert.match(helper,/case 'promote-version':\s*await promoteCleanCandidateVersion/);assert.match(helper,/assertEmbeddedQualification\(process.cwd\(\), manifest\)/);});

test('embedded qualification binds actual clean source tree, policy and manifest identities',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clean-embedded-'));
 const git=(...a)=>execFileSync('git',a,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 try {
  git('init');fs.writeFileSync(path.join(dir,'package.json'),'{}');git('add','package.json');
  const policy={schemaVersion:1,mode:'NORMAL_CLEAN_AUDIT',repository:'PHamilton8/parkerhamilton-ca',evidenceMaxAgeMs:MAX_EVIDENCE_AGE_MS,inputsSha256:cleanFingerprint(dir,git('write-tree')),runtime:{node:process.version,nodeUndici:process.versions.undici,openssl:process.versions.openssl},packageHashes:{'package.json':sha('{}')},toolchain:{npm:'11.19.1'},bundledUndiciVersion:'7.30.1'};
  fs.writeFileSync(path.join(dir,'release-clean-policy.json'),JSON.stringify(policy));git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');
  const c={...context(),sourceSha:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),inputsSha256:policy.inputsSha256,policySha256:sha(JSON.stringify(canonical(policy))),runtime:policy.runtime,packageHashes:policy.packageHashes,toolchain:policy.toolchain};
  const manifest={sourceSha:c.sourceSha,treeSha:c.sourceTree,distSha256:c.artifact.sha256,cleanQualification:qualify({before:c,after:c,auditText:JSON.stringify(clean()),auditExitCode:0,auditedAtUtc:new Date().toISOString()})};
  assert.doesNotThrow(()=>assertEmbeddedQualification(dir,manifest));
  for(const field of ['sourceSha','treeSha','distSha256']){const m=structuredClone(manifest);m[field]='0'.repeat(field==='distSha256'?64:40);assert.throws(()=>assertEmbeddedQualification(dir,m));}
  for(const field of ['policySha256','inputsSha256','toolchain','runtime','packageHashes']){const m=structuredClone(manifest);m.cleanQualification.context[field]='tampered';assert.throws(()=>assertEmbeddedQualification(dir,m));}
  for(const value of [0,-1,'66']){const m=structuredClone(manifest);m.cleanQualification.context.artifact.fileCount=value;assert.throws(()=>assertEmbeddedQualification(dir,m));}
  fs.writeFileSync(path.join(dir,'package.json'),'changed');assert.throws(()=>assertEmbeddedQualification(dir,manifest));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
