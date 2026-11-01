import {mazeGame} from './helpers/game-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerMotion} from '../src/player-motion.js';
import {MouseResistance} from '../src/look-input.js';
import {DEFAULT_TUNING as tuning} from '../src/tuning.js';
import {createGame,tick,blocked} from '../src/core.js';
import {steerVelocity} from '../src/movement.js';
import {Sound} from '../src/audio.js';
import {angularTurnRate} from '../src/presentation.js';
import {straightCorridor,rightAngle,heading,projection} from './helpers/map-fixtures.js';

test('Equal mouse distance gives equal turn at different speeds and polling rates by default',()=>{
  const turns=[];
  for(const hz of [125,500,1000])for(const duration of [.08,.5,2]){
    const mouse=new MouseResistance(),frames=Math.round(hz*duration);let total=0;
    for(let i=0;i<frames;i++)total+=mouse.apply({x:360/frames,y:0},i*1000/hz,tuning.mouseFriction).x;
    turns.push(total);
  }
  assert.ok(Math.max(...turns)-Math.min(...turns)<1e-8);
});

test('Look steering preserves speed, including a 180-degree turn and angle wrap',()=>{
  for(const [a,b] of [[0,Math.PI/2],[Math.PI-.01,-Math.PI+.01],[0,Math.PI]]){
    const v=steerVelocity({x:-Math.sin(a)*2.8,z:-Math.cos(a)*2.8},a,b);
    assert.ok(Math.abs(v.x+Math.sin(b)*2.8)<1e-9);assert.ok(Math.abs(v.z+Math.cos(b)*2.8)<1e-9);
  }
  assert.deepEqual(steerVelocity({x:1,z:0},null,1),{x:1,z:0});
});

test('Holding forward while turning follows the view without a one-frame sideways slide',()=>{
  for(const fps of [30,60,144]){
    const turn=rightAngle(),g=mazeGame();g.player={...turn.corner};g.enemyDelay=999;
    g.moveHeading=heading(turn.incoming);g.motionVelocity=turn.vector(2.8,0);
    const start={...g.player};tick(g,{...turn.outgoing,heading:heading(turn.outgoing),run:true},1/fps);
    assert.ok(Math.abs(projection(g.player,start,turn.incoming))<1e-9);
    assert.ok(Math.abs(projection(g.player,start,turn.outgoing)-2.8/fps)<1e-9);assert.equal(blocked(g.player),false);
  }
});

test('Turning while coasting does not redirect released momentum; A/D still brakes',()=>{
  const hall=straightCorridor(),g=mazeGame();g.player=hall.at(0);g.enemyDelay=999;g.moveHeading=-Math.PI/2;g.motionVelocity={x:2.8,z:0};
  tick(g,{x:0,z:0,heading:0},1/144);
  assert.ok(g.player.x>hall.origin.x);assert.equal(g.player.z,hall.origin.z);
  const v=g.motionVelocity.x;tick(g,{x:-1,z:0,heading:0,run:true},1/144);
  assert.ok(g.motionVelocity.x<v&&g.motionVelocity.x>0);
});

test('A mouse-like quarter turn at running speed clears a narrow corner at 30/60/144 Hz',()=>{
  for(const fps of [30,60,144]){
    const turn=rightAngle(),g=mazeGame();g.player=turn.at(-.4,0);g.enemyDelay=999;
    g.moveHeading=heading(turn.incoming);g.motionVelocity=turn.vector(tuning.sprintSpeed,0);
    const duration=.4*Math.PI/2/tuning.sprintSpeed;let elapsed=0;
    while(elapsed<duration-1e-9){
      const dt=Math.min(1/fps,duration-elapsed),angle=(elapsed+dt/2)/duration*Math.PI/2,direction=turn.vector(Math.cos(angle),Math.sin(angle));
      tick(g,{...direction,heading:heading(direction),run:true},dt);
      assert.equal(blocked(g.player),false);elapsed+=dt;
    }
    for(let i=0;i<fps/4;i++)tick(g,{...turn.outgoing,heading:heading(turn.outgoing),run:true},1/fps);
    assert.ok(Math.abs(projection(g.player,turn.corner,turn.incoming))<.02);assert.ok(projection(g.player,turn.corner,turn.outgoing)>1);assert.equal(blocked(g.player),false);
  }
});

