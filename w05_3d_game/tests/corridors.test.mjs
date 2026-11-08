import {mazeGame} from './helpers/game-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,blocked,crossesPickupCell} from '../src/core.js';
import {SHARDS,START,EXIT,RULES,neighbors,wallInset,distance} from '../src/world.js';
import {roundCorners} from '../src/demo.js';
import {straightCorridor,separatedCorridors} from './helpers/map-fixtures.js';

test('Narrow hallway limits sideways travel consistently with body and wall width',()=>{
 for(const corridorWidth of [1.3,1.5,2.4])for(const playerRadius of [.12,.16,.19]){
  const hall=straightCorridor(),game=mazeGame({corridorWidth,playerRadius});game.player=hall.at(0);game.enemyDelay=999;game.enemy={x:-100,z:-100};
  for(let i=0;i<120;i++)tick(game,{x:0,z:-1,run:true},1/60);
  const limit=hall.origin.z-.5+wallInset(corridorWidth)+playerRadius;
  assert.ok(game.player.z>=limit-1e-8);assert.ok(game.player.z<limit+.03);
  assert.equal(blocked(game.player,playerRadius,corridorWidth),false);
 }
});

test('Both edges of every clear corridor collect passed crystals at walking and running speed',()=>{
 let cases=0;
 for(const p of [START,...SHARDS])for(const next of neighbors(p))for(const side of [-1,1]){
  const dx=next.x-p.x,dz=next.z-p.z,offset=.5-wallInset()-RULES.playerRadius-.002;
  const start={x:p.x-dz*offset*side,z:p.z+dx*offset*side};
  if(Array.from({length:21},(_,i)=>({x:start.x+dx*i/20,z:start.z+dz*i/20})).some(q=>blocked(q)))continue;
  for(const run of [false,true]){
   const game=mazeGame();game.player={...start};game.enemyDelay=999;game.enemy={x:-100,z:-100};
   for(let i=0;i<120&&((game.player.x-start.x)*dx+(game.player.z-start.z)*dz)<.95;i++)tick(game,{x:dx,z:dz,run},1/60);
   const index=SHARDS.findIndex(s=>s.x===next.x&&s.z===next.z);
   if(index>=0)assert.ok(game.collected.has(index),`missed ${next.x},${next.z} along edge ${side}`);
   assert.equal(blocked(game.player),false);cases++;
  }
 }
 assert.ok(cases>400);
});

test('Every rounded right-angle turn remains passable and collects its corner crystal',()=>{
 let corners=0;
 for(const p of SHARDS)for(const a of neighbors(p))for(const b of neighbors(p)){
  if((a.x-p.x)*(b.x-p.x)+(a.z-p.z)*(b.z-p.z)!==0)continue;
  const game=mazeGame();game.player={...a};game.enemyDelay=999;game.enemy={x:-100,z:-100};
  for(const target of roundCorners(a,[p,b])){
   for(let frame=0;frame<180&&distance(game.player,target)>.001;frame++){
    const d=distance(game.player,target),scale=Math.min(1,d/(game.tuning.sprintSpeed/60));
    tick(game,{x:(target.x-game.player.x)/d*scale,z:(target.z-game.player.z)/d*scale,run:true},1/60);
    assert.equal(blocked(game.player),false);
   }
   assert.ok(distance(game.player,target)<.01,'corner must not trap the player');
  }
  assert.ok(game.collected.has(SHARDS.indexOf(p)));corners++;
 }
 assert.ok(corners>20);
});

test('Pickup sweep catches skipped tile centres but never vacuums a parallel corridor through a wall',()=>{
 assert.equal(crossesPickupCell({x:1.4,z:1.49},{x:2.6,z:1.49},{x:2,z:1}),true);
 const [here,acrossWall]=separatedCorridors('z',{crystals:true});
 const game=mazeGame();game.player={...here};game.enemyDelay=999;game.enemy={x:-100,z:-100};tick(game,{x:0,z:0},1/60);
 assert.ok(game.collected.has(SHARDS.indexOf(here)));
 assert.equal(game.collected.has(SHARDS.indexOf(acrossWall)),false);
});

test('Exit is reachable at width/body slider extremes without winning on respawn',()=>{
 for(const corridorWidth of [1.3,2.4])for(const playerRadius of [.12,.19]){
  const game=mazeGame({corridorWidth,playerRadius});game.collected=new Set(SHARDS.map((_,i)=>i));game.enemyDelay=999;game.enemy={x:-100,z:-100};
  tick(game,{x:0,z:0},1/60);assert.equal(game.phase,'playing');
  game.player={...neighbors(EXIT)[0]};const input={x:EXIT.x-game.player.x,z:EXIT.z-game.player.z};
  for(let frame=0;frame<120&&game.phase==='playing';frame++)tick(game,input,1/60);
  assert.equal(game.phase,'won');assert.ok(distance(game.player,EXIT)<.5);
 }
});
