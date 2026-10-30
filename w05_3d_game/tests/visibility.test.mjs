import test from 'node:test';
import assert from 'node:assert/strict';
import {hasMazeSight,dangerGlowOpacity} from '../src/visibility.js';
import {SHARDS,START,distance} from '../src/world.js';

test('Solid walls block the danger glow on horizontal and vertical parallel corridors',()=>{
 for(const [a,b] of [[{x:5,z:3},{x:7,z:3}],[{x:3,z:1},{x:3,z:3}],[{x:7,z:5},{x:7,z:7}]]){
  assert.equal(hasMazeSight(a,b),false);assert.equal(dangerGlowOpacity(a,b),0);
 }
});
test('Open corridor warning still grows with proximity and stops outside its range',()=>{
 const p={x:1,z:1};assert.ok(dangerGlowOpacity(p,{x:2,z:1})>dangerGlowOpacity(p,{x:3,z:1}));
 assert.equal(dangerGlowOpacity(p,{x:4,z:1}),0);assert.equal(dangerGlowOpacity(p,p),.4);
});
test('Corner visibility uses the real corridor width, not rounded tile samples',()=>{
 const a={x:3.3,z:1},b={x:4,z:1.8};assert.equal(hasMazeSight(a,b,1.5),false);assert.equal(hasMazeSight(a,b,2.4),true);
 assert.equal(hasMazeSight({x:4,z:1},{x:4,z:2},1.3),true);
});
test('Visibility is symmetric for all nearby traversable tile pairs',()=>{
 const cells=[START,...SHARDS];for(const a of cells)for(const b of cells){
  if(distance(a,b)>2.7)continue;assert.equal(hasMazeSight(a,b),hasMazeSight(b,a));
 }
});
