import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,getBlackoutInteraction,blackoutSight} from '../src/core.js';
import {blackoutCanSeePlayer,blackoutPath,ROOM_DOOR_TIMING as T} from '../src/blackout-state.js';
import {entryCollisionWalls,roomFurnitureWalls} from '../src/entry-state.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {START,RULES,distance} from '../src/world.js';

const still={x:0,z:0},first=L.rooms[0];
function fixture(room=first,side='outside'){
  const g=createGame({}, {mode:'blackout'});g.enemyDelay=10000;
  g.player={...room.door[side]};
  if(side==='inside')g.player.x+=(room.door.x-g.player.x)*.16;
  return g;
}
const yaw=(g,room=first)=>Math.atan2(g.player.x-room.door.x,g.player.z-room.door.z);
function step(g,seconds,input=still){const events=[];for(let left=seconds;left>1e-8;left-=1/60)events.push(...tick(g,input,Math.min(1/60,left)));return events;}
function down(g,room=first,dt=.08){return tick(g,{...still,heading:yaw(g,room),action:'door-press',interact:true},dt);}
function up(g,room=first){return tick(g,{...still,heading:yaw(g,room),action:'door-release'},.01);}
function quiet(g,room=first){
  const events=down(g,room,.1);
  events.push(...step(g,T.quietHold-.1+.01,{...still,heading:yaw(g,room),interact:true}));
  events.push(...step(g,T.animation+.05));return events;
}
function open(g,room=first){const state=g.blackout.roomDoors[room.id];state.closed=false;state.progress=0;}
function overlaps(p,r,w){return Math.hypot(p.x-Math.max(w.x-w.halfX,Math.min(w.x+w.halfX,p.x)),p.z-Math.max(w.z-w.halfZ,Math.min(w.z+w.halfZ,p.z)))<r-2e-6;}

test('guest rooms replace cabinet hiding with real open cells and independent door states',()=>{
  const a=fixture(),b=fixture();assert.equal(L.lockers.length,0);assert.equal(a.blackout.hidden,null);
  assert.equal(Object.keys(a.blackout.roomDoors).length,L.rooms.length);
  for(const room of L.rooms){assert.equal(a.blackout.roomDoors[room.id].progress,1);assert.ok(entryCollisionWalls(a).some(w=>w.id===room.id));}
  a.blackout.roomDoors[first.id].hold=.5;assert.equal(b.blackout.roomDoors[first.id].hold,0);
});

test('a short press starts the noisy quick delay once; opening completes before passage is allowed',()=>{
  for(const room of L.rooms){
    const g=fixture(room),state=g.blackout.roomDoors[room.id];assert.equal(getBlackoutInteraction(g,yaw(g,room))?.id,room.id);
    assert.ok(!down(g,room).includes('room-door'));
    assert.equal(up(g,room).filter(e=>e==='room-door').length,1);assert.equal(state.progress,1);assert.equal(state.mode,'quick');
    step(g,.13);assert.equal(state.progress,1);assert.equal(blackoutSight(g,room.door.inside,room.door.outside),false);
    step(g,T.quickDelay+T.animation);assert.equal(state.progress,0);assert.equal(state.closed,false);
    assert.equal(blackoutSight(g,room.door.inside,room.door.outside),true);
  }
});

test('a tap released before the next frame still works when its two edges are consumed on consecutive frames',()=>{
  for(const dt of [1/144,1/60,1/15,.1]){
    const g=fixture(),heading=yaw(g),state=g.blackout.roomDoors[first.id];
    tick(g,{...still,heading,interact:false,action:'door-press'},dt);
    assert.equal(state.mode,'hold');assert.equal(state.hold,0);
    const events=tick(g,{...still,heading,interact:false,action:'door-release'},dt);
    assert.equal(events.filter(event=>event==='room-door').length,1);step(g,.6);assert.equal(state.progress,0);
    quiet(g);assert.equal(state.progress,1);
    tick(g,{...still,heading,interact:false,action:'door-press'},dt);
    tick(g,{...still,heading,interact:false,action:'door-release'},dt);step(g,.6);assert.equal(state.progress,0);
  }
  const abandoned=fixture();tick(abandoned,{...still,heading:yaw(abandoned),action:'door-press'},.1);step(abandoned,.3);
  assert.equal(abandoned.blackout.roomDoors[first.id].mode,null);assert.equal(abandoned.blackout.roomDoors[first.id].progress,1);
});

test('long holds operate quietly, whereas an early long-hold release cancels without noise',()=>{
  const g=fixture(),state=g.blackout.roomDoors[first.id];down(g);
  step(g,.35,{...still,heading:yaw(g),interact:true});assert.ok(getBlackoutInteraction(g,yaw(g)).progress>.3);
  const cancel=up(g);step(g,2);assert.equal(state.progress,1);assert.ok(!cancel.includes('room-door'));assert.equal(state.mode,null);
  const events=quiet(g);assert.equal(state.progress,0);assert.ok(events.includes('room-door-quiet'));assert.ok(!events.includes('room-door'));
  assert.equal(g.blackout.sounds.some(sound=>sound.kind==='door'),false);
});

