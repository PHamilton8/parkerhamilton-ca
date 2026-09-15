import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareSourceOverlay, candidateIdentity, assertUnchanged, validatePhase, buildWaveCommand, runSourceWave, verifyLandedOverlay, gateEnvironment, sha256, SOURCE_PATH, INTEGRITY_PATH, SOURCE_COMPANIONS, BASE_SOURCE_COMMAND, BASE_SOURCE_SHA256, LANE_ORDER } from '../scripts/final-rc/source-overlay.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=(root,args,encoding='utf8')=>execFileSync('git',args,{cwd:root,encoding,stdio:['ignore','pipe','pipe']});
const baseline=git(repository,['show','5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e:'+SOURCE_PATH],null);
const fixtureSource='// FINAL_RC_SOURCE_CONTRACT_INTERFACE = 1\n// Synthetic extraction fixture only; not final-route certification.\n';
function write(root,relative,bytes){const p=path.join(root,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
function commit(root){git(root,['add','.']);git(root,['-c','user.name=Assembler fixture','-c','user.email=fixture@example.invalid','commit','-qm','Deterministic test fixture']);return git(root,['rev-parse','HEAD']).trim();}
function fixture(t,{source=fixtureSource,pin={},symlink=false}={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-overlay-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'repo');fs.mkdirSync(root);git(root,['init','-q']);
  if(symlink){write(root,'target.mjs',source);fs.mkdirSync(path.join(root,'tests'));fs.symlinkSync('../target.mjs',path.join(root,SOURCE_PATH));}
  else write(root,SOURCE_PATH,source);
  write(root,INTEGRITY_PATH,JSON.stringify({schemaVersion:1,interfaceVersion:1,sourcePath:SOURCE_PATH,sha256:sha256(source),reviewStatus:'REVIEWED_CURRENT_AUTHORITY_SOURCE_CONTRACT',...pin}));
  const toolingCommit=commit(root);
  if(symlink)fs.unlinkSync(path.join(root,SOURCE_PATH));
  write(root,SOURCE_PATH,baseline);
  write(root,'package.json',JSON.stringify({scripts:{'test:source':BASE_SOURCE_COMMAND}}));
  for(const p of SOURCE_COMPANIONS)write(root,p,'// unchanged companion fixture\n');
  commit(root);
  return {root,directory,toolingCommit,output:path.join(directory,'external')};
}
const phase={phase:'compound',includedLanes:['homepage','coast','compound','smith','releaseTooling'],appliedLanes:['homepage','coast','compound']};

test('authorized base source digest is independently pinned',()=>assert.equal(sha256(baseline),BASE_SOURCE_SHA256));
test('extracts source from exact committed authority despite different operator working bytes',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  assert.equal(fs.readFileSync(overlay.sourceFile,'utf8'),fixtureSource);
  assert.equal(overlay.sourceSha256,sha256(fixtureSource));
  assert.equal(overlay.toolingCommit,f.toolingCommit);
  assert.match(overlay.sourceBlob,/^[a-f0-9]{40}$/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.output,'source-overlay-identity.json'))),overlay);
});
test('rejects floating ref, missing source, and unreviewed or unrecognized pin schema',t=>{
  const f=fixture(t);
  assert.throws(()=>prepareSourceOverlay(f.root,'HEAD',f.output),/full Git SHA/);
  for(const pin of [{reviewStatus:'DRAFT_PENDING_REVIEW'},{sourcePath:'src/pages/index.astro'},{interfaceVersion:2},{schemaVersion:2},{extra:true}]){
    const x=fixture(t,{pin});assert.throws(()=>prepareSourceOverlay(x.root,x.toolingCommit,x.output));
  }
  git(f.root,['rm',SOURCE_PATH]);const missing=commit(f.root);
  assert.throws(()=>prepareSourceOverlay(f.root,missing,f.output),/regular committed blob/);
});
test('rejects integrity mismatch without decoding or accepting arbitrary bytes',t=>{
  const f=fixture(t,{pin:{sha256:'f'.repeat(64)}});
  assert.throws(()=>prepareSourceOverlay(f.root,f.toolingCommit,f.output),/SHA-256 mismatch/);
  assert.equal(fs.existsSync(f.output),false);
});
test('rejects committed source symlinks and interface-less replacement',t=>{
  for(const options of [{symlink:true},{source:'// no phase capability\n'}]) {
    const f=fixture(t,options);assert.throws(()=>prepareSourceOverlay(f.root,f.toolingCommit,f.output));
  }
});
test('rejects overlay inside candidate and symlinked output into candidate',t=>{
  const f=fixture(t);
  assert.throws(()=>prepareSourceOverlay(f.root,f.toolingCommit,path.join(f.root,'overlay')),/outside/);
  fs.symlinkSync(f.root,f.output);
  assert.throws(()=>prepareSourceOverlay(f.root,f.toolingCommit,f.output),/outside/);
});
test('never overwrites prior extracted source evidence',t=>{
  const f=fixture(t);prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  assert.throws(()=>prepareSourceOverlay(f.root,f.toolingCommit,f.output),/Never overwrite/);
});
test('phase applies exactly the included completed prefix, permitting only explicitly skipped lanes',()=>{
  assert.doesNotThrow(()=>validatePhase(phase));
  for(const changed of [
    {phase:'unknown'},{phase:'releaseTooling'},{includedLanes:['homepage','coast','compound','smith']},
    {includedLanes:['homepage','compound','coast','smith','releaseTooling']},
    {includedLanes:['homepage','coast','compound','compound','releaseTooling']},
    {includedLanes:['homepage','coast','unknown','compound','releaseTooling']},
    {appliedLanes:['homepage','coast']},{appliedLanes:['homepage','coast','compound','smith']},
    {appliedLanes:['homepage','compound','coast']},{laneOrder:[...LANE_ORDER].reverse()},
  ])assert.throws(()=>validatePhase({...phase,...changed}),JSON.stringify(changed));
});
test('replaces only the obsolete module and preserves every source companion and Node test flag',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  assert.deepEqual(buildWaveCommand(f.root,overlay.sourceFile),{command:process.execPath,args:['--test',overlay.sourceFile,...SOURCE_COMPANIONS]});
});
test('unexpected package source command or obsolete bytes fails instead of dropping a suite',t=>{
  const f=fixture(t);write(f.root,'package.json',JSON.stringify({scripts:{'test:source':BASE_SOURCE_COMMAND+' tests/additional.test.mjs'}}));
  assert.throws(()=>buildWaveCommand(f.root,'/external'),/Unexpected source-suite/);
  write(f.root,'package.json',JSON.stringify({scripts:{'test:source':BASE_SOURCE_COMMAND}}));
  write(f.root,SOURCE_PATH,Buffer.concat([baseline,Buffer.from('\n')]));
  assert.throws(()=>buildWaveCommand(f.root,'/external'),/Unexpected pre-tooling/);
});
test('successful external gate records exact context and preserves candidate bytes, SHA, tree and status',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output),before=candidateIdentity(f.root);
  let count=0;
  const result=runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.directory,'contexts'),run:(command,args,env)=>{
    count++;assert.equal(command,process.execPath);assert.deepEqual(args.slice(2),SOURCE_COMPANIONS);
    assert.equal(env.QA_AUTHORITY_PROFILE,'assembler-wave');
    const c=JSON.parse(fs.readFileSync(env.FINAL_RC_SOURCE_CONTEXT));
    assert.deepEqual(c.appliedLanes,phase.appliedLanes);assert.equal(c.candidateTree,before.candidateTree);assert.equal(c.sourceSha256,overlay.sourceSha256);
    return {exitCode:0};
  }});
  assert.equal(count,1);assert.equal(result.exitCode,0);assertUnchanged(before,candidateIdentity(f.root));
  assert.ok(fs.existsSync(path.join(f.directory,'contexts/source-invariant-compound.json')));
});
test('context path inside candidate is rejected before any gate executes',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);let called=false;
  assert.throws(()=>runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.root,'context'),run:()=>{called=true}}),/outside/);
  assert.equal(called,false);
});
test('dirty candidate, mutated extraction, or duplicate context cannot be blessed',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  const call=()=>runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.directory,'contexts'),run:()=>({exitCode:0})});
  write(f.root,'unexpected.txt','dirty');assert.throws(call,/must be clean/);fs.unlinkSync(path.join(f.root,'unexpected.txt'));
  fs.chmodSync(overlay.sourceFile,0o644);fs.writeFileSync(overlay.sourceFile,'tampered');assert.throws(call,/changed before execution/);
  fs.writeFileSync(overlay.sourceFile,fixtureSource);call();assert.throws(call,/EEXIST/);
});
test('passing or failing source process cannot mutate tracked or untracked candidate bytes',t=>{
  for(const fail of [false,true])for(const file of [SOURCE_PATH,'untracked.txt']){
    const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
    assert.throws(()=>runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.directory,'contexts'),run:()=>{write(f.root,file,'changed');if(fail)throw Error('failed original gate');}}),/mutated candidate/);
    const evidence=JSON.parse(fs.readFileSync(path.join(f.directory,'contexts/source-invariant-compound.json')));
    assert.notEqual(evidence.before.candidateStatus,evidence.after.candidateStatus);
    if(fail)assert.equal(evidence.gateError,'failed original gate');
  }
});
test('failed unchanged gate retains its failure and complete identity evidence',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  assert.throws(()=>runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.directory,'contexts'),run:()=>{throw Error('real test failure')}}),/real test failure/);
  const evidence=JSON.parse(fs.readFileSync(path.join(f.directory,'contexts/source-invariant-compound.json')));assert.deepEqual(evidence.before,evidence.after);
});
test('tooling landing must contain identical reviewed source and pin',t=>{
  const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  assert.throws(()=>verifyLandedOverlay(f.root,overlay),/Landed source-test/);
  write(f.root,SOURCE_PATH,fixtureSource);assert.doesNotThrow(()=>verifyLandedOverlay(f.root,overlay));
  const pin=JSON.parse(fs.readFileSync(path.join(f.root,INTEGRITY_PATH)));pin.sha256='0'.repeat(64);write(f.root,INTEGRITY_PATH,JSON.stringify(pin));assert.throws(()=>verifyLandedOverlay(f.root,overlay));
});
test('final/default gate environment cannot inherit a wave override or baseline profile',()=>{
  const saved={...process.env};try{
    process.env.FINAL_RC_SOURCE_CONTEXT='/untrusted/context';process.env.QA_AUTHORITY_PROFILE='baseline';
    const final=gateEnvironment('final-rc');assert.equal(final.QA_AUTHORITY_PROFILE,'final-rc');assert.equal(final.FINAL_RC_SOURCE_CONTEXT,undefined);
    const plain=gateEnvironment();assert.equal(plain.FINAL_RC_SOURCE_CONTEXT,undefined);assert.equal(plain.QA_AUTHORITY_PROFILE,undefined);
    assert.throws(()=>gateEnvironment('final-rc','/context'));assert.throws(()=>gateEnvironment('baseline'));assert.throws(()=>gateEnvironment('assembler-wave'));
  }finally{delete process.env.FINAL_RC_SOURCE_CONTEXT;delete process.env.QA_AUTHORITY_PROFILE;Object.assign(process.env,saved)}
});
test('assembler keeps policy bytes, wave gates, model suites and explicit final-browser profile',()=>{
  const original=git(repository,['show','84da5699ff5ef9ca207c85bdde71ef496736a0b6:scripts/final-rc/policy.json'],null);
  assert.deepEqual(fs.readFileSync(path.join(repository,'scripts/final-rc/policy.json')),original);
  const source=fs.readFileSync(path.join(repository,'scripts/final-rc/assemble.mjs'),'utf8');
  for(const required of ["runScript('check')","runScript('test:engines')","runScript('test')","runScript('public-safety')","runScript('build')","['audit', '--audit-level=high']","['--silent', 'run', 'test:browser', '--', '--reporter=json'], { QA_AUTHORITY_PROFILE: 'final-rc' }",'assertCompleteBrowserReport(report)'])assert.ok(source.includes(required),required);
  assert.ok(source.indexOf("runScript('check')")<source.indexOf('runSourceWave({'));
  assert.ok(source.indexOf('runSourceWave({')<source.indexOf("runScript('test:engines')"));
  assert.doesNotMatch(source,/--(?:strategy|strategy-option)[^\n]*(?:ours|theirs)|push[^\n]*--force/);
});

