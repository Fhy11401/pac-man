import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,getBlackoutInteraction,blackoutSight} from '../src/core.js';
import {blackoutCanSeePlayer,blackoutPlayerWalls,ROOM_DOOR_TIMING as T} from '../src/blackout-state.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {getBedHideSpots,BED_HIDE_SECONDS} from '../src/bed-layout.js';
import {entryCollisionWalls} from '../src/entry-state.js';
import {START,distance,RULES} from '../src/world.js';

const still={x:0,z:0};
const heading=(a,b)=>Math.atan2(a.x-b.x,a.z-b.z);
function step(g,seconds,input=still,fps=60){
  const events=[];for(let left=seconds;left>1e-8;left-=1/fps)events.push(...tick(g,input,Math.min(1/fps,left)));return events;
}
function setup(room=L.rooms[0],tuning={}){
  const g=createGame(tuning,{mode:'blackout'}),spot=getBedHideSpots(g.tuning.corridorWidth).find(s=>s.roomId===room.id);
  g.player={...spot.approaches[0]};g.enemyDelay=10000;
  g.blackout.heading=heading(g.player,spot.target);return{g,spot,room};
}
function enter(g,spot){
  assert.equal(getBlackoutInteraction(g,heading(g.player,spot.target))?.id,spot.id);
  tick(g,{...still,action:'interact',heading:heading(g.player,spot.target)},1/60);step(g,BED_HIDE_SECONDS-1/60);
  assert.equal(g.blackout.hidden,spot.id);assert.equal(g.blackout.bedTransition,null);assert.ok(distance(g.player,spot.target)<1e-8);
}
function open(g,room){g.blackout.roomDoors[room.id].closed=false;g.blackout.roomDoors[room.id].progress=0;}
function inside(p,room){const b=room.bounds;return p.x>=b.minX-.45&&p.x<=b.maxX+.45&&p.z>=b.minZ-.45&&p.z<=b.maxZ+.45;}

test('bed entry lowers outside before moving in; exit reverses it and retains solid furniture for enemies',()=>{
  for(const room of L.rooms)for(const radius of [.12,.15,.19]){
    const {g,spot}=setup(room,{playerRadius:radius}),outside={...g.player};
    tick(g,{...still,action:'interact',heading:heading(g.player,spot.target)},.1);
    const enterId=g.blackout.bedTransition.id;assert.deepEqual(g.player,outside);
    assert.ok(entryCollisionWalls(g).some(w=>w.id===spot.bedId));assert.ok(!blackoutPlayerWalls(g).some(w=>w.id===spot.bedId));
    let previous={...g.player};
    for(let i=0;i<27;i++){tick(g,{x:1,z:0,run:true},1/60);assert.ok(distance(previous,g.player)<.05);previous={...g.player};}
    assert.equal(g.blackout.bedTransition,null);assert.ok(distance(g.player,spot.target)<1e-8);
    step(g,.5,{x:1,z:1,run:true});assert.ok(distance(g.player,spot.target)<1e-8);assert.equal(g.sprinting,false);
    tick(g,{...still,action:'interact'},.1);assert.notEqual(g.blackout.bedTransition.id,enterId);
    assert.ok(distance(g.player,spot.target)>.01);step(g,.45);
    assert.equal(g.blackout.hidden,null);assert.equal(g.blackout.bedHide,null);assert.ok(distance(g.player,outside)<1e-8);
    assert.ok(blackoutPlayerWalls(g).some(w=>w.id===spot.bedId));
  }
});

test('bed interactions require the same room, a nearby clear side, and facing the bed',()=>{
  const {g,spot}=setup();
  assert.notEqual(getBlackoutInteraction(g,g.blackout.heading+Math.PI)?.kind,'bed');
  g.player={...START};tick(g,{...still,action:'interact',heading:heading(g.player,spot.target)},.1);
  assert.equal(g.blackout.hidden,null);assert.deepEqual(g.player,START);
});

test('an unobserved bed occupant stays concealed and can use phone, night vision and remote CCTV',()=>{
  const {g,spot,room}=setup();enter(g,spot);g.blackout.powerOn=true;
  open(g,room);g.enemy={...room.door.inside};g.blackout.enemyHeading=heading(g.enemy,g.player)+Math.PI;
  assert.equal(blackoutCanSeePlayer(g),false);
  tick(g,{...still,action:'nightvision'},.1);const charge=g.blackout.battery;step(g,.3);assert.ok(g.blackout.battery<charge);
  tick(g,{...still,action:'flashlight'},.1);assert.equal(g.blackout.flashlight,false);
  tick(g,{...still,action:'phone'},.1);assert.equal(g.blackout.phoneOpen,true);
  tick(g,{...still,action:'monitor'},.1);step(g,1.25);assert.equal(g.blackout.monitor,true);
  assert.equal(g.blackout.hidden,spot.id);assert.ok(distance(g.player,spot.target)<1e-8);assert.equal(g.phase,'playing');
  tick(g,{...still,action:'monitor'},.1);assert.equal(g.blackout.monitor,false);assert.equal(g.blackout.hidden,spot.id);
});

