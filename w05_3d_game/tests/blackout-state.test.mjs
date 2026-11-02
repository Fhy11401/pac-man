import {POWER_SECTORS} from '../src/power-grid.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,blocked,getBlackoutInteraction,blackoutSight} from '../src/core.js';
import {blackoutCanSeePlayer} from '../src/blackout-state.js';
import {entryCollisionWalls} from '../src/entry-state.js';
import {BLACKOUT_LAYOUT as L,BLACKOUT_RULES as R} from '../src/blackout-layout.js';
import {START,ENTRY_GATE,ENEMY_START,RULES,distance,isInSafeRoom,pathTo,isOpen} from '../src/world.js';

const still={x:0,z:0};
function game(){const g=createGame({}, {mode:'blackout'});g.enemyDelay=10000;return g;}
function step(g,seconds,input=still){
  const events=[];for(let left=seconds;left>1e-8;left-=1/60)events.push(...tick(g,input,Math.min(1/60,left)));
  return events;
}
function press(g,action,heading=g.blackout.heading){return tick(g,{...still,action,heading},.1);}
function openDoor(g){g.blackout.doorClosed=false;g.blackout.doorProgress=0;g.entryOpened=true;}
function walk(g,target){
  for(const point of pathTo(g.player,target).slice(1)){
    let frames=0;
    while(distance(g.player,point)>.025&&g.phase==='playing'&&frames++<300){
      const d=distance(g.player,point),scale=Math.min(1,d/(g.tuning.sprintSpeed/60));
      tick(g,{x:(point.x-g.player.x)/d*scale,z:(point.z-g.player.z)/d*scale,run:true,heading:Math.atan2(g.player.x-point.x,g.player.z-point.z)},1/60);
      assert.equal(blocked(g.player,g.tuning.playerRadius,g.tuning.corridorWidth),false);
    }
    assert.ok(distance(g.player,point)<.03,`route could not reach ${point.x},${point.z}`);
  }
}

test('the trial is opt-in, independent, and has no invisible crystal collection',()=>{
  const original=createGame(),a=game(),b=game();
  assert.equal(original.blackout,undefined);assert.equal(a.tuning.corridorWidth,2.0);
  for(const field of Object.keys(a.tuning))if(field!=='corridorWidth')assert.equal(a.tuning[field],original.tuning[field],`blackout width must not alter ${field}`);
  assert.equal(a.blackout.battery,90);assert.equal(a.blackout.doorProgress,1);
  a.player={x:18,z:10};step(a,.3,{x:1,z:0});
  assert.equal(a.collected.size,0);assert.ok(!a.events.includes('collect')&&!a.events.includes('unlock'));
  a.blackout.batteries.add('battery-a');assert.equal(b.blackout.batteries.size,0);
  for(const point of [L.power,L.console,...L.phones,...L.lockers,...L.batteries,...L.patrol])assert.ok(isOpen(point.x,point.z));
});

test('edge actions toggle only once across substeps, and lights are mutually exclusive',()=>{
  const g=game();
  assert.equal(press(g,'nightvision').filter(e=>e==='nightvision').length,1);
  assert.equal(g.blackout.nightVision,true);assert.ok(Math.abs(g.blackout.battery-89.9)<1e-8);
  press(g,'flashlight');assert.equal(g.blackout.nightVision,false);assert.equal(g.blackout.flashlight,true);
  press(g,'nightvision');assert.equal(g.blackout.flashlight,false);assert.equal(g.blackout.nightVision,true);
  g.blackout.battery=.03;const events=step(g,.1);
  assert.equal(g.blackout.battery,0);assert.equal(g.blackout.nightVision,false);assert.equal(events.filter(e=>e==='battery-empty').length,1);
  press(g,'nightvision');assert.equal(g.blackout.nightVision,false);
});

