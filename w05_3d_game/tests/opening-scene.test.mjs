import test from 'node:test';
import assert from 'node:assert/strict';
import {openingWalk,openingFraming,poseOpeningCrawl,openingFeedFov,openingHallShot} from '../src/opening-scene.js';
import {OPENING_STRIKE_AT,OPENING_CUT_AT} from '../src/opening-timing.js';
import * as THREE from '../vendor/three.module.js';

test('opening shows one visitor, holds an empty feed, then reveals the sudden lunge',()=>{
 for(const t of [0,1.09,10.55,11,12.7,OPENING_CUT_AT])assert.equal(openingWalk(t).visible,false);
 for(const t of [1.1,3.2,5.5,7,OPENING_STRIKE_AT+.01,13.19])assert.equal(openingWalk(t).visible,true);
});
test('visitor looks at the camera before folding down and crawling away',()=>{
 assert.equal(openingWalk(7.4).glance,1);assert.equal(openingWalk(7.4).crawl,0);
 assert.equal(openingWalk(8.2).crawl,1);assert(openingWalk(9.5).crawlTravel>openingWalk(8.5).crawlTravel);
 assert.equal(openingWalk(10.55).crawlTravel,1);
 for(let t=0;t<OPENING_CUT_AT;t+=.01){const p=openingWalk(t);for(const key of ['progress','speed','approach','strike','crawl','crawlTravel','faceExposure'])assert(Number.isFinite(p[key]),key);}
});
test('the empty-frame hold has no approach tell and the lunge completes in under a quarter second',()=>{
 for(const t of [10,11,12,12.7]){assert.equal(openingWalk(t).approach,0);assert.equal(openingWalk(t).strike,0);}
 assert.equal(openingWalk(12.92).approach,1);assert.equal(openingWalk(12.92).strike,1);assert.equal(openingWalk(12.92).lensThreat,1);
});
test('the seated wide shot holds before the visitor appears and then pushes in smoothly',()=>{
 assert.equal(openingFraming(3.5).push,0);assert.equal(openingFraming(6.7).push,1);
 let previous=0;for(let t=0;t<13.2;t+=.01){const p=openingFraming(t);assert(p.push>=previous&&p.push<=1);previous=p.push;}
});
test('crawl pose lowers the torso and reverses the knees without modifying the scene root',()=>{
 const model={body:new THREE.Group(),root:new THREE.Group(),limbs:[-1,1].flatMap(side=>[{side,leg:true,node:new THREE.Group(),knee:new THREE.Group(),ankle:new THREE.Group()},{side,leg:false,node:new THREE.Group(),elbow:new THREE.Group()}])};
 poseOpeningCrawl(model,openingWalk(8.7),8.7);
 assert(model.body.rotation.x>1.1);assert(model.body.position.y<.23);assert(model.limbs.filter(l=>l.leg).every(l=>l.knee.rotation.x<0));assert.equal(model.root.rotation.x,0);
});

test('entry crosses the left screen edge before the push; crawling waits for the completed push',()=>{
 const world=(x,z,y=0)=>new THREE.Vector3(x*2,y,z*2),{camera,path}=openingHallShot({minX:11,maxX:17,minZ:7,maxZ:11},world);
 const xAt=t=>world(path.x,path.from+(path.to-path.from)*openingWalk(t).progress,1).project(camera).x;
 assert(xAt(1.1)<-1);assert(xAt(2.6)>-1&&xAt(2.6)<0);assert(Math.abs(xAt(3.3))<.25);
 assert.equal(openingFraming(3.3).push,0);assert.equal(openingFraming(6.7).push,1);
 for(let t=0;t<=6.7;t+=.03)assert.equal(openingWalk(t).crawl,0);
 assert.equal(openingWalk(7.55).crawlTravel,0);
});
test('full-screen CCTV keeps the same projection as a screen covering the viewport',()=>{
 for(const aspect of [4/3,16/9,21/9]){
 const fov=openingFeedFov(42,16/9,aspect),tan=Math.tan(THREE.MathUtils.degToRad(fov/2));
 assert(Math.abs(tan-Math.tan(THREE.MathUtils.degToRad(21))*Math.min(1,(16/9)/aspect))<1e-12);
 }
});
