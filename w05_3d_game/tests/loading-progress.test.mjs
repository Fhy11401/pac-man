import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/view.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(jobs){
 const textures=[{isTexture:true},{isTexture:true}],events=[],uploads=[];
 const view={disposed:false,loadingListeners:new Set(),loadingProgress:{stage:'assets',completed:0,total:0,ratio:0},assetJobs:jobs,
  scene:{traverse:visit=>visit({material:{map:textures[0],normalMap:textures[1],ignored:{isTexture:true,isRenderTargetTexture:true}}})},
  scareScene:{traverse:visit=>visit({material:{map:textures[0]}})},renderer:{initTexture:t=>uploads.push(t)},film:{warmup:()=>events.push('warmup')},
  onLoadingProgress:WorldView.prototype.onLoadingProgress,reportLoading:WorldView.prototype.reportLoading,prepareAssets:WorldView.prototype.prepareAssets};
 return{view,events,uploads};
}
test('loading progress follows resolved jobs, uploads unique textures, and reaches 100 only after warmup',async()=>{
 const previous=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
 try{
  const a=deferred(),b=deferred(),{view,events,uploads}=fixture([a.promise,b.promise]),progress=[];
  const unsubscribe=view.onLoadingProgress(p=>progress.push({...p})),ready=view.prepareAssets();
  b.resolve({loaded:true});await Promise.resolve();assert.equal(view.loadingProgress.completed,1);assert.equal(view.loadingProgress.ratio,.41);assert.deepEqual(events,[]);
  a.resolve({loaded:true});await ready;assert.equal(uploads.length,2);assert.deepEqual(events,['warmup']);assert.equal(progress.at(-1).stage,'ready');assert.equal(progress.at(-1).ratio,1);
  for(let i=1;i<progress.length;i++)assert.ok(progress[i].ratio>=progress[i-1].ratio);
  assert.ok(progress.some(p=>p.stage==='upload'));assert.ok(progress.some(p=>p.stage==='warmup'));unsubscribe();assert.equal(view.loadingListeners.size,0);
 }finally{globalThis.requestAnimationFrame=previous;}
});
test('disposed scene stops before GPU work and never announces ready',async()=>{
 const previous=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
 try{const{view,events,uploads}=fixture([Promise.resolve({loaded:true})]);view.onLoadingProgress(p=>{if(p.stage==='upload')view.disposed=true;});await view.prepareAssets();assert.equal(uploads.length,0);assert.deepEqual(events,[]);assert.notEqual(view.loadingProgress.stage,'ready');}
 finally{globalThis.requestAnimationFrame=previous;}
});
test('resource failure rejects readiness instead of reporting completion',async()=>{
 const{view,events,uploads}=fixture([Promise.reject(new Error('asset unavailable'))]);await assert.rejects(view.prepareAssets(),/asset unavailable/);assert.notEqual(view.loadingProgress.stage,'ready');assert.deepEqual(events,[]);assert.equal(uploads.length,0);
});
