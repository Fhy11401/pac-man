import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,blocked,blackoutSight} from '../src/core.js';
import {blackoutCanSeePlayer} from '../src/blackout-state.js';
import {ENTRY_GATE,distance,CELL_SIZE} from '../src/world.js';

function fixture(player,enemy,heading,enemyHeading){
  const game=createGame({}, {mode:'blackout'});game.enemyDelay=1000;game.player=player;game.enemy=enemy;
  game.blackout.heading=heading;game.blackout.enemyHeading=enemyHeading;return game;
}
function advance(game,seconds){for(let left=seconds;left>1e-8;left-=1/60)tick(game,{x:0,z:0},Math.min(1/60,left));}
function flashlight(game){tick(game,{x:0,z:0,action:'flashlight'},.1);}

test('a torch aimed away from the enemy reveals a visible floor highlight, not the hidden player body',()=>{
  const g=fixture({x:18,z:10},{x:18,z:12},0,Math.PI);
  flashlight(g);
  assert.equal(blackoutCanSeePlayer(g),false);assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.lastKnown,null);
  assert.ok(g.blackout.lastLight.point.z<g.player.z-.5);assert.ok(distance(g.blackout.enemyTarget,g.player)>.5);
  assert.equal(blackoutSight(g,g.enemy,g.blackout.lastLight.point),true);
});

test('visible light at a corner is investigated without revealing its occluded source',()=>{
  const g=fixture({x:22,z:10},{x:18,z:12},Math.PI/2,Math.PI);
  assert.equal(blackoutSight(g,g.enemy,g.player),false);flashlight(g);
  assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.lastKnown,null);assert.equal(blackoutCanSeePlayer(g),false);
  const clue=g.blackout.lastLight;
  assert.ok(clue.point.x>18-g.tuning.corridorWidth/(2*CELL_SIZE));assert.ok(clue.point.x<18.3);assert.ok(distance(g.blackout.enemyTarget,g.player)>3.6);
  assert.equal(blackoutSight(g,g.enemy,clue.point),true);assert.equal(blackoutSight(g,g.player,clue.point),true);
  assert.equal(blocked(clue.approach,.18,g.tuning.corridorWidth),false,'a lit wall face must provide a reachable approach');
});

test('a nearby lit wall face is sampled before beam truncation',()=>{
  const g=fixture({x:22,z:10},{x:24,z:10},0,-Math.PI/2);
  flashlight(g);
  assert.equal(blackoutCanSeePlayer(g),false);assert.ok(g.blackout.lastLight);
  const wallZ=10-g.tuning.corridorWidth/(2*CELL_SIZE);
  assert.ok(g.blackout.lastLight.point.z>wallZ&&g.blackout.lastLight.point.z<wallZ+.18);
  assert.equal(blocked(g.blackout.lastLight.approach,.18,g.tuning.corridorWidth),false);
});

test('unseen highlights behind walls or a closed mechanical door convey no target',()=>{
  const cases=[fixture({x:22,z:10},{x:18,z:12},0,Math.PI),fixture({...ENTRY_GATE.inside},{...ENTRY_GATE.outside},0,0)];
  for(const g of cases){flashlight(g);assert.equal(g.blackout.lastLight,null);assert.equal(g.blackout.lastKnown,null);assert.equal(g.blackout.enemyMode,'patrol');}
  const away=fixture({x:18,z:10},{x:18,z:12},0,0);flashlight(away);
  assert.equal(away.blackout.lastLight,null,'highlights behind the enemy also require a turn to become visible');
});

test('turning the torch off keeps only the last light clue and does not track the unobserved player',()=>{
  const g=fixture({x:22,z:10},{x:18,z:12},Math.PI/2,Math.PI);flashlight(g);
  const clue=structuredClone(g.blackout.lastLight),target={...g.blackout.enemyTarget};
  flashlight(g);g.player={x:18,z:10};g.blackout.heading=0;advance(g,.6);
  assert.deepEqual(g.blackout.lastLight,clue);assert.deepEqual(g.blackout.enemyTarget,target);assert.equal(g.blackout.lastKnown,null);
});

test('night vision never creates illuminated floor or wall clues',()=>{
  const g=fixture({x:18,z:10},{x:18,z:12},0,Math.PI);
  tick(g,{x:0,z:0,action:'nightvision'},.1);advance(g,.4);
  assert.equal(g.blackout.nightVision,true);assert.equal(g.blackout.lastLight,null);assert.equal(g.blackout.lastKnown,null);assert.equal(g.blackout.enemyMode,'patrol');
});
