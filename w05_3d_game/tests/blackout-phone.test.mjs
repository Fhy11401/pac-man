import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick} from '../src/core.js';
import {MONITOR_CONNECT_SECONDS} from '../src/blackout-state.js';
import {distance,CELL_SIZE} from '../src/world.js';

const still={x:0,z:0};
function fixture(){const g=createGame({}, {mode:'blackout'});g.player={x:18,z:10};g.enemyDelay=10000;return g;}
function step(g,seconds,input=still){for(let left=seconds;left>1e-8;left-=1/60)tick(g,input,Math.min(1/60,left));}
function press(g,action){return tick(g,{...still,action},.1);}

test('walking and blocked running are silent to AI; only actual sprint movement emits footsteps',()=>{
  for(const run of [false,true]){
    const g=fixture();g.enemy={x:18,z:11};tick(g,{x:0,z:-1,run,heading:0},.1);
    assert.ok(distance(g.player,{x:18,z:10})>.05);
    assert.equal(Boolean(g.blackout.lastHeard),run);
    if(run)assert.equal(g.blackout.lastHeard.kind,'footstep');
  }
  const stationary=fixture();stationary.enemy={x:18,z:11};tick(stationary,{...still,run:true},.1);assert.equal(stationary.blackout.lastHeard,null);
  const blocked=fixture();blocked.player={x:18+blocked.tuning.corridorWidth/(2*CELL_SIZE)-blocked.tuning.playerRadius-1e-6,z:11};blocked.enemy={x:18,z:13};const before={...blocked.player};tick(blocked,{x:1,z:0,heading:-Math.PI/2,run:true},.1);
  assert.ok(distance(blocked.player,before)<2e-6);assert.equal(blocked.blackout.lastHeard,null);
});

test('phone mode is reversible without teleporting, keeps AI running, and permits handheld light controls',()=>{
  const g=fixture();g.enemyDelay=0;const position={...g.player},enemy={...g.enemy};
  press(g,'phone');assert.equal(g.blackout.phoneOpen,true);
  step(g,.5,{x:0,z:1,run:true,heading:Math.PI});assert.deepEqual(g.player,position);assert.ok(distance(g.enemy,enemy)>.2);
  press(g,'flashlight');assert.equal(g.blackout.flashlight,true);press(g,'nightvision');assert.equal(g.blackout.nightVision,true);assert.equal(g.blackout.flashlight,false);
  press(g,'phone');assert.equal(g.blackout.phoneOpen,false);step(g,.2,{x:0,z:1});assert.ok(g.player.z>position.z+.1);
});

for(const fps of [15,30,60,144])test(`remote monitoring connects in simulation time and remains stationary at ${fps} Hz`,()=>{
  const g=fixture();g.blackout.battery=37;g.blackout.nightVision=true;
  const position={...g.player},heading=.72,events=[];
  events.push(...tick(g,{x:1,z:0,run:true,heading,action:'monitor'},1/fps));
  assert.equal(g.blackout.monitor,false);assert.ok(g.blackout.monitorConnecting>0);assert.equal(g.blackout.nightVision,false);
  while(g.elapsed+1/fps<MONITOR_CONNECT_SECONDS-1e-9)events.push(...tick(g,{x:1,z:0,run:true,heading},1/fps));
  assert.equal(g.blackout.monitor,false);
  while(g.elapsed<MONITOR_CONNECT_SECONDS+.02)events.push(...tick(g,{x:1,z:0,run:true,heading},1/fps));
  assert.equal(g.blackout.monitor,true);assert.equal(g.blackout.monitorConnecting,0);assert.deepEqual(g.player,position);
  assert.equal(g.blackout.heading,heading);assert.equal(g.blackout.battery,37);
  assert.equal(events.filter(event=>event==='monitor-connect').length,1);assert.equal(events.filter(event=>event==='monitor').length,1);
});

test('connecting is cancellable and allows remote calls without instantly opening the feed',()=>{
  const g=fixture();press(g,'phone');press(g,'monitor');assert.equal(g.blackout.phoneOpen,false);assert.ok(g.blackout.monitorConnecting>0);
  press(g,'phone-a');assert.ok(g.blackout.phones[0].remaining>0);assert.equal(g.blackout.monitor,false);
  press(g,'monitor');assert.equal(g.blackout.monitorConnecting,0);assert.equal(g.blackout.monitor,false);
  step(g,2);assert.equal(g.blackout.monitor,false,'cancelled jobs must not open later');
  press(g,'monitor');press(g,'phone');assert.equal(g.blackout.phoneOpen,true);assert.equal(g.blackout.monitorConnecting,0);assert.equal(g.blackout.monitor,false);
});

test('connection and phone screens never protect against contact; death and restart clear device state',()=>{
  for(const action of ['phone','monitor']){
    const g=fixture();press(g,action);g.enemy={...g.player};tick(g,still,.1);
    assert.equal(g.phase,'caught');assert.equal(g.lives,2);assert.equal(g.blackout.phoneOpen,false);assert.equal(g.blackout.monitorConnecting,0);assert.equal(g.blackout.monitor,false);
  }
  const fresh=createGame({}, {mode:'blackout'});assert.equal(fresh.blackout.phoneOpen,false);assert.equal(fresh.blackout.monitorConnecting,0);assert.equal(fresh.blackout.monitor,false);
});
