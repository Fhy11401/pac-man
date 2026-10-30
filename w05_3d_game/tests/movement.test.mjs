import test from 'node:test';
import assert from 'node:assert/strict';
import {slideMove,movementVelocity} from '../src/movement.js';
import {createGame,tick,blocked} from '../src/core.js';
import {RULES,wallInset,distance} from '../src/world.js';
const fixture=()=>{const g=createGame();g.player={x:2,z:1};g.enemy={x:-100,z:-100};g.enemyDelay=999;return g;};

test('Continuous contact reaches the wall and retains all tangential movement',()=>{
 const limit=1.5-wallInset()-RULES.playerRadius;
 const result=slideMove({x:2,z:1},{x:.2,z:.3},RULES.playerRadius,RULES.corridorWidth);
 assert.ok(Math.abs(result.position.x-2.2)<1e-8);
 assert.ok(Math.abs(result.position.z-limit)<2e-6);assert.equal(blocked(result.position),false);
 assert.ok(result.path.length>=3);
 const exact=slideMove({x:2,z:limit-1e-10},{x:.1,z:.2},RULES.playerRadius,RULES.corridorWidth);
 assert.equal(blocked(exact.position),false);assert.ok(exact.position.z<=limit);assert.ok(Math.abs(exact.position.x-2.1)<1e-8);
});

test('Holding against a side wall stays still without repeatedly bouncing or storing push velocity',()=>{
 const g=fixture();let settled;
 for(let i=0;i<240;i++){
  tick(g,{x:0,z:1,run:true},1/60);assert.equal(blocked(g.player),false);
  if(i===60)settled={...g.player};if(i>60){assert.deepEqual(g.player,settled);assert.equal(g.motionVelocity.z,0);assert.equal(g.playerVelocity.z,0);}
 }
 tick(g,{x:1,z:1,run:true},1/60);assert.ok(g.player.x>settled.x);assert.ok(Math.abs(g.player.z-settled.z)<1e-8);
});

test('Corner sliding has no preference for the X or Z axis',()=>{
 const a=slideMove({x:1.05,z:1.15},{x:.4,z:.2},RULES.playerRadius,RULES.corridorWidth);
 const b=slideMove({x:1.15,z:1.05},{x:.2,z:.4},RULES.playerRadius,RULES.corridorWidth);
 assert.ok(Math.abs(a.position.x-b.position.z)<1e-8);assert.ok(Math.abs(a.position.z-b.position.x)<1e-8);
 assert.equal(blocked(a.position),false);assert.equal(blocked(b.position),false);
});

test('A/D reversal brakes then changes sign once, rather than instantly flipping velocity',()=>{
 const g=fixture();g.motionVelocity={x:1.6,z:0};const velocities=[];
 for(let i=0;i<24;i++){
  const before={...g.player};tick(g,{x:-1,z:0},1/240);velocities.push(g.motionVelocity.x);
  assert.ok(distance(before,g.player)<=RULES.playerSpeed/240+1e-8);assert.equal(blocked(g.player),false);
 }
 assert.ok(velocities[0]>0&&velocities[0]<1.6);assert.ok(velocities.at(-1)<-1.5);
 for(let i=1;i<velocities.length;i++)assert.ok(velocities[i]<=velocities[i-1]+1e-9);
});

test('Release settles within the short configured interval at different frame rates',()=>{
 for(const fps of [15,30,60,144]){
  const g=fixture();g.motionVelocity={x:RULES.sprintSpeed,z:0};const start={...g.player};
  for(let i=0;i<Math.ceil(RULES.movementInertia*fps)+1;i++)tick(g,{x:0,z:0},1/fps);
  assert.equal(g.moveSpeed,0);assert.ok(g.player.x>start.x);assert.ok(distance(g.player,start)<=RULES.sprintSpeed*RULES.movementInertia*.55);
  const end={...g.player};tick(g,{x:0,z:0},1/fps);assert.deepEqual(g.player,end);
 }
});

test('Zero inertia allows immediate direction changes without disabling sprint startup acceleration',()=>{
 const tuning={...RULES,movementInertia:0};
 assert.deepEqual(movementVelocity({x:1.6,z:0},{x:-1,z:0},tuning,1/60),{x:-1.6,z:0});
 assert.deepEqual(movementVelocity({x:1.6,z:0},{x:0,z:0},tuning,1/60),{x:0,z:0});
 const start=movementVelocity({x:0,z:0},{x:1,z:0,run:true},tuning,1/60);assert.ok(start.x>0&&start.x<tuning.sprintSpeed);
});

test('Actual reported velocity matches total frame travel after partial contact',()=>{
 const g=fixture(),start={...g.player};tick(g,{x:0,z:1,run:true},.1);
 assert.ok(Math.abs(g.playerVelocity.z-(g.player.z-start.z)/.1)<1e-8);
});
