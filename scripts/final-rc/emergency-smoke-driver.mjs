#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {PARKER_SMOKE_CANDIDATE_ROOT:candidate,PARKER_SMOKE_SOURCE_SHA:sourceSha,PARKER_SMOKE_TREE_SHA:treeSha,PARKER_SMOKE_OUTPUT:output}=process.env;
assert.ok(candidate&&sourceSha&&treeSha&&output);
const portOpen=()=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port:4321});s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));});
assert.equal(await portOpen(),false,'Port4321 must be free; no existing server reuse');
fs.mkdirSync(output,{recursive:true});
const serverLog=fs.openSync(path.join(output,'local-server.log'),'wx');
const server=spawn(process.execPath,['scripts/preview-for-tests.mjs'],{cwd:candidate,env:process.env,stdio:['ignore',serverLog,serverLog]});
let serverError;server.on('error',error=>{serverError=error});
try{
  for(let attempt=0;attempt<100;attempt++){
    if(serverError)throw serverError;
    assert.equal(server.exitCode,null,'Owned static server exited early');
    if(await portOpen())break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(await portOpen(),true,'Owned static server did not become ready');
  const smoke=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../emergency-public-first/smoke.mjs');
  const child=spawn(process.execPath,[smoke,'--base-url','http://127.0.0.1:4321','--dist',path.join(candidate,'dist'),'--candidate-root',candidate,'--source-sha',sourceSha,'--tree-sha',treeSha,'--output',output],{cwd:candidate,env:process.env,stdio:['ignore','pipe','pipe']});
  let bytes=0;
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>64*1024*1024){child.kill('SIGTERM');return;}process.stdout.write(chunk)});
  const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}))});
  clearTimeout(timer);
  assert.ok(bytes<=64*1024*1024,'Smoke output limit exceeded');assert.equal(result.signal,null);assert.equal(result.code,0,'Focused Chromium smoke failed');
}finally{
  if(server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(server.exitCode===null)server.kill('SIGKILL');}
  fs.closeSync(serverLog);
}