test('darkness and night vision never grant enemy vision; torch direction and walls matter',()=>{
  const g=game();g.enemy={x:18,z:10};g.player={x:18,z:8};g.blackout.enemyHeading=Math.PI;
  assert.equal(blackoutCanSeePlayer(g),false);
  press(g,'nightvision',Math.PI);assert.equal(blackoutCanSeePlayer(g),false);assert.equal(g.blackout.enemyMode,'patrol');
  press(g,'flashlight',0);assert.equal(blackoutCanSeePlayer(g),false,'a torch aimed away must not illuminate the enemy');
  tick(g,{...still,heading:Math.PI},.1);assert.equal(blackoutCanSeePlayer(g),true);assert.equal(g.blackout.enemyMode,'chase');
  g.blackout.powerOn=true;g.blackout.flashlight=false;g.blackout.enemyHeading=0;
  assert.equal(blackoutCanSeePlayer(g),false,'room power does not remove the enemy field of view');
  g.player={x:22,z:10};g.enemy={x:18,z:12};g.blackout.enemyHeading=Math.PI;
  assert.equal(blackoutSight(g,g.enemy,g.player),false);assert.equal(blackoutCanSeePlayer(g),false);
});

test('actual sprint footsteps carry farther than walking and record a sound snapshot',()=>{
  for(const run of [false,true]){
    const g=game();g.player={x:18,z:8};g.enemy={x:18,z:11};g.blackout.enemyHeading=0;
    tick(g,{x:0,z:-1,heading:0,run},.1);
    assert.equal(g.blackout.enemyMode,run?'investigate':'patrol');
    if(run){assert.equal(g.blackout.lastHeard.kind,'footstep');assert.ok(distance(g.blackout.enemyTarget,g.player)>.05,'hearing stores a discrete step, not a live target');}
  }
  const g=game();g.player={x:22,z:10};g.enemy={x:18,z:13};
  tick(g,{x:1,z:0,heading:-Math.PI/2,run:true},.1);
  assert.equal(g.blackout.lastHeard,null,'nearby sound across a wall must follow the longer corridor route');
});

test('repair noise is investigated around corridors without seeing through walls',()=>{
  const g=game();g.player={...L.power};g.enemy={x:49,z:12};
  tick(g,{...still,heading:0,interact:true},.1);
  assert.equal(blackoutCanSeePlayer(g),false);assert.equal(g.blackout.enemyMode,'investigate');
  assert.equal(g.blackout.lastHeard.kind,'repair');assert.deepEqual(g.blackout.enemyTarget,{x:L.power.x,z:L.power.z});
});

test('phone calls reach the hotel but never override an active visual or remembered chase',()=>{
  const g=game();g.enemy={x:18,z:11};g.player={x:18,z:10};g.blackout.enemyHeading=Math.PI;g.blackout.powerOn=true;
  assert.equal(press(g,'phone-a').filter(e=>e==='phone-a').length,1);
  assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,g.player);
  assert.equal(press(g,'phone-a').includes('phone-a'),false);assert.ok(g.blackout.phones[0].remaining<R.phoneSeconds);
  g.blackout.powerOn=false;step(g,.8);
  assert.equal(g.blackout.enemyMode,'chase');assert.deepEqual(g.blackout.enemyTarget,g.player);assert.equal(g.blackout.phoneTasks.length,0);
  const distant=game();distant.enemy={x:3,z:3};press(distant,'phone-a');
  assert.equal(distant.blackout.lastHeard.kind,'phone');assert.equal(distant.blackout.enemyMode,'investigate');
  assert.equal(distant.blackout.enemyRoomSearch.roomId,L.rooms[0].id);
});

test('losing perception visits the last seen position, searches, then resumes patrol',()=>{
  const g=game();g.enemy={x:18,z:10};g.player={x:18,z:8};g.blackout.enemyHeading=Math.PI;
  press(g,'flashlight',Math.PI);assert.equal(g.blackout.enemyMode,'chase');
  const last={...g.blackout.lastKnown};press(g,'flashlight',Math.PI);
  g.player={x:18,z:6};g.enemyDelay=0;step(g,1.2);
  assert.equal(g.blackout.enemyMode,'search');assert.ok(distance(g.enemy,last)<.04);assert.deepEqual(g.blackout.lastKnown,last);
  step(g,R.searchSeconds+.2);assert.equal(g.blackout.enemyMode,'patrol');
});

test('continuous moving footstep targets do not pull the enemy back to cell centres',()=>{
  const g=game();g.player={x:18,z:10};g.enemy={x:18,z:7};g.enemyDelay=0;
  let previous=g.enemy.z;
  for(let i=0;i<140;i++){
    tick(g,{x:0,z:1,run:true,heading:Math.PI},1/60);
    assert.ok(g.enemy.z>=previous-1e-8,'a new sound must not reverse an active straight corridor edge');
    previous=g.enemy.z;
  }
  assert.ok(g.enemy.z>9);assert.equal(g.phase,'playing');
});

