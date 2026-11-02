import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick} from '../src/core.js';
import {blackoutSight,blackoutCanSeePlayer,ROOM_DOOR_TIMING as T} from '../src/blackout-state.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {POWER_SECTORS,sectorAt} from '../src/power-grid.js';
import {getBedHideSpots} from '../src/bed-layout.js';
import {START,ENTRY_GATE,distance} from '../src/world.js';
const still={x:0,z:0},room=L.rooms[0];
const yaw=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
const make=()=>{const g=createGame({}, {mode:'blackout'});g.enemyDelay=10000;return g;};
function step(g,seconds,input=still){for(let t=0;t<seconds-1e-8;t+=1/120)tick(g,input,Math.min(1/120,seconds-t));}
function bash(){const g=make();g.enemy={...room.door.outside};g.enemyDelay=0;tick(g,{...still,action:'phone-a'},1/60);assert(g.blackout.roomDoors[room.id].bashing);return g;}

test('restored power tracks moving players across the hotel, ignores phones and never resumes patrol',()=>{
 const g=make();g.enemy={x:3,z:31};g.player={x:49,z:3};g.blackout.powerOn=true;g.blackout.senseClock=99;
 assert(!blackoutSight(g,g.enemy,g.player));tick(g,still,1/120);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,g.player);
 g.player={x:28,z:31};tick(g,{...still,action:'phone-a'},1/120);assert.deepEqual(g.blackout.enemyTarget,g.player);assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.phoneTasks.length,0);
 step(g,6);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.lastKnown,g.player);
 g.enemyDelay=0;const before={...g.enemy};tick(g,still,.1);assert(distance(before,g.enemy)>.2,'global pursuit moves along the actual maze');
});

test('the final repair immediately overrides investigation on the completion frame',()=>{
 const g=make(),p=POWER_SECTORS.at(-1);for(const sector of POWER_SECTORS)g.blackout.circuits[sector.id]=1;
 g.blackout.circuits[p.id]=.999;g.player={x:p.x,z:p.z};g.enemy={x:3,z:31};g.blackout.enemyMode='search';g.blackout.searchRemaining=99;
 const events=tick(g,{...still,heading:Math.atan2(-p.wall.x,-p.wall.z),interact:true},1/60);
 assert(events.includes('power-on'));assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,g.player);
});

test('global pursuit finds a bed occupant but respects control-room doors and victory',()=>{
 const g=make(),spot=getBedHideSpots(g.tuning.corridorWidth).find(s=>s.roomId===room.id);g.player={...spot.target};
 g.blackout.hidden=spot.id;g.blackout.bedHide={...spot,exitPoint:{...spot.approaches[0]}};g.blackout.powerOn=true;tick(g,still,1/60);
 assert.equal(g.blackout.knownBed,spot.id);assert.equal(g.blackout.enemyMode,'chase');assert.notDeepEqual(g.blackout.enemyTarget,g.player,'routes to a reachable bed edge');
 const safe=make();safe.blackout.powerOn=true;safe.blackout.hasLeftRoom=true;safe.enemy={...ENTRY_GATE.outside};safe.enemyDelay=0;safe.player={...START};
 assert(!blackoutSight(safe,safe.enemy,safe.player));tick(safe,still,1/60);assert.equal(safe.phase,'won');assert.deepEqual(safe.enemy,ENTRY_GATE.outside);
});

for(const quiet of [false,true])test(`${quiet?'quiet':'quick'} room door handling keeps the intended sound and pursuit semantics`,()=>{
 const g=make();g.player={...room.door.outside};g.enemy={x:49,z:31};g.blackout.senseClock=99;
 const heading=yaw(g.player,room.door);tick(g,{...still,heading,action:'door-press',interact:true},.05);
 if(quiet){step(g,T.quietHold,{...still,heading,interact:true});assert.notEqual(g.blackout.enemyMode,'chase');assert.equal(g.blackout.lastHeard,null);}
 else {tick(g,{...still,heading,action:'door-release'},1/120);assert.equal(g.blackout.enemyMode,'chase');assert.equal(g.blackout.lastHeard.kind,'door');assert.deepEqual(g.blackout.enemyTarget,g.player);
  const heard={...g.blackout.enemyTarget};g.player={x:28,z:31};step(g,.5);assert.deepEqual(g.blackout.enemyTarget,heard,'before full power a door reveals only its sound location');}
});

test('running behind a bashing enemy cancels the room task immediately and starts pursuit',()=>{
 const g=bash();g.player={x:g.enemy.x-1.1,z:g.enemy.z};g.blackout.senseClock=99;
 assert(!blackoutCanSeePlayer(g));tick(g,{x:-1,z:0,run:true,heading:Math.PI/2},1/60);
 assert.equal(g.blackout.enemyMode,'chase');assert.equal(g.blackout.lastHeard.kind,'footstep');assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.roomDoors[room.id].bashing,false);
 const x=g.enemy.x;step(g,.35);assert(g.enemy.x<x,'enemy leaves the old door toward the player');assert(g.blackout.roomDoors[room.id].bashTime<.1,'old bashing stops');
});

test('a visible player interrupts bashing even before the next scheduled perception tick',()=>{
 const g=bash();g.player={x:g.enemy.x-1.1,z:g.enemy.z};g.blackout.enemyHeading=-Math.PI/2;g.blackout.circuits[sectorAt(g.player).id]=1;g.blackout.senseClock=99;
 assert(blackoutCanSeePlayer(g));tick(g,still,1/120);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.lastKnown,g.player);assert.equal(g.blackout.enemyRoomSearch,null);assert(!g.blackout.roomDoors[room.id].bashing);
});

test('a bashing enemy prioritizes player door noise over concurrent repair and phone work',()=>{
 const g=bash(),point={x:g.enemy.x-2,z:g.enemy.z};g.player={...point};
 g.blackout.sounds.push({id:++g.blackout.soundSerial,point:{x:49,z:31},kind:'repair',range:0,remaining:.3});
 g.blackout.sounds.push({id:++g.blackout.soundSerial,point,kind:'door',range:8,remaining:.3});
 tick(g,still,1/120);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,point);assert.equal(g.blackout.lastHeard.kind,'door');assert.equal(g.blackout.phoneTasks.length,0);assert.equal(g.blackout.enemyRoomSearch,null);
});

test('global pursuit resumes after defensive stun without bypassing the stun duration',()=>{
 const g=make();g.blackout.powerOn=true;g.player={x:49,z:3};g.enemy={x:3,z:31};g.blackout.knockdown={elapsed:0,heading:0};
 const before={...g.enemy};step(g,4);assert(g.blackout.knockdown);assert.deepEqual(g.enemy,before);
 step(g,2);assert.equal(g.blackout.knockdown,null);assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,g.player);
});
