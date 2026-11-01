import {mazeGame} from './helpers/game-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick} from '../src/core.js';
import {MouseLook,MouseResistance} from '../src/look-input.js';
import {SHARDS} from '../src/world.js';
import {straightCorridor} from './helpers/map-fixtures.js';

test('Zero inertia retains the startup ramp and exact release option',()=>{
 for(const fps of [30,60,144]){
  const game=mazeGame({sprintSpeed:3.2,sprintStart:.2,movementInertia:0});game.player=straightCorridor().at(0);let last=0;
  for(let i=1;i<=Math.ceil(fps*.2);i++){
   tick(game,{x:1,z:0,run:true},1/fps);assert.ok(game.moveSpeed>=last);last=game.moveSpeed;
   assert.ok(Math.abs(last-Math.min(3.2,3.2/.2*i/fps))<1e-9);
  }
  const position={...game.player};tick(game,{x:0,z:0},1/fps);assert.equal(game.moveSpeed,0);assert.deepEqual(game.player,position);
  tick(game,{x:1,z:0,run:true},1/fps);assert.ok(game.moveSpeed>0&&game.moveSpeed<3.2);
 }
});

test('Per-run speeds apply to walking and both pursuit stages without changing defaults',()=>{
 const tuning={playerSpeed:1.9,sprintSpeed:3.3,enemySpeed:2.2,escapeEnemySpeed:2.7,walkStart:.04};
 const hall=straightCorridor(5),normal=mazeGame(tuning),escape=mazeGame(tuning),fresh=mazeGame();
 for(const game of [normal,escape]){game.player=hall.at(4);game.enemy=hall.at(0);game.enemyDelay=0;}
 escape.collected=new Set(SHARDS.map((_,i)=>i));
 tick(normal,{x:0,z:0},.1);tick(escape,{x:0,z:0},.1);
 assert.ok(Math.abs(normal.enemy.x-hall.origin.x-.22)<1e-9);assert.ok(Math.abs(escape.enemy.x-hall.origin.x-.27)<1e-9);
 const walk=mazeGame(tuning);walk.player=hall.at(0);tick(walk,{x:1,z:0},.1);tick(walk,{x:1,z:0},.1);assert.ok(Math.abs(walk.playerVelocity.x-1.9)<1e-9);
 normal.tuning.enemySpeed=3;assert.equal(escape.tuning.enemySpeed,2.2);assert.equal(fresh.tuning.enemySpeed,2.05);
});

test('Opt-in mouse speed gain preserves tiny input, direction and fast turns without drift',()=>{
 const friction=new MouseResistance();
 const slow=friction.apply({x:.25,y:-.125},0,.28,1);friction.reset();
 const fast=friction.apply({x:80,y:-40},0,.28,1);
 assert.ok(slow.x>0&&slow.x<.25);assert.equal(slow.y/slow.x,-.5);
 assert.ok(fast.x/80>slow.x/.25);assert.ok(fast.x<80);
 assert.deepEqual(friction.apply({x:0,y:0},8,.28),{x:0,y:0});
 const reverse=friction.apply({x:-2,y:0},16,.28);assert.ok(reverse.x<0);
 assert.deepEqual(friction.apply({x:5,y:-3},24,0),{x:5,y:-3});
});

test('Mouse resistance depends on physical stroke speed instead of polling rate',()=>{
 const totals=[];
 for(const hz of [125,250,500,1000]){
  const friction=new MouseResistance();friction.apply({x:0,y:0},0,.28);let total=0;
  for(let i=1;i<=hz;i++)total+=friction.apply({x:350/hz,y:0},1000*i/hz,.28).x;
  totals.push(total);
 }
 assert.ok(Math.max(...totals)-Math.min(...totals)<1e-8);
});

test('Rejected recenter jumps never become stored rotation in the resistance stage',()=>{
 const mouse=new MouseLook(),friction=new MouseResistance();mouse.setLocked(true);
 assert.equal(friction.apply(mouse.relative({movementX:2000,movementY:100}),0,.28),null);
 assert.equal(friction.apply(mouse.relative({movementX:900,movementY:0}),8,.28),null);
 const normal=friction.apply(mouse.relative({movementX:4,movementY:0}),16,.28);assert.ok(normal.x>0&&normal.x<=4);
 mouse.setLocked(false);assert.equal(friction.apply(mouse.relative({movementX:4,movementY:0}),24,.28),null);
});
