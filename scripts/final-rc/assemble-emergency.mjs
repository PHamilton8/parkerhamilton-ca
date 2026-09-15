#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RcError, readJson, git, sha256Text, canonicalize, manifestHash, validateManifestShape, findRepoRoot, verifyRepositoryIdentity, ensureCommit, preflightExecuteBranch, normalizeLaneEntry, validateAuthorities, expandLane, validateCommitAndFootprint, validateDuplicatesAndCollisions, writeJson, ensureNpmInstalled, commitIdentity, collectConflictDiagnostics, verifyFinalChangedFiles, hashBuildArtifact, runGate, packageScripts } from './assemble.mjs';
import { prepareSourceOverlay, verifyLandedOverlay } from './source-overlay.mjs';
import { PROFILE, DEFERRED, readEmergencyRequest, assertAssemblyRepeat, assertFocusedSmokeReport } from './emergency-contract.mjs';

const POLICY_PATH=path.join(path.dirname(fileURLToPath(import.meta.url)),'policy.json');
function parse(argv) {
  const args={request:null,outputDir:null,publish:false};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(key==='--publish')args.publish=true;
    else if(key==='--request'||key==='--output-dir'){
      assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),'Missing '+key);
      args[key==='--request'?'request':'outputDir']=argv[++i];
    } else throw new RcError('Unknown emergency argument: '+key);
  }
  assert.ok(args.request&&args.outputDir,'--request and --output-dir are required');
  return args;
}
function buildSource(repoRoot,policy,laneInspections,fileOwners,sourceOverlay,outputDir,label) {
  const worktree=fs.mkdtempSync(path.join(os.tmpdir(),'parker-emergency-source-'));
  fs.rmSync(worktree,{recursive:true,force:true});
  git(repoRoot,['worktree','add','--detach',worktree,policy.authorizedBase]);
  try{
    const sourceToAssembled={};
    for(const lane of laneInspections){
      for(const commit of lane.commits){
        const identity=commitIdentity(repoRoot,commit.sha);
        const cherry=git(worktree,['-c','user.name='+identity.name,'-c','user.email='+identity.email,'cherry-pick','--no-edit',commit.sha],{allowFailure:true,env:{GIT_COMMITTER_DATE:identity.date}});
        if(cherry.exitCode!==0){
          const diagnostics=collectConflictDiagnostics(worktree,lane.lane,commit.sha,cherry);
          writeJson(path.join(outputDir,label+'-conflict-diagnostics.json'),diagnostics);
          git(worktree,['cherry-pick','--abort'],{allowFailure:true});
          throw new RcError('Conflict applying '+commit.sha+' in '+lane.lane+'. No automatic resolution was attempted.',diagnostics);
        }
        sourceToAssembled[commit.sha]=git(worktree,['rev-parse','HEAD']).stdout.trim();
      }
      const head=git(worktree,['rev-parse','HEAD']).stdout.trim();
      verifyFinalChangedFiles(worktree,policy.authorizedBase,head,fileOwners,policy);
    }
    verifyLandedOverlay(worktree,sourceOverlay);
    assert.equal(git(worktree,['status','--porcelain=v1']).stdout.trim(),'','Assembled source must be clean');
    const finalCandidateSha=git(worktree,['rev-parse','HEAD']).stdout.trim();
    const result={
      finalCandidateSha,
      finalTreeSha:git(worktree,['rev-parse','HEAD^{tree}']).stdout.trim(),
      changedFiles:verifyFinalChangedFiles(worktree,policy.authorizedBase,finalCandidateSha,fileOwners,policy),
      authorityToCommit:Object.fromEntries(laneInspections.map(lane=>[lane.lane,{skipped:false,authorities:lane.entry.authorities,sourceCommits:lane.commits.map(c=>c.sha),assembledCommits:lane.commits.map(c=>sourceToAssembled[c.sha])}]))
    };
    writeJson(path.join(outputDir,label+'-source-reproduction.json'),result);
    return {worktree,result};
  } catch(error){
    git(repoRoot,['worktree','remove','--force',worktree],{allowFailure:true});
    fs.rmSync(worktree,{recursive:true,force:true});throw error;
  }
}
function runMinimumGates(worktree,summary,outputDir) {
  const logDir=path.join(outputDir,'logs');fs.mkdirSync(logDir,{recursive:true});
  const phase='owner-authorized-emergency-minimum';
  ensureNpmInstalled(worktree,summary.tests,logDir,phase);
  const scripts=packageScripts(worktree);
  for(const script of ['check','test','public-safety','build','infra:validate','infra:validate-dist']){
    assert.ok(scripts.has(script),'Missing mandatory minimum gate '+script);
    runGate(worktree,summary.tests,logDir,phase,'npm',['run',script],{QA_AUTHORITY_PROFILE:'final-rc'});
  }
  // Keep npm's high-severity supply-chain gate; this is fast and needs no Cloudflare credentials.
  runGate(worktree,summary.tests,logDir,phase,'npm',['audit','--audit-level=high']);
  runGate(worktree,summary.tests,logDir,phase,'npx',['playwright','install','--with-deps','chromium']);
  summary.buildArtifact=hashBuildArtifact(path.join(worktree,'dist'));
  const smokeOutput=path.join(outputDir,'emergency-public-smoke');
  const driver=path.join(path.dirname(fileURLToPath(import.meta.url)),'emergency-smoke-driver.mjs');
  runGate(worktree,summary.tests,logDir,phase,'node',[driver,worktree,summary.finalCandidateSha,summary.finalTreeSha,smokeOutput],{QA_AUTHORITY_PROFILE:'final-rc'});
  const report=readJson(path.join(smokeOutput,'result.json'));
  summary.browserCertification=assertFocusedSmokeReport(report,summary);
  summary.focusedSmoke={result:report,resultSha256:sha256Text(fs.readFileSync(path.join(smokeOutput,'result.json')))};
  assert.equal(git(worktree,['status','--porcelain=v1']).stdout.trim(),'','Minimum gates changed candidate source');
  assert.equal(git(worktree,['rev-parse','HEAD']).stdout.trim(),summary.finalCandidateSha);
  assert.equal(git(worktree,['rev-parse','HEAD^{tree}']).stdout.trim(),summary.finalTreeSha);
  summary.buildArtifact=hashBuildArtifact(path.join(worktree,'dist'));
  fs.cpSync(path.join(worktree,'dist'),path.join(outputDir,'certified-dist'),{recursive:true,errorOnExist:true,force:false});
  assert.deepEqual(hashBuildArtifact(path.join(outputDir,'certified-dist')),summary.buildArtifact,'Copied production artifact differs');
  writeJson(path.join(outputDir,'build-artifact-manifest.json'),summary.buildArtifact);
}
function main() {
  assert.equal(process.version,'v24.19.0');
  const args=parse(process.argv.slice(2)), repoRoot=findRepoRoot();
  const policy=readJson(POLICY_PATH);verifyRepositoryIdentity(repoRoot,policy);
  ensureCommit(repoRoot,'84da5699ff5ef9ca207c85bdde71ef496736a0b6');
  assert.equal(fs.readFileSync(POLICY_PATH,'utf8'),git(repoRoot,['show','84da5699ff5ef9ca207c85bdde71ef496736a0b6:scripts/final-rc/policy.json']).stdout,'Immutable ownership policy changed');
  const {request,manifest,requestSha256}=readEmergencyRequest(repoRoot,args.request);
  if(process.env.GITHUB_ACTIONS==='true'){
    assert.equal(process.env.GITHUB_REPOSITORY,request.repository);
    assert.equal(process.env.GITHUB_REF,'refs/heads/'+request.operatorBranch);
    assert.equal(git(repoRoot,['rev-parse','HEAD']).stdout.trim(),process.env.GITHUB_SHA);
  }
  validateManifestShape(manifest,policy,{mode:'DRY-RUN'});
  ensureCommit(repoRoot,policy.authorizedBase);
  if(args.publish)preflightExecuteBranch(repoRoot,{mode:'EXECUTE',integrationBranch:request.integrationBranch},policy);
  const outputDir=path.resolve(args.outputDir);
  const rel=path.relative(repoRoot,outputDir);
  assert.ok(rel==='..'||rel.startsWith('..'+path.sep),'Evidence must remain outside operator checkout');
  assert.ok(!fs.existsSync(outputDir),'Refusing to mix/rewrite existing emergency evidence');
  fs.mkdirSync(outputDir,{recursive:true});
  const summary={
    schemaVersion:1,profile:PROFILE,status:'IN_PROGRESS',fullFinalQaStatus:'DEFERRED_OWNER_AUTHORIZED_INITIAL_LAUNCH',
    deferred:DEFERRED.map(gate=>({gate,status:'DEFERRED_OWNER_AUTHORIZED_INITIAL_LAUNCH'})),mode:args.publish?'EMERGENCY_PUBLISH':'EMERGENCY_ASSEMBLE_ONLY',
    repository:policy.repository,requestSha256,authorizationSha256:request.authoritySha256,
    ci:{runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,workflow:process.env.GITHUB_WORKFLOW??null},
    operatorSha:git(repoRoot,['rev-parse','HEAD']).stdout.trim(),manifestSha256:sha256Text(JSON.stringify(canonicalize(manifest))),
    candidateTimestamp:manifest.candidateTimestamp,sourceAssemblyRollbackPoint:policy.authorizedBase,
    productionRollbackIdentity:null,productionMutations:0,tests:[],lanes:[],pushedIntegrationBranch:null
  };
  writeJson(path.join(outputDir,'manifest.normalized-input.json'),manifest);
  writeJson(path.join(outputDir,'emergency-request.json'),request);
  fs.copyFileSync(path.join(repoRoot,request.authorityPath),path.join(outputDir,'OWNER-EMERGENCY-AUTHORITY.md'));
  const worktrees=[];
  try{
    const laneInspections=policy.laneOrder.map(lane=>{
      const entry=normalizeLaneEntry(manifest[lane],lane,manifest);
      assert.equal(entry.skip,false,'Emergency integration still requires every final lane');
      validateAuthorities(entry,policy.lanes[lane]);
      const expanded=expandLane(repoRoot,policy.authorizedBase,entry);
      return {lane,entry:expanded,commits:validateCommitAndFootprint(repoRoot,policy.authorizedBase,expanded,policy.lanes[lane],policy)};
    });
    const fileOwners=validateDuplicatesAndCollisions(laneInspections);
    summary.lanes=laneInspections.map(l=>({lane:l.lane,skipped:false,sourceCommits:l.commits.map(c=>c.sha),authorities:l.entry.authorities}));
    const tooling=laneInspections.find(l=>l.lane==='releaseTooling');
    assert.notEqual(tooling.commits.at(-1).sha,'b5c8148fa63d20d75e2782ad74374436fd937893');
    const overlay=prepareSourceOverlay(repoRoot,tooling.commits.at(-1).sha,path.join(outputDir,'source-overlay'));
    const first=buildSource(repoRoot,policy,laneInspections,fileOwners,overlay,outputDir,'dry-run');
    worktrees.push(first.worktree);
    const second=buildSource(repoRoot,policy,laneInspections,fileOwners,overlay,outputDir,'repeat');
    worktrees.push(second.worktree);
    summary.deterministicSource=assertAssemblyRepeat(first.result,second.result);
    Object.assign(summary,second.result);
    runMinimumGates(second.worktree,summary,outputDir);
    summary.minimumGateStatus='PASS';
    if(args.publish){
      preflightExecuteBranch(repoRoot,{mode:'EXECUTE',integrationBranch:request.integrationBranch},policy);
      git(repoRoot,['branch',request.integrationBranch,summary.finalCandidateSha]);
      const pushed=git(repoRoot,['push','--set-upstream','origin',request.integrationBranch],{allowFailure:true});
      if(pushed.exitCode!==0){
        git(repoRoot,['branch','-D',request.integrationBranch],{allowFailure:true});
        throw new RcError('Exact emergency candidate push failed; no force push or production action attempted.',pushed);
      }
      const remote=git(repoRoot,['ls-remote','--exit-code','--heads','origin','refs/heads/'+request.integrationBranch]).stdout.trim().split(/\s+/)[0];
      assert.equal(remote,summary.finalCandidateSha,'Published branch identity differs');
      summary.pushedIntegrationBranch=request.integrationBranch;
    }
    summary.status='EMERGENCY_MINIMUM_PASS';
    writeJson(path.join(outputDir,'emergency-integration-summary.json'),summary);
    console.log('EMERGENCY MINIMUM PASS / FULL QA DEFERRED / NO PRODUCTION DEPLOYMENT\nCandidate: '+summary.finalCandidateSha+'\nTree: '+summary.finalTreeSha+'\nDist: '+summary.buildArtifact.hash);
  }catch(error){
    summary.status='FAIL';summary.failure={message:error.message,details:error.details??{}};
    writeJson(path.join(outputDir,'emergency-integration-summary.json'),summary);
    console.error('EMERGENCY INTEGRATION FAIL: '+error.message);process.exitCode=1;
  }finally{
    for(const worktree of worktrees){git(repoRoot,['worktree','remove','--force',worktree],{allowFailure:true});fs.rmSync(worktree,{recursive:true,force:true});}
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
export { buildSource,runMinimumGates };

