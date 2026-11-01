import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound,phoneRingGain} from '../src/audio.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {createGame} from '../src/core.js';

function recorder(){
  const sound=new Sound(),tones=[],impacts=[];
  sound.ctx={state:'running',currentTime:0};sound.effects={gain:{setTargetAtTime(){}}};
  sound.tone=(...args)=>tones.push(args);sound.noiseBurst=()=>{};
  sound.doorImpact=(volume,pan,breaking=false)=>impacts.push({volume,pan,breaking});
  return {sound,tones,impacts};
}
test('hotel phones remain audible at the far side of the map with a clear near/far hierarchy',()=>{
  const near=phoneRingGain(0),middle=phoneRingGain(15),far=phoneRingGain(80,true);
  assert(near>middle&&middle>far);assert(far>=.025&&far<near/4);
  assert(phoneRingGain(10,true)<phoneRingGain(10));
  for(const d of [0,1,25,80,Infinity])assert(Number.isFinite(phoneRingGain(d,true))&&phoneRingGain(d,true)>0);
});
test('distant phones ring on a cadence, not every render update, and pause freezes that cadence',()=>{
  const {sound,tones}=recorder(),game=createGame({}, {mode:'blackout'});
  game.player={x:L.phones[0].x+80,z:L.phones[0].z};game.blackout.phones[0].remaining=7;
  sound.updateBlackout(0,game,0,()=>false);
  assert.equal(tones.filter(t=>t[0]===1550).length,2);assert(tones[0][3]>=.025);
  for(let i=0;i<60;i++)sound.updateBlackout(1/60,game,0,()=>false);
  assert.equal(tones.filter(t=>t[0]===1550).length,2);
  sound.setPaused(true);for(let i=0;i<120;i++)sound.updateBlackout(1/60,game,0,()=>false);
  assert.equal(tones.filter(t=>t[0]===1550).length,2);
  sound.setPaused(false);for(let i=0;i<15;i++)sound.updateBlackout(1/60,game,0,()=>false);
  assert.equal(tones.filter(t=>t[0]===1550).length,4);
  game.blackout.phones[0].remaining=0;for(let i=0;i<120;i++)sound.updateBlackout(1/60,game,0,()=>false);
  assert.equal(tones.filter(t=>t[0]===1550).length,4);
});
test('five seconds of door banging produce ten impacts and one final break independently of render frequency',()=>{
  for(const fps of [30,60,144]){
    const {sound,impacts}=recorder(),game=createGame({}, {mode:'blackout'}),room=L.rooms[0],door=game.blackout.roomDoors[room.id];
    game.player={...room.door};door.bashing=true;
    for(let frame=0;frame<fps*5;frame++){
      door.bashTime=frame/fps;sound.updateBlackout(1/fps,game,0,()=>false);
      sound.updateBlackout(0,game,0,()=>false);
    }
    assert.equal(impacts.length,10,`${fps} Hz must not duplicate impacts`);
    door.bashing=false;door.bashTime=5;door.closed=false;
    for(let frame=0;frame<fps;frame++)sound.updateBlackout(1/fps,game,0,()=>false);
    assert.equal(impacts.length,11);assert.equal(impacts.at(-1).breaking,true);
    assert(impacts.every(hit=>Number.isFinite(hit.pan)&&hit.volume>0));
    const restart=createGame({}, {mode:'blackout'});sound.updateBlackout(0,restart,0,()=>false);
    assert.equal(impacts.length,11,'a new game cannot inherit the old breaking cue');
  }
});
test('pausing and repeated state reads cannot restart a door hit',()=>{
  const {sound,impacts}=recorder(),game=createGame({}, {mode:'blackout'}),door=game.blackout.roomDoors[L.rooms[0].id];
  door.bashing=true;door.bashTime=1;sound.updateBlackout(0,game,0,()=>false);assert.equal(impacts.length,1);
  sound.setPaused(true);for(let i=0;i<100;i++)sound.updateBlackout(.1,game,0,()=>false);assert.equal(impacts.length,1);
  sound.setPaused(false);sound.updateBlackout(0,game,0,()=>false);assert.equal(impacts.length,1);
  door.bashTime=1.5;sound.updateBlackout(.1,game,0,()=>false);assert.equal(impacts.length,2);
  door.bashing=false;door.closed=true;sound.updateBlackout(.1,game,0,()=>false);assert.equal(impacts.length,2,'an interrupted attack must not play a break');
});
