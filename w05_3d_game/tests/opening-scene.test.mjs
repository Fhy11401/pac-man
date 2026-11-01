import test from 'node:test';
import assert from 'node:assert/strict';
import {openingWalk} from '../src/opening-scene.js';
test('the attendant stays in the feed until the close encounter cuts to outage',()=>{
 assert.equal(openingWalk(0).visible,false);assert.equal(openingWalk(4).visible,true);assert.equal(openingWalk(13.19).visible,true);assert.equal(openingWalk(13.2).visible,false);
 let previous=0;for(let t=0;t<13.2;t+=.01){const pose=openingWalk(t);assert(pose.progress>=previous);assert(Number.isFinite(pose.phase));assert(pose.glance>=0&&pose.glance<=1);previous=pose.progress;}
});

test('attendant turns toward the lens before approaching with continuous acceleration',()=>{
 for(const t of [4.5,5.5,6.5,7.3]){assert.equal(openingWalk(t).speed,0);assert.equal(openingWalk(t).progress,.46);}
 assert.equal(openingWalk(5.8).glance,1);assert.equal(openingWalk(8).glance,1);assert.equal(openingWalk(6).bodyTurn,1);
 for(const t of [1.1,4.4,6,11.55]){assert.ok(Math.abs(openingWalk(t-.0001).speed-openingWalk(t+.0001).speed)<1e-6);assert.ok(Math.abs(openingWalk(t-.0001).approachSpeed-openingWalk(t+.0001).approachSpeed)<1e-6);}
 let previous=0;for(let t=0;t<13.2;t+=.01){const pose=openingWalk(t);assert.ok(pose.approach>=previous&&pose.approach<=1);previous=pose.approach;}
 assert.equal(openingWalk(12.98).approach,1);assert.equal(openingWalk(12.98).lensThreat,1);assert.ok(openingWalk(13.02).interference>0);
});

test('the lunge follows a still beat and fills the lens in under a quarter second',()=>{
 for(const t of [11.8,12.2,12.7]){assert.equal(openingWalk(t).approach,.38);assert.equal(openingWalk(t).strike,0);assert.equal(openingWalk(t).approachSpeed,0);}
 assert.equal(openingWalk(12.92).approach,1);assert.equal(openingWalk(12.92).strike,1);
 assert.ok(openingWalk(12.8).approachSpeed>4);assert.equal(openingWalk(13.2).visible,false);
});