test('actual replacement executes historical assertions before Coast and rejects old Coast in the final Coast phase',t=>{
  const source=fs.readFileSync(path.join(repository,SOURCE_PATH),'utf8');
  const f=fixture(t,{source});
  // This baseline expectation must stay valid even when the test runs on the RC.
  const sourceFiles=git(repository,['ls-tree','-r','--name-only','5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e','--','src']).trim().split('\n');
  for(const file of sourceFiles)write(f.root,file,git(repository,['show','5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e:'+file],null));
  commit(f.root);
  const overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
  const run=(command,args,env)=>{
    const result=spawnSync(command,args,{cwd:f.root,encoding:'utf8',env:gateEnvironment(env.QA_AUTHORITY_PROFILE,env.FINAL_RC_SOURCE_CONTEXT)});
    assert.match(result.stdout,/Coast FI copy lock is present without changing engine-facing contract/,'Child must really execute the route assertion suite.');
    if(result.status!==0)throw Error(result.stdout+'\n'+result.stderr);
    return {...result,exitCode:result.status};
  };
  const includedLanes=['homepage','coast','releaseTooling'];
  assert.doesNotThrow(()=>runSourceWave({worktree:f.root,overlay,phase:'homepage',includedLanes,appliedLanes:['homepage'],contextDirectory:path.join(f.directory,'before-coast'),run}));
  assert.throws(()=>runSourceWave({worktree:f.root,overlay,phase:'coast',includedLanes,appliedLanes:['homepage','coast'],contextDirectory:path.join(f.directory,'after-coast'),run}),/Missing locked copy: <h1>Coast FI Calculator/);
});

test('nonzero or missing process completion fails closed',t=>{
  for(const result of [{exitCode:1},{exitCode:null},undefined]) {
    const f=fixture(t),overlay=prepareSourceOverlay(f.root,f.toolingCommit,f.output);
    assert.throws(()=>runSourceWave({worktree:f.root,overlay,...phase,contextDirectory:path.join(f.directory,'contexts'),run:()=>result}),/explicit successful completion/);
  }
});
