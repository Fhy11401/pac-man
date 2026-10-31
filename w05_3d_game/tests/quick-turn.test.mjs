import test from 'node:test';
import assert from 'node:assert/strict';
import {QuickTurn,QUICK_TURN_SECONDS} from '../src/presentation.js';
import {mapTransform,mapPoint} from '../src/map-view.js';

for(const hz of [30,60,144])test(`Quick turn completes exactly 180 degrees with eased ends at ${hz} Hz`,()=>{
 const turn=new QuickTurn(),steps=[];let angle=0;turn.start();
 for(let i=0;i<Math.ceil(QUICK_TURN_SECONDS*hz)+2;i++){const delta=turn.step(1/hz);steps.push(delta);angle+=delta;assert.ok(delta>=0);assert.ok(angle<=Math.PI+1e-12);}
 assert.ok(Math.abs(angle-Math.PI)<1e-12);assert.equal(turn.active,false);assert.equal(turn.step(1),0);
 assert.ok(steps[0]<Math.max(...steps)*.4);assert.ok(Math.max(...steps)<Math.PI/5);
});
test('Repeated middle clicks cannot restart or queue extra turns; cancelling removes remaining rotation',()=>{
 const turn=new QuickTurn();assert.equal(turn.start(),true);const first=turn.step(.1);assert.equal(turn.start(),false);
 assert.ok(Math.abs(first+turn.step(.3)-Math.PI)<1e-12);
 turn.start();turn.step(.1);turn.cancel();assert.equal(turn.step(.3),0);assert.equal(turn.active,false);
 turn.start();assert.equal(turn.step(QUICK_TURN_SECONDS),Math.PI);
});
test('Incremental turn allows concurrent mouse rotation without snapping or overshoot',()=>{
 const turn=new QuickTurn();turn.start();let yaw=9*Math.PI;const start=yaw;
 yaw+=turn.step(.08);yaw-=.21;yaw+=turn.step(.08);yaw+=.07;yaw+=turn.step(.16);
 assert.ok(Math.abs(yaw-(start+Math.PI-.14))<1e-12);
 assert.equal(turn.step(NaN),0);assert.equal(turn.step(-1),0);
});
test('Map defaults to enlarged local view and keeps player centered at all positions',()=>{
 for(const player of [{x:1,z:1},{x:7,z:7},{x:13,z:13}])for(const yaw of [0,Math.PI/3,Math.PI]){
  const transform=mapTransform(450,player,yaw);assert.equal(transform.scale,2.1);
  assert.deepEqual(mapPoint(player,transform),{x:225,y:225});
 }
});
test('Developer duration changes turn timing while keeping 180 degrees and eased motion',()=>{
 for(const duration of [.16,.32,.6]){
  const turn=new QuickTurn();turn.start(duration);
  assert.ok(Math.abs(turn.step(duration/2)-Math.PI/2)<1e-12);assert.equal(turn.active,true);
  assert.ok(Math.abs(turn.step(duration/2)-Math.PI/2)<1e-12);assert.equal(turn.active,false);
 }
});

test('Quick turn eases angular acceleration into and out of the animation',()=>{
 for(const duration of [.16,.32,.6]){
  const turn=new QuickTurn(),dt=duration/1000;turn.start(duration);
  const first=turn.step(dt);assert.ok(first/(dt*dt)<2,'initial acceleration stays close to rest');
  turn.step(duration-2*dt);const last=turn.step(dt);
  assert.ok(Math.abs(first-last)<1e-12,'the landing is as gentle as the launch');
  assert.ok(Math.abs(turn.angle-Math.PI)<1e-12);assert.equal(turn.active,false);
 }
});
test('Developer map magnification scales the local view without moving its center or changing full map',()=>{
 const p={x:4,z:5};
 for(const scale of [1.4,2.1,3]){
  const local=mapTransform(450,p,1,true,scale);assert.equal(local.scale,scale);assert.deepEqual(mapPoint(p,local),{x:225,y:225});
  assert.equal(mapTransform(450,p,1,false,scale).scale,.8);
 }
});