test('mechanical door opens from both sides and remains a collider throughout opening',()=>{
  for(const [point,heading] of [[ENTRY_GATE.inside,0],[ENTRY_GATE.outside,Math.PI]]){
    const g=game();g.player={...point};
    assert.equal(getBlackoutInteraction(g,heading)?.kind,'door');
    assert.equal(press(g,'interact',heading).filter(e=>e==='door').length,1);
    assert.equal(g.blackout.doorClosed,false);assert.equal(entryCollisionWalls(g).filter(w=>w.id==='entry-gate').length,1);
    assert.equal(blackoutSight(g,ENTRY_GATE.inside,ENTRY_GATE.outside),false);
    step(g,.5);assert.equal(g.blackout.doorProgress,0);assert.equal(entryCollisionWalls(g).filter(w=>w.id==='entry-gate').length,0);
    assert.equal(blackoutSight(g,ENTRY_GATE.inside,ENTRY_GATE.outside),true);
    press(g,'interact',heading);step(g,.5);
    assert.equal(g.blackout.doorProgress,1);assert.equal(blackoutSight(g,ENTRY_GATE.inside,ENTRY_GATE.outside),false);
  }
});

test('closed doors resist long frames and charging without activating the old board rules',()=>{
  const g=game();g.player={...ENTRY_GATE.inside};
  for(let i=0;i<40;i++)tick(g,{x:0,z:-1,run:true,heading:0,interact:true},1);
  assert.equal(g.blackout.doorProgress,1);assert.equal(g.entryOpened,false);
  assert.ok(g.player.z>=ENTRY_GATE.z+.03+g.tuning.playerRadius-1e-5);
  assert.ok(!g.events.includes('boards-break'));
});

test('door safety refuses to close on either the player or enemy',()=>{
  for(const actor of ['player','enemy']){
    const g=game();openDoor(g);g.player={...ENTRY_GATE.inside};g[actor]={x:ENTRY_GATE.x,z:ENTRY_GATE.z};
    const before={...g[actor]},events=press(g,'interact',0);
    assert.ok(events.includes('door-blocked'));assert.equal(g.blackout.doorClosed,false);assert.equal(g.blackout.doorProgress,0);
    assert.deepEqual(g[actor],before);
  }
});

test('powered control room is visible through an open door and is not an immunity zone',()=>{
  const g=game();openDoor(g);g.player={...START};g.enemy={...ENTRY_GATE.outside};g.blackout.enemyHeading=0;g.enemyDelay=0;
  assert.equal(blackoutCanSeePlayer(g),true);step(g,1);
  assert.equal(isInSafeRoom(g.enemy),true);assert.equal(g.blackout.enemyMode,'chase');
  step(g,1);assert.equal(g.phase,'caught');assert.equal(g.lives,2);
});

test('a closed door blocks enemy pursuit and light, including memories inside the room',()=>{
  const g=game();g.enemy={...ENTRY_GATE.outside};g.player={...START};g.enemyDelay=0;
  g.blackout.enemyTarget={...g.player};g.blackout.enemyMode='chase';g.blackout.lastKnown={...g.player};
  step(g,2);assert.equal(isInSafeRoom(g.enemy),false);assert.equal(g.lives,3);
  assert.equal(blackoutCanSeePlayer(g),false);assert.equal(blackoutSight(g,g.player,g.enemy),false);
});

test('monitoring freezes only player movement and tools while the enemy and remote calls continue',()=>{
  const g=game();g.player={...L.console};g.enemyDelay=0;
  press(g,'monitor',Math.PI/2);step(g,1.25);assert.equal(g.blackout.monitor,true);
  const before={...g.player},enemy={...g.enemy};
  step(g,.5,{x:1,z:0,run:true});assert.deepEqual(g.player,before);assert.ok(distance(g.enemy,enemy)>.2);
  press(g,'flashlight');press(g,'nightvision');assert.equal(g.blackout.flashlight,false);assert.equal(g.blackout.nightVision,false);
  assert.ok(press(g,'phone-a').includes('phone-a'));press(g,'monitor');assert.equal(g.blackout.monitor,false);
});

