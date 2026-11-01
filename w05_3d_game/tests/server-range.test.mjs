import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';

function request(port,route='/clip.mp3',{method='GET',headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:route,method,headers,agent:false},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });
    req.setTimeout(5000,()=>req.destroy(new Error('Local HTTP request timed out')));req.on('error',reject);req.end();
  });
}
function ready(child){
  return new Promise((resolve,reject)=>{
    let output='',errors='';const timeout=setTimeout(()=>reject(new Error('Local server did not become ready')),5000);
    const fail=error=>{clearTimeout(timeout);reject(error);};child.once('error',fail);
    child.stderr.on('data',chunk=>{errors+=chunk;});child.once('exit',code=>fail(new Error(`Local server exited ${code}: ${errors}`)));
    child.stdout.on('data',chunk=>{output+=chunk;const match=/http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);if(match){clearTimeout(timeout);resolve(Number(match[1]));}});
  });
}

for(const runtime of ['node','python'])test(`${runtime} local media server supports safe seekable single byte ranges`,async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'night-hotel-http-')),root=path.join(temp,'project');let child;
  t.after(async()=>{
    if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
    assert.equal(path.dirname(path.resolve(temp)),path.resolve(tmpdir()));assert.ok(path.basename(temp).startsWith('night-hotel-http-'));
    await rm(temp,{recursive:true,force:true});
  });
  await mkdir(path.join(root,'directory'),{recursive:true});
  const data=Buffer.from(Array.from({length:4097},(_,i)=>(i*37+11)%256));
  await writeFile(path.join(root,'clip.mp3'),data);await writeFile(path.join(root,'empty.mp3'),'');await writeFile(path.join(root,'index.html'),'<!doctype html><title>Fixture</title>');
  await writeFile(path.join(temp,'outside.dat'),'outside-fixture');
  if(runtime==='node'){
    const source=path.join(root,'server.mjs');await copyFile(new URL('../server.mjs',import.meta.url),source);
    child=spawn(process.execPath,[source,'--port=0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  }else{
    const launcher=await readFile(new URL('../launch-local.ps1',import.meta.url),'utf8'),source=/function Get-PythonServer[\s\S]*?\$source = @'\r?\n([\s\S]*?)\r?\n'@/.exec(launcher)?.[1];
    assert.ok(source,'exercise the exact Python fallback embedded in the shipped launcher');
    const file=path.join(temp,'fallback.py');await writeFile(file,source);
    child=spawn(process.platform==='win32'?'python':'python3',[file,root,'0'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  }
  const port=await ready(child);

  await t.test('full GET and HEAD advertise exact length and byte support without chunking',async()=>{
    const full=await request(port);assert.equal(full.status,200);assert.deepEqual(full.body,data);
    assert.equal(full.headers['content-type'],'audio/mpeg');assert.equal(full.headers['content-length'],String(data.length));assert.equal(full.headers['accept-ranges'],'bytes');
    assert.equal(full.headers['transfer-encoding'],undefined);assert.equal(full.headers['cache-control'],'no-store');assert.equal(full.headers['x-content-type-options'],'nosniff');
    for(const range of [undefined,'bytes=200-399','bytes=999999-']){
      const head=await request(port,'/clip.mp3',{method:'HEAD',headers:range?{Range:range}:{}});
      assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(head.headers['content-length'],String(data.length));assert.equal(head.headers['content-range'],undefined);
    }
  });
  await t.test('closed, open-ended, suffix and oversized-end ranges return the exact inclusive bytes',async()=>{
    for(const [range,start,end] of [['bytes=0-0',0,0],['bytes=123-456',123,456],['bytes=4000-',4000,4096],['bytes=-19',4078,4096],['bytes=-99999',0,4096],['bytes=4090-999999999999999999999999',4090,4096]]){
      const partial=await request(port,'/clip.mp3',{headers:{Range:range}});
      assert.equal(partial.status,206,range);assert.equal(partial.headers['content-range'],`bytes ${start}-${end}/${data.length}`);
      assert.equal(partial.headers['content-length'],String(end-start+1));assert.equal(partial.headers['accept-ranges'],'bytes');assert.equal(partial.headers['cache-control'],'no-store');
      assert.deepEqual(partial.body,data.subarray(start,end+1));assert.equal(partial.headers['transfer-encoding'],undefined);
    }
  });
  await t.test('unsatisfiable and reversed ranges return bounded 416 responses and the full file size',async()=>{
    for(const range of [`bytes=${data.length}-`,'bytes=-0','bytes=40-10',`bytes=${'9'.repeat(200)}-`]){
      const response=await request(port,'/clip.mp3',{headers:{Range:range}});
      assert.equal(response.status,416,range);assert.equal(response.headers['content-range'],`bytes */${data.length}`);assert.equal(response.headers['content-length'],'0');assert.equal(response.body.length,0);
    }
  });
  await t.test('unsupported ranges and unvalidated If-Range fall back to the whole representation',async()=>{
    for(const headers of [{Range:'items=0-2'},{Range:'bytes=0-1,20-21'},{Range:'bytes=invalid'},{Range:'bytes=0-9','If-Range':'"old-representation"'}]){
      const response=await request(port,'/clip.mp3',{headers});assert.equal(response.status,200);assert.deepEqual(response.body,data);assert.equal(response.headers['content-range'],undefined);
    }
    for(const method of ['GET','HEAD']){
      const empty=await request(port,'/empty.mp3',{method,headers:{Range:'bytes=0-0'}});assert.equal(empty.status,200);assert.equal(empty.headers['content-length'],'0');assert.equal(empty.body.length,0);
    }
  });
  await t.test('range requests retain directory, traversal, health, and method protections',async()=>{
    for(const route of ['/%2e%2e%2foutside.dat','/..%5coutside.dat','/directory/','/missing.mp3','/%00.mp3']){
      const response=await request(port,route,{headers:{Range:'bytes=0-20'}});assert.ok([403,404].includes(response.status),route);assert.ok(!response.body.toString().includes('outside-fixture'));assert.equal(response.headers['cache-control'],'no-store');
    }
    const health=await request(port,'/__night_hotel_health');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).runtime,runtime);assert.ok(!health.body.toString().includes(root));
    const post=await request(port,'/clip.mp3',{method:'POST',headers:{Range:'bytes=0-2'}});assert.equal(post.status,405);assert.equal(post.headers.allow,'GET, HEAD');
    const head=await request(port,'/missing.mp3',{method:'HEAD'});assert.equal(head.status,404);assert.equal(head.body.length,0);
    assert.equal((await request(port,'/')).status,200);
  });
});