test('Gait and footfalls have the same cadence across render rates and all travel directions',()=>{
  for(const speed of [tuning.playerSpeed,tuning.sprintSpeed]){
    const totals=[];
    for(const fps of [30,60,144]){
      const motion=new PlayerMotion();let steps=0;
      for(let i=0;i<fps*4;i++){motion.update(speed,1/fps,tuning);steps+=motion.steps;}
      totals.push({steps,phase:motion.phase});
    }
    assert.ok(totals.every(t=>t.steps===totals[0].steps));
    assert.ok(Math.max(...totals.map(t=>t.phase))-Math.min(...totals.map(t=>t.phase))<1e-9);
  }
});

test('FOV follows achieved speed; a stationary player never gets sprint FOV',()=>{
  const motion=new PlayerMotion();
  for(let i=0;i<120;i++)motion.update(tuning.playerSpeed,1/60,tuning);
  assert.equal(motion.fov,0);
  for(let i=0;i<120;i++)motion.update(tuning.sprintSpeed,1/60,tuning);
  assert.ok(Math.abs(motion.fov-tuning.runFov)<1e-8);
  for(let i=0;i<90;i++)motion.update(0,1/60,tuning);
  assert.ok(motion.fov<1e-6);assert.equal(motion.steps,0);assert.equal(motion.bob,0);assert.equal(motion.sway,0);assert.equal(motion.pitch,0);
});

test('Footfalls occur on camera downstrokes and are shared with audio, even with motion disabled',()=>{
  for(const enabled of [true,false]){
    const motion=new PlayerMotion();let sounds=0,steps=0;
    const audio={playing:true,heartClock:0,voiceClock:999,foot:0,step:()=>sounds++};
    for(let i=0;i<600;i++){
      motion.update(tuning.sprintSpeed,1/60,tuning,{motion:enabled});steps+=motion.steps;
      Sound.prototype.update.call(audio,1/60,tuning.sprintSpeed,100,0,false,false,0,motion.steps);
      if(motion.steps&&enabled)assert.ok(motion.bob<0);
      if(!enabled)assert.equal(Math.abs(motion.bob)+Math.abs(motion.sway)+Math.abs(motion.pitch)+motion.fov,0);
    }
    assert.ok(steps>20);assert.equal(sounds,steps);
  }
});

test('Menu, pause, death and new-run reset leave no queued gait or footstep',()=>{
  const motion=new PlayerMotion();for(let i=0;i<90;i++)motion.update(2.8,1/60,tuning);
  motion.update(2.8,1/60,tuning,{active:false});
  assert.deepEqual({...motion},{...new PlayerMotion()});
});
test('Turning stabilizes gait while retaining stride phase and footstep timing',()=>{
 const plain=new PlayerMotion(),steady=new PlayerMotion();let a=0,b=0,plainSteps=0,steadySteps=0;
 for(let i=0;i<120;i++){
  plain.update(tuning.sprintSpeed,1/60,tuning,{turnRate:0});steady.update(tuning.sprintSpeed,1/60,tuning,{turnRate:4});
  if(i>30){a+=Math.abs(plain.pitch)+Math.abs(plain.sway);b+=Math.abs(steady.pitch)+Math.abs(steady.sway);}
  plainSteps+=plain.steps;steadySteps+=steady.steps;
 }
 assert.ok(b<a*.3);assert.equal(steady.phase,plain.phase);assert.equal(steadySteps,plainSteps);assert.equal(steady.fov,plain.fov);
 for(let i=0;i<120;i++){plain.update(tuning.sprintSpeed,1/60,tuning);steady.update(tuning.sprintSpeed,1/60,tuning);}
 assert.ok(Math.abs(plain.bob-steady.bob)<1e-7);
});
test('Turn stabilization can be disabled and angular wrap does not create a false jolt',()=>{
 const plain=new PlayerMotion(),off=new PlayerMotion();for(let i=0;i<60;i++){
  plain.update(2.8,1/60,tuning);off.update(2.8,1/60,{...tuning,turnStability:0},{turnRate:10});
 }assert.equal(plain.bob,off.bob);assert.equal(plain.pitch,off.pitch);
 assert.ok(Math.abs(angularTurnRate(Math.PI-.01,-Math.PI+.01,.02)-1)<1e-10);
 assert.equal(angularTurnRate(null,3,.02),0);assert.equal(angularTurnRate(0,3,0),0);
 assert.equal(angularTurnRate(0,3,NaN),0);assert.equal(angularTurnRate(0,3,Infinity),0);
});