test('interaction requires local facing and visibility, not merely a nearby room coordinate',()=>{
  const g=game();g.player={...L.power};
  assert.equal(getBlackoutInteraction(g,0)?.id,'power');assert.equal(getBlackoutInteraction(g,Math.PI),null);
  g.player={x:18,z:12};assert.equal(getBlackoutInteraction(g,0),null);
  g.player={x:16,z:16};press(g,'monitor',Math.PI/2);assert.ok(g.blackout.monitorConnecting>0,'a remote monitor request still requires its connection delay');
});

test('repair can be paused and resumed, and does not advance by tapping E',()=>{
  const g=game();g.player={...L.power};press(g,'interact',0);
  assert.equal(g.blackout.repairProgress,0);
  step(g,2,{...still,heading:0,interact:true});assert.ok(Math.abs(g.blackout.circuits[L.power.id]-.25)<1e-7);
  const saved=g.blackout.repairProgress;step(g,1);assert.equal(g.blackout.repairProgress,saved);
  const events=step(g,6,{...still,heading:0,interact:true});
  assert.equal(g.blackout.powerOn,false);assert.equal(g.blackout.circuits[L.power.id],1);assert.equal(events.filter(e=>e==='sector-on').length,1);
  assert.equal(g.phase,'playing');assert.equal(g.collected.size,0);
});

test('batteries are finite pickups; death retains repair and charge without an automatic win',()=>{
  const g=game();g.player={...L.batteries[0]};press(g,'interact');assert.equal(g.blackout.batteries.size,0);
  assert.match(getBlackoutInteraction(g)?.label,/已满/);
  g.blackout.battery=50;tick(g,still,.1);assert.equal(g.blackout.battery,50);assert.equal(g.blackout.batteries.size,0);
  press(g,'interact');assert.equal(g.blackout.battery,90);assert.ok(g.blackout.batteries.has('battery-a'));
  g.blackout.battery=20;tick(g,still,.1);assert.equal(g.blackout.battery,20);
  g.blackout.powerOn=true;g.blackout.repairProgress=1;g.blackout.flashlight=true;
  g.enemy={...g.player};tick(g,still,.1);assert.equal(g.phase,'caught');assert.equal(g.blackout.flashlight,false);
  step(g,3);assert.equal(g.phase,'playing');assert.deepEqual(g.player,START);assert.equal(g.blackout.hasLeftRoom,false);
  assert.equal(g.blackout.powerOn,true);assert.equal(g.blackout.repairProgress,1);assert.equal(g.blackout.battery,20);assert.equal(g.blackout.batteries.size,1);
  assert.equal(g.blackout.doorProgress,1);step(g,1);assert.equal(g.phase,'playing');
  g.enemyDelay=10000;walk(g,ENTRY_GATE.inside);press(g,'interact',0);step(g,.5);walk(g,ENTRY_GATE.outside);
  assert.equal(g.blackout.hasLeftRoom,true);assert.equal(g.phase,'playing');
  walk(g,ENTRY_GATE.inside);press(g,'interact',0);step(g,.5);step(g,.5,{x:0,z:1,heading:Math.PI});assert.equal(g.phase,'won');
});

test('the full repair-return-close objective uses ordinary movement and cannot win with an enemy indoors',()=>{
  const g=game();walk(g,ENTRY_GATE.inside);press(g,'interact',0);step(g,.5);
  for(const panel of POWER_SECTORS){walk(g,panel);step(g,R.repairSeconds,{...still,heading:Math.atan2(-panel.wall.x,-panel.wall.z),interact:true});}
  assert.equal(g.blackout.powerOn,true);assert.equal(g.phase,'playing');assert.equal(g.blackout.hasLeftRoom,true);
  walk(g,ENTRY_GATE.inside);press(g,'interact',0);step(g,.5);
  assert.equal(g.phase,'playing','closing from the connector is not arriving in the control room');
  step(g,.5,{x:0,z:1,heading:Math.PI});assert.equal(g.phase,'won');assert.equal(g.collected.size,0);
  const unsafe=game();unsafe.blackout.powerOn=true;unsafe.blackout.hasLeftRoom=true;unsafe.enemy={x:15,z:15};
  tick(unsafe,still,.1);assert.equal(unsafe.phase,'playing','locking the enemy inside is not a safe return');
});
