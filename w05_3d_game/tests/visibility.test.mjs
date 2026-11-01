import test from 'node:test';
import assert from 'node:assert/strict';
import {hasMazeSight,dangerGlowOpacity} from '../src/visibility.js';
import {SHARDS,START,distance} from '../src/world.js';
import {straightCorridor,rightAngle,separatedCorridors} from './helpers/map-fixtures.js';

test('Solid walls block the danger glow on horizontal and vertical parallel corridors',()=>{
 for(const [a,b] of [separatedCorridors('x'),separatedCorridors('z')]){
  assert.equal(hasMazeSight(a,b),false);assert.equal(dangerGlowOpacity(a,b),0);
 }
});
test('Open corridor warning still grows with proximity and stops outside its range',()=>{
 const hall=straightCorridor(),p=hall.at(0);assert.ok(dangerGlowOpacity(p,hall.at(1))>dangerGlowOpacity(p,hall.at(2)));
 assert.equal(dangerGlowOpacity(p,hall.at(3)),0);assert.equal(dangerGlowOpacity(p,p),.4);
});
test('Corner visibility uses the real corridor width, not rounded tile samples',()=>{
 const turn=rightAngle(),a=turn.at(-.7,0),b=turn.at(0,.8);assert.equal(hasMazeSight(a,b,1.5),false);assert.equal(hasMazeSight(a,b,2.4),true);
 assert.equal(dangerGlowOpacity(a,b,1.5),0);assert.ok(dangerGlowOpacity(a,b,2.4)>0);
 assert.equal(hasMazeSight(turn.corner,turn.at(0,1),1.3),true);
});
test('Visibility is symmetric for all nearby traversable tile pairs',()=>{
 const cells=[START,...SHARDS];for(const a of cells)for(const b of cells){
  if(distance(a,b)>2.7)continue;assert.equal(hasMazeSight(a,b),hasMazeSight(b,a));
 }
});
