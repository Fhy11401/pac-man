import test from 'node:test';
import assert from 'node:assert/strict';
import {mapTransform,mapPoint} from '../src/map-view.js';
import {captureScareLook,scareLookPose,SCARE_TURN_SECONDS} from '../src/presentation.js';

test('Rotating map puts forward above the player and right to the right at every heading',()=>{
  const player={x:3,z:5};
  for(const zoom of [false,true])for(let yaw=-Math.PI*2;yaw<=Math.PI*2;yaw+=Math.PI/16){
    const t=mapTransform(450,player,yaw,zoom),p=mapPoint(player,t);
    const front=mapPoint({x:player.x-Math.sin(yaw),z:player.z-Math.cos(yaw)},t);
    const right=mapPoint({x:player.x+Math.cos(yaw),z:player.z-Math.sin(yaw)},t);
    assert.ok(Math.abs(front.x-p.x)<1e-8);assert.ok(front.y<p.y);
    assert.ok(right.x>p.x);assert.ok(Math.abs(right.y-p.y)<1e-8);
    if(zoom){assert.equal(p.x,225);assert.equal(p.y,225);}
  }
});
test('Full map retains all corridor bounds through a complete rotation',()=>{
  for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/32)for(const x of [.5,13.5])for(const z of [.5,13.5]){
    const p=mapPoint({x,z},mapTransform(450,{x:1,z:1},yaw,false));
    assert.ok(p.x>=7&&p.x<=443);assert.ok(p.y>=7&&p.y<=443);
  }
});
test('Caught camera faces the actual attacker before the face animation starts',()=>{
  const player={x:4,z:4};
  for(const enemy of [{x:4.2,z:4},{x:3.8,z:4},{x:4,z:4.2},{x:4,z:3.8}]){
    const start=captureScareLook(player,enemy,Math.PI-.03,.6),first=scareLookPose(start,0);
    assert.equal(first.yaw,start.yaw);assert.equal(first.pitch,start.pitch);assert.equal(first.showFace,false);
    const mid=scareLookPose(start,SCARE_TURN_SECONDS/2);
    assert.equal(mid.showFace,false);assert.ok(Math.abs(mid.yaw-start.yaw)<=Math.PI/2+1e-9);
    const end=scareLookPose(start,SCARE_TURN_SECONDS),target=Math.atan2(player.x-enemy.x,player.z-enemy.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(end.yaw-target),Math.cos(end.yaw-target)))<1e-9);
    assert.equal(end.showFace,true);assert.deepEqual(scareLookPose(start,1),end);
  }
});
test('Scare uses the shortest turn across the angle boundary and handles overlapping positions',()=>{
  const player={x:4,z:4},yaw=Math.PI-.02,target=-Math.PI+.02;
  const start=captureScareLook(player,{x:4-Math.sin(target),z:4-Math.cos(target)},yaw,0);
  assert.ok(Math.abs(start.delta-.04)<1e-9);
  const overlap=captureScareLook(player,player,yaw,.2);
  assert.equal(overlap.delta,0);assert.ok(Number.isFinite(scareLookPose(overlap,.22).pitch));
});
