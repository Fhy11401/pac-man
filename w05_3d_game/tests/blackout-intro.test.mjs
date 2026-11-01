import {OPENING_REVEAL_AT} from '../src/scare-timing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {BlackoutIntro} from '../src/blackout-intro.js';
import {OPENING_CUT_AT} from '../src/opening-timing.js';
test('outage precedes backup power and the optional call without completing repairs',()=>{
 const events=[],game={blackout:{powerOn:false}},intro=new BlackoutIntro({onEvent:e=>events.push(e),onComplete:g=>{assert.equal(g,game);events.push('call');}});
 intro.start(game);assert.equal(game.blackout.introLighting,'mains');assert.equal(game.blackout.introShot,'monitor');assert.equal(game.blackout.introTime,0);
 for(let i=0;i<133;i++)intro.update(.1);assert.equal(game.blackout.introLighting,'blackout');assert.deepEqual(events,['monitor-watch','lens-strike','mains-fail']);
 for(let i=0;i<14;i++)intro.update(.1);assert.equal(game.blackout.introLighting,'blackout');assert.deepEqual(events,['monitor-watch','lens-strike','mains-fail','backup-start']);
 for(let i=0;i<32;i++)intro.update(.1);assert.equal(game.blackout.introLighting,'backup');assert.deepEqual(events,['monitor-watch','lens-strike','mains-fail','backup-start','backup-ready']);
 for(let i=0;i<18;i++)intro.update(.1);assert.equal(intro.active,false);assert.equal(game.blackout.introShot,undefined);assert.equal(game.blackout.introTime,undefined);assert.equal(game.blackout.introLighting,undefined);assert.equal(game.blackout.powerOn,false);assert.deepEqual(events,['monitor-watch','lens-strike','mains-fail','backup-start','backup-ready','call']);
});
test('cancel and restart clear the previous lighting override without placing a call',()=>{
 let calls=0;const first={blackout:{}},second={blackout:{}},intro=new BlackoutIntro({onComplete:()=>calls++});
 intro.start(first);intro.update(.1);intro.start(second);assert.equal(first.blackout.introLighting,undefined);assert.equal(second.blackout.introLighting,'mains');intro.stop();assert.equal(second.blackout.introLighting,undefined);intro.update(100);assert.equal(calls,0);
});

test('the strike cue fires once on the animation clock across frame rates and restarts',()=>{
 for(const fps of [30,60,144]){
  const strikes=[],game={blackout:{}},intro=new BlackoutIntro({onEvent:event=>{if(event==='lens-strike')strikes.push(OPENING_CUT_AT-intro.remaining);}});
  for(let run=0;run<2;run++){
   intro.start(game);for(let i=0;i<Math.ceil(13.1*fps);i++){intro.update(1/fps);const count=strikes.length;intro.update(0);assert.equal(strikes.length,count);}
   assert.equal(strikes.length,run+1);assert.ok(strikes[run]>=OPENING_REVEAL_AT&&strikes[run]<OPENING_REVEAL_AT+1/fps+1e-8);intro.stop();
  }
 }
});