test('a phone is one global clue despite range, mechanical isolation, ring pulses and other noise',()=>{
  const g=createGame({}, {mode:'blackout'});g.enemy={x:49,z:31};g.enemyDelay=10000;
  assert.equal(blackoutSight(g,g.player,L.phones[0]),false);
  tick(g,{...still,action:'phone-a'},.1);const clue=g.blackout.enemyRoomSearch.clueId;
  assert.equal(g.blackout.enemyMode,'investigate');assert.equal(g.blackout.lastKnown,null);
  assert.deepEqual(g.blackout.lastHeard.point,{x:L.phones[0].x,z:L.phones[0].z});
  assert.deepEqual(g.blackout.enemyTarget,L.rooms[0].door.inside);
  g.blackout.sounds.push({id:++g.blackout.soundSerial,point:{...g.enemy},kind:'footstep',range:10,remaining:.3});
  step(g,8);assert.equal(g.blackout.phones[0].remaining,0);assert.equal(g.blackout.enemyRoomSearch.clueId,clue);
  assert.deepEqual(g.blackout.enemyTarget,L.rooms[0].door.inside);
  g.enemy={...START};g.player={x:18,z:13};assert.equal(g.blackout.doorProgress,1);
  tick(g,{...still,action:'phone-b'},.1);assert.equal(g.blackout.phoneTasks[0].roomId,L.rooms[1].id);
});

for(const fps of [15,60,144])test(`door bashing requires five simulated seconds at ${fps} Hz without double-call resets`,()=>{
  const room=L.rooms[0],g=createGame({}, {mode:'blackout'});g.enemy={...room.door.outside};g.enemyDelay=0;
  const events=tick(g,{...still,action:'phone-a'},1/fps),state=g.blackout.roomDoors[room.id];
  events.push(...tick(g,{...still,action:'phone-b'},1/fps));const id=g.blackout.enemyRoomSearch.clueId;
  let elapsed=2/fps;
  while(state.closed&&elapsed<6){events.push(...tick(g,still,1/fps));elapsed+=1/fps;if(elapsed<5-1e-8)assert.equal(state.progress,1);}
  assert.ok(elapsed>=5-1e-7&&elapsed<=5+1/fps+1e-7);assert.equal(state.bashTime,5);assert.equal(state.bashProgress,1);assert.equal(state.bashing,false);
  assert.equal(events.filter(e=>e==='room-door-bash').length,10);assert.equal(g.blackout.enemyRoomSearch.clueId,id);
  assert.equal(g.blackout.phoneTasks.length,1);assert.equal(g.blackout.phoneTasks[0].roomId,L.rooms[1].id);
});

test('an unobserved bed occupant survives a phone inspection; the enemy walks, looks around, and leaves',()=>{
  for(const room of L.rooms){
    const {g,spot}=setup(room);enter(g,spot);g.enemy={...room.door.outside};g.enemyDelay=0;
    tick(g,{...still,action:L.phones.findIndex(p=>p.room===room.room)?'phone-b':'phone-a'},.1);
    let visited=false,looked=false,travel=0,last={...g.enemy};
    for(let n=0;n<2400&&g.blackout.enemyRoomSearch;n++){
      tick(g,still,1/60);travel+=distance(last,g.enemy);last={...g.enemy};visited ||= inside(g.enemy,room);looked ||= g.blackout.enemyRoomSearch?.phase==='search'&&g.blackout.enemyRoomSearch.lookRemaining>0;
      assert.equal(g.phase,'playing');assert.equal(g.blackout.knownBed,null);
    }
    assert.ok(visited&&looked&&travel>4);assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.enemyMode,'patrol');
    assert.equal(inside(g.enemy,room),false);assert.equal(g.blackout.hidden,spot.id);assert.equal(g.blackout.lastKnown,null);assert.equal(g.lives,3);
  }
});

test('witnessed bed entry is investigated and caught; phone calls cannot divert the known hiding place',()=>{
  const {g,spot,room}=setup();open(g,room);g.enemy={...room.door.inside};g.blackout.enemyHeading=heading(g.enemy,g.player)+Math.PI;g.blackout.powerOn=true;
  assert.equal(blackoutCanSeePlayer(g),true);enter(g,spot);assert.equal(g.blackout.knownBed,spot.id);
  tick(g,{...still,action:'phone-b'},.1);assert.equal(g.blackout.phoneTasks.length,0);assert.equal(g.blackout.enemyRoomSearch.reason,'witness');
  g.enemyDelay=0;step(g,1);assert.equal(g.phase,'caught');assert.equal(g.lives,2);assert.equal(g.blackout.bedHide,null);
  step(g,RULES.caughtSeconds+RULES.respawnSeconds+.1);assert.equal(g.phase,'playing');assert.deepEqual(g.player,START);
  assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.knownBed,null);assert.equal(g.blackout.hidden,null);
});

test('seeing someone enter a room does not reveal an unseen crawl beneath the bed behind its closed door',()=>{
  const {g,spot,room}=setup();g.player={...room.door.inside};open(g,room);g.enemy={...room.door.outside};g.blackout.enemyHeading=Math.PI/2;g.blackout.powerOn=true;
  tick(g,still,.1);assert.equal(g.blackout.enemyMode,'chase');assert.equal(g.blackout.enemyRoomSearch.reason,'witness');
  g.blackout.roomDoors[room.id].closed=true;g.blackout.roomDoors[room.id].progress=1;g.player={...spot.approaches[0]};enter(g,spot);
  assert.equal(g.blackout.knownBed,null);tick(g,{...still,action:'phone-b'},.1);assert.equal(g.blackout.phoneTasks.length,0);
  g.enemyDelay=0;for(let n=0;n<2400&&g.blackout.enemyRoomSearch;n++){tick(g,still,1/60);assert.equal(g.phase,'playing');}
  assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.enemyMode,'patrol');assert.equal(inside(g.enemy,room),false);assert.equal(g.blackout.hidden,spot.id);
});