test('room doors block sprinting and long frames, refuse remote operation, and cannot close on a body',()=>{
  for(const room of L.rooms){
    const g=fixture(room),direction=Math.sign(room.door.x-g.player.x);
    for(let i=0;i<25;i++)tick(g,{x:direction,z:0,run:true,heading:yaw(g,room)},1);
    assert.ok(Math.abs(g.player.x-room.door.x)>=g.tuning.playerRadius+.03-1e-5);assert.equal(g.blackout.roomDoors[room.id].progress,1);
    g.player={...START};down(g,room);up(g,room);step(g,.7);assert.equal(g.blackout.roomDoors[room.id].progress,1);
    for(const actor of ['player','enemy']){
      const trap=fixture(room);open(trap,room);trap[actor]={x:room.door.x,z:room.door.z};
      const before={...trap[actor]};down(trap,room);up(trap,room);const events=step(trap,.8);
      assert.ok(events.includes('room-door-blocked'));assert.equal(trap.blackout.roomDoors[room.id].progress,0);assert.deepEqual(trap[actor],before);
    }
  }
});

test('an unobserved quiet room entry creates no invisibility, teleport, or supernatural room knowledge',()=>{
  const g=fixture(first,'inside');open(g);g.enemy={...first.door.outside};g.blackout.enemyHeading=Math.PI/2;
  const before={...g.player};quiet(g);assert.deepEqual(g.player,before);assert.equal(g.blackout.hidden,null);assert.equal(g.blackout.lastKnown,null);
  g.enemyDelay=0;step(g,2);assert.equal(g.blackout.roomDoors[first.id].progress,1);assert.equal(g.phase,'playing');assert.ok(g.enemy.x<first.door.x);
  g.enemy={...g.player};tick(g,still,.1);assert.equal(g.phase,'caught','a room is only protected by its physical door');
});

test('a seen entry leaves a door-side investigation; the enemy waits, opens it, and can catch the occupant',()=>{
  const g=fixture(first,'inside');open(g);g.enemy={...first.door.outside};g.blackout.enemyHeading=Math.PI/2;g.blackout.powerOn=true;
  tick(g,still,.1);assert.equal(blackoutCanSeePlayer(g),true);const seen={...g.player};
  quiet(g);assert.equal(g.blackout.roomDoors[first.id].progress,1);assert.deepEqual(g.blackout.lastKnown,seen);
  g.enemyDelay=0;step(g,.5);assert.equal(g.blackout.roomDoors[first.id].progress,1);assert.ok(g.blackout.roomDoors[first.id].enemyWait>0);
  step(g,4.4);assert.equal(g.blackout.roomDoors[first.id].progress,1);
  step(g,1);assert.equal(g.blackout.roomDoors[first.id].progress,0);assert.equal(g.phase,'caught');
});

test('hotel-wide calls invite a room inspection through wooden doors without player tracking',()=>{
  const g=createGame({}, {mode:'blackout'});g.enemy={...first.door.outside};g.enemyDelay=0;
  tick(g,{...still,action:'phone-a'},.1);
  assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.lastHeard.kind,'phone');assert.equal(g.blackout.lastKnown,null);
  assert.deepEqual(g.blackout.enemyTarget,first.door.inside);
  step(g,6);assert.equal(g.blackout.roomDoors[first.id].progress,0);assert.ok(g.enemy.x>first.door.x);
  assert.equal(g.phase,'playing');assert.deepEqual(g.player,START);
  const far=createGame({}, {mode:'blackout'});far.enemy={x:18,z:13};far.enemyDelay=10000;
  tick(far,{...still,action:'phone-a'},.1);assert.equal(far.blackout.lastHeard.kind,'phone');assert.equal(far.blackout.lastKnown,null);
});

test('night vision remains usable behind a closed guest door without revealing its occupant',()=>{
  const g=fixture(first,'inside');g.enemy={...first.door.outside};g.blackout.enemyHeading=Math.PI/2;
  tick(g,{...still,action:'nightvision'},.1);const charge=g.blackout.battery;step(g,1);
  assert.equal(g.blackout.nightVision,true);assert.ok(Math.abs(g.blackout.battery-(charge-1))<1e-8);
  assert.equal(blackoutCanSeePlayer(g),false);assert.equal(g.blackout.lastLight,null);assert.equal(g.blackout.lastKnown,null);
});

test('real bed collisions stop the player, and enemy navigation goes around the bed foot without changing coordinates',()=>{
  for(const room of L.rooms){
    const z=room.room==='201'?room.bounds.minZ:room.bounds.maxZ,a={x:room.bounds.minX,z},b={x:room.bounds.maxX,z};
    const g=fixture(room);g.player={...a};const walls=roomFurnitureWalls(g.tuning.corridorWidth),bed=walls.find(w=>w.id===`${room.id}-bed`);
    for(let i=0;i<90;i++){
      const before={...g.player};tick(g,{x:1,z:0,run:true,heading:-Math.PI/2},1/60);
      assert.ok(distance(before,g.player)<=g.tuning.sprintSpeed/60+1e-7);assert.ok(!overlaps(g.player,g.tuning.playerRadius,bed));
    }
    assert.ok(g.player.x<=bed.x-bed.halfX-g.tuning.playerRadius+1e-5);
    const guard=fixture(room);guard.player={...START};guard.enemy={...a};guard.enemyDelay=0;guard.blackout.enemyMode='investigate';guard.blackout.enemyTarget={...b};
    const path=blackoutPath(guard,a,b);assert.ok(path.length>2);assert.ok(path.some(p=>p.z!==z));
    for(let i=0;i<180;i++){
      const before={...guard.enemy};tick(guard,still,1/60);
      assert.ok(distance(before,guard.enemy)<=guard.tuning.enemySpeed/60+1e-7);
      for(const wall of walls)assert.ok(!overlaps(guard.enemy,RULES.enemyRadius,wall),`enemy overlaps ${wall.id}`);
    }
    assert.ok(distance(guard.enemy,b)<.04);
  }
});
