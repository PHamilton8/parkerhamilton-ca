import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SOURCE_PATH = 'tests/source-contract.test.mjs';
export const INTEGRITY_PATH = 'release/source-contract-integrity.json';
export const BASE_SOURCE_SHA256 = '090a372b5821044740d0bb7f543c0d195812bb7c03dafde89da8dced1854d566';
export const LANE_ORDER = Object.freeze(['homepage','wealthsimple','reporting','designDay','grocery','askWill','coast','compound','smith','releaseTooling']);
export const BASE_SOURCE_COMMAND = 'node --test tests/source-contract.test.mjs tests/route-contract.test.mjs tests/coast-download-safety.test.mjs tests/smith-download-safety.test.mjs';
export const SOURCE_COMPANIONS = Object.freeze(['tests/route-contract.test.mjs','tests/coast-download-safety.test.mjs','tests/smith-download-safety.test.mjs']);
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (root,args,encoding='utf8') => execFileSync('git',args,{cwd:root,encoding,maxBuffer:64*1024*1024});
const gitText = (root,args) => git(root,args).trim();
const fullSha = value => assert.match(value,/^[a-f0-9]{40}$/,'An exact full Git SHA is required.');

export function assertOutside(candidateRoot, externalPath) {
  const relative = path.relative(fs.realpathSync(candidateRoot), path.resolve(externalPath));
  assert.ok(relative === '..' || relative.startsWith('..'+path.sep),'Overlay files must remain outside the candidate checkout.');
}

function regularGitBlob(root,commit,relative) {
  const line=gitText(root,['ls-tree',commit,'--',relative]);
  const match=line.match(/^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/);
  assert.ok(match && match[2]===relative,`Expected a regular committed blob at ${relative}.`);
  return {blob:match[1],bytes:git(root,['show',`${commit}:${relative}`],null)};
}

/** Read only committed, reviewed source. Operator files are never an authority. */
export function prepareSourceOverlay(repositoryRoot, toolingCommit, outputDirectory) {
  fullSha(toolingCommit);
  assert.equal(gitText(repositoryRoot,['rev-parse',`${toolingCommit}^{commit}`]),toolingCommit);
  assertOutside(repositoryRoot,outputDirectory);
  const manifestBlob=regularGitBlob(repositoryRoot,toolingCommit,INTEGRITY_PATH);
  const manifest=JSON.parse(manifestBlob.bytes.toString('utf8'));
  assert.deepEqual(Object.keys(manifest).sort(),['interfaceVersion','reviewStatus','schemaVersion','sha256','sourcePath'].sort());
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.interfaceVersion,1);
  assert.equal(manifest.sourcePath,SOURCE_PATH);
  assert.equal(manifest.reviewStatus,'REVIEWED_CURRENT_AUTHORITY_SOURCE_CONTRACT');
  assert.match(manifest.sha256,/^[a-f0-9]{64}$/);
  const source=regularGitBlob(repositoryRoot,toolingCommit,SOURCE_PATH);
  assert.equal(sha256(source.bytes),manifest.sha256,'Reviewed source SHA-256 mismatch.');
  assert.match(source.bytes.toString('utf8'),/FINAL_RC_SOURCE_CONTRACT_INTERFACE = 1/);
  fs.mkdirSync(outputDirectory,{recursive:true});
  assertOutside(repositoryRoot,fs.realpathSync(outputDirectory));
  const sourceFile=path.join(outputDirectory,'source-contract.test.mjs');
  assert.ok(!fs.existsSync(sourceFile),'Never overwrite prior extracted source evidence.');
  fs.writeFileSync(sourceFile,source.bytes,{flag:'wx',mode:0o444});
  const identity={schemaVersion:1,toolingCommit,sourcePath:SOURCE_PATH,sourceBlob:source.blob,sourceSha256:manifest.sha256,integrityBlob:manifestBlob.blob,sourceFile};
  fs.writeFileSync(path.join(outputDirectory,'source-overlay-identity.json'),JSON.stringify(identity,null,2)+'\n',{flag:'wx'});
  return identity;
}

export function candidateIdentity(root) {
  return {candidateRoot:fs.realpathSync(root),candidateSha:gitText(root,['rev-parse','HEAD']),candidateTree:gitText(root,['rev-parse','HEAD^{tree}']),candidateStatus:gitText(root,['status','--porcelain=v1'])};
}

export function assertUnchanged(before,after) {
  assert.deepEqual(after,before,'Source validation mutated candidate SHA, tree, files or status.');
}

