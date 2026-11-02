import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,getBlackoutInteraction} from '../src/core.js';
import {blackoutCanSeePlayer} from '../src/blackout-state.js';
import {POWER_SECTORS,isAreaPowered,sectorAt,restoredCount} from '../src/power-grid.js';
import {blackoutVisualLighting} from '../src/blackout-lighting.js';
import {START,MAP,isInSafeRoom,pathTo} from '../src/world.js';
const make=()=>{const g=createGame({}, {mode:'blackout'});g.enemyDelay=99999;return g;};
function repair(g,p,seconds){g.player={x:p.x,z:p.z};const events=[];for(let t=0;t<seconds-1e-8;t+=1/60)events.push(...tick(g,{x:0,z:0,heading:Math.atan2(-p.wall.x,-p.wall.z),interact:true},1/60));return events;}
test('four unique reachable panels cover the hotel and start unpowered except backup',()=>{
 const g=make();assert.equal(POWER_SECTORS.length,4);assert.equal(new Set(POWER_SECTORS.map(p=>`${p.x},${p.z}`)).size,4);
 for(const p of POWER_SECTORS){assert(pathTo(START,p).length);assert.equal(repair(g,p,.1).includes('repair'),true);assert.equal(getBlackoutInteraction(g)?.id,p.id);}
 for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[z].length;x++)if(MAP[z][x]!=='#')assert(sectorAt({x,z}));
 assert(isAreaPowered(g.blackout,START));assert.equal(restoredCount(g.blackout),0);
});
test('each circuit lights only its territory, completion is one-shot, all circuits are required',()=>{
 const g=make();let total=0;
 for(const p of [...POWER_SECTORS].reverse()){
  const events=repair(g,p,8);total++;
  assert.equal(events.filter(e=>e==='sector-on').length,1);assert.equal(restoredCount(g.blackout),total);
  assert.equal(g.blackout.powerOn,total===4);assert.equal(events.includes('power-on'),total===4);
  for(const other of POWER_SECTORS)assert.equal(isAreaPowered(g.blackout,other),g.blackout.circuits[other.id]===1);
  assert.equal(repair(g,p,.3).includes('sector-on'),false);
 }
 assert.equal(g.blackout.repairProgress,1);assert.equal(g.phase,'playing');
});
test('restored territory enables visual detection without illuminating unrepaired areas or piercing walls',()=>{
 const g=make(),p=POWER_SECTORS[0];g.player={x:p.x,z:p.z+1};g.enemy={x:p.x,z:p.z+3};g.blackout.enemyHeading=Math.PI;
 assert.equal(blackoutCanSeePlayer(g),false);g.blackout.circuits[p.id]=1;
 assert.equal(blackoutCanSeePlayer(g),true);assert.equal(g.blackout.powerOn,false);
 assert.equal(blackoutVisualLighting(g.blackout,p).powerOn,true);
 assert.equal(blackoutVisualLighting(g.blackout,POWER_SECTORS[3]).powerOn,false);
 g.blackout.introLighting='blackout';assert.equal(blackoutVisualLighting(g.blackout,p).powerOn,false);
});
test('repair is heard across the hotel and interrupts phone searches but never redirects pursuit',()=>{
 for(const search of [false,true]){
  const g=make(),p=POWER_SECTORS[2];g.enemy={x:3,z:31};
  if(search){g.blackout.enemyRoomSearch={roomId:'room-201',reason:'phone',phase:'approach'};g.blackout.enemyMode='investigate';}
  repair(g,p,.2);assert.equal(g.blackout.lastHeard.kind,'repair');assert.deepEqual(g.blackout.enemyTarget,{x:p.x,z:p.z});assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.enemyRoomSearch,null);
  const before={...g.enemy};g.enemyDelay=0;tick(g,{x:0,z:0},.1);assert.notDeepEqual(g.enemy,before);
 }
 const g=make();g.enemy={x:3,z:31};g.blackout.enemyMode='chase';g.blackout.enemyTarget={x:3,z:25};repair(g,POWER_SECTORS[2],.2);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,{x:3,z:25});
});
test('a repair clue is a last-heard location, not a permanent player tracker',()=>{
 const g=make(),p=POWER_SECTORS[2];g.enemy={x:3,z:31};repair(g,p,.2);g.player={x:28,z:31};
 for(let t=0;t<2;t+=.1)tick(g,{x:0,z:0},.1);
 assert.deepEqual(g.blackout.enemyTarget,{x:p.x,z:p.z});
});
test('death retains each circuit and partial work, while a new shift resets them',()=>{
 const g=make();repair(g,POWER_SECTORS[0],8);repair(g,POWER_SECTORS[1],2);const saved={...g.blackout.circuits};
 g.enemy={...g.player};tick(g,{x:0,z:0},.1);assert.equal(g.phase,'caught');for(let t=0;t<4;t+=.1)tick(g,{x:0,z:0},.1);
 assert.deepEqual(g.blackout.circuits,saved);assert.equal(g.blackout.powerOn,false);assert.equal(restoredCount(make().blackout),0);
});
test('actual blackout enemy motion uses independent patrol, chase and powered escape speeds',()=>{
 for(const [mode,powered,speed] of [['patrol',false,1.8],['investigate',false,1.8],['chase',false,2.4],['patrol',true,2.8],['chase',true,2.8]]){
  const g=make();g.enemyDelay=0;g.enemy={x:28,z:3};g.blackout.enemyMode=mode;g.blackout.enemyTarget={x:49,z:3};g.blackout.senseClock=99;g.blackout.powerOn=powered;
  tick(g,{x:0,z:0},.1);assert(Math.abs(g.enemy.x-28-speed*.1)<1e-8,`${mode}/${powered}`);
  assert.equal(g.tuning.playerSpeed,1.6);assert.equal(g.tuning.sprintSpeed,2.8);
 }
 const g=createGame({enemyPatrolSpeed:1.3,enemySpeed:2.1,escapeEnemySpeed:3},{mode:'blackout'});g.enemyDelay=0;g.enemy={x:28,z:3};g.blackout.enemyTarget={x:49,z:3};g.blackout.senseClock=99;tick(g,{x:0,z:0},.1);assert(Math.abs(g.enemy.x-28-.13)<1e-8);
});
test('phone and repair investigations rush at chase speed, with repair priority until inspected',()=>{
 for(const kind of ['phone','repair']){
  const g=make();g.enemy={x:3,z:31};
  if(kind==='repair')repair(g,POWER_SECTORS[2],.1);else tick(g,{x:0,z:0,action:'phone-a'},.1);
  assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.investigationKind,kind);
  const before={...g.enemy};g.enemyDelay=0;tick(g,{x:0,z:0},.1);
  assert(Math.abs(Math.hypot(g.enemy.x-before.x,g.enemy.z-before.z)-.24)<1e-7);
 }
 const g=make();g.enemy={x:3,z:31};tick(g,{x:0,z:0,action:'phone-a'},.1);assert.equal(g.blackout.investigationKind,'phone');
 repair(g,POWER_SECTORS[2],.1);assert.equal(g.blackout.investigationKind,'repair');assert.equal(g.blackout.enemyRoomSearch,null);
 const target={...g.blackout.enemyTarget};tick(g,{x:0,z:0,action:'phone-b'},.1);assert.deepEqual(g.blackout.enemyTarget,target);assert.equal(g.blackout.phoneTasks.length,0);assert.equal(g.blackout.investigationKind,'repair');
 // Inspection finishes the high-priority clue, so a later phone can be considered.
 g.player={...START};g.enemy={...target};g.enemyDelay=0;tick(g,{x:0,z:0},.1);assert.equal(g.blackout.enemyMode,'search');
 g.blackout.phones[0].cooldown=0;tick(g,{x:0,z:0,action:'phone-a'},.1);assert.equal(g.blackout.investigationKind,'phone');
});