export function validatePhase({phase,includedLanes,appliedLanes,laneOrder=LANE_ORDER}) {
  assert.deepEqual(laneOrder,LANE_ORDER,'Assembler lane order changed.');
  assert.ok(Array.isArray(includedLanes)&&Array.isArray(appliedLanes));
  assert.deepEqual(includedLanes,LANE_ORDER.filter(l=>includedLanes.includes(l)),'Included lanes must be unique, known and ordered.');
  const index=LANE_ORDER.indexOf(phase);
  assert.ok(index>=0 && phase!=='releaseTooling','External source overlay is only for a pre-tooling wave.');
  assert.ok(includedLanes.includes('releaseTooling'),'No overlay without a pinned final tooling lane.');
  assert.ok(includedLanes.includes(phase));
  assert.deepEqual(appliedLanes,LANE_ORDER.slice(0,index+1).filter(l=>includedLanes.includes(l)),'Applied lanes differ from the exact manifest prefix.');
}

export function buildWaveCommand(root,sourceFile) {
  const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts;
  assert.equal(scripts?.['test:source'],BASE_SOURCE_COMMAND,'Unexpected source-suite command: manual reconciliation required.');
  assert.equal(sha256(fs.readFileSync(path.join(root,SOURCE_PATH))),BASE_SOURCE_SHA256,'Unexpected pre-tooling source test bytes.');
  for(const relative of SOURCE_COMPANIONS) assert.ok(fs.lstatSync(path.join(root,relative)).isFile(),`Missing source companion ${relative}`);
  return {command:process.execPath,args:['--test',sourceFile,...SOURCE_COMPANIONS]};
}

/** Preserve the whole source suite; replace only its superseded copy assertions. */
export function runSourceWave({worktree,overlay,phase,includedLanes,appliedLanes,contextDirectory,run}) {
  validatePhase({phase,includedLanes,appliedLanes});
  assertOutside(worktree,overlay.sourceFile);
  assertOutside(worktree,contextDirectory);
  assert.equal(sha256(fs.readFileSync(overlay.sourceFile)),overlay.sourceSha256,'Extracted source changed before execution.');
  const before=candidateIdentity(worktree);
  assert.equal(before.candidateStatus,'','Candidate must be clean before source validation.');
  const invocation=buildWaveCommand(worktree,overlay.sourceFile);
  fs.mkdirSync(contextDirectory,{recursive:true});
  assertOutside(worktree,fs.realpathSync(contextDirectory));
  const context={schemaVersion:1,...before,toolingCommit:overlay.toolingCommit,sourceSha256:overlay.sourceSha256,laneOrder:LANE_ORDER,phase,includedLanes,appliedLanes};
  const contextPath=path.join(contextDirectory,`source-context-${phase}.json`);
  fs.writeFileSync(contextPath,JSON.stringify(context,null,2)+'\n',{flag:'wx'});
  let result,gateError;
  try {
    result=run(invocation.command,invocation.args,{QA_AUTHORITY_PROFILE:'assembler-wave',FINAL_RC_SOURCE_CONTEXT:contextPath});
    assert.equal(result?.exitCode,0,'Source gate did not return explicit successful completion.');
  }
  catch(error) { gateError=error; }
  const after=candidateIdentity(worktree);
  const evidence={...invocation,contextPath,before,after,exitCode:result?.exitCode??null,gateError:gateError?.message??null};
  fs.writeFileSync(path.join(contextDirectory,`source-invariant-${phase}.json`),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  assertUnchanged(before,after);
  assert.equal(sha256(fs.readFileSync(overlay.sourceFile)),overlay.sourceSha256,'Extracted source changed during execution.');
  if(gateError) throw gateError;
  return result;
}

export function verifyLandedOverlay(worktree,overlay) {
  assert.equal(sha256(fs.readFileSync(path.join(worktree,SOURCE_PATH))),overlay.sourceSha256,'Landed source-test bytes differ from the reviewed wave authority.');
  const pin=JSON.parse(fs.readFileSync(path.join(worktree,INTEGRITY_PATH),'utf8'));
  assert.equal(pin.sha256,overlay.sourceSha256);
  assert.equal(pin.sourcePath,SOURCE_PATH);
  assert.equal(pin.reviewStatus,'REVIEWED_CURRENT_AUTHORITY_SOURCE_CONTRACT');
}

export function gateEnvironment(profile,context) {
  assert.ok(['final-rc','assembler-wave',undefined].includes(profile));
  if(profile==='assembler-wave') assert.ok(context,'Wave profile requires a context.');
  else assert.equal(context,undefined,'Final/default profile forbids wave overrides.');
  const env={...process.env};
  delete env.FINAL_RC_SOURCE_CONTEXT;
  delete env.QA_AUTHORITY_PROFILE;
  // Child commands are independent gate executions, even during Node self-tests.
  delete env.NODE_TEST_CONTEXT;
  if(profile) env.QA_AUTHORITY_PROFILE=profile;
  if(context) env.FINAL_RC_SOURCE_CONTEXT=context;
  return env;
}
