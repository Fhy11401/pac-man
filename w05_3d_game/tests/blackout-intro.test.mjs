import test from 'node:test';
import assert from 'node:assert/strict';
import {BlackoutIntro} from '../src/blackout-intro.js';
test('outage precedes backup power and the optional call without completing repairs',()=>{
 const events=[],game={blackout:{powerOn:false}},intro=new BlackoutIntro({onEvent:e=>events.push(e),onComplete:g=>{assert.equal(g,game);events.push('call');}});
 intro.start(game);assert.equal(game.blackout.introLighting,'mains');
 for(let i=0;i<15;i++)intro.update(.1);assert.equal(game.blackout.introLighting,'blackout');assert.deepEqual(events,['mains-fail']);
 for(let i=0;i<10;i++)intro.update(.1);assert.equal(game.blackout.introLighting,'backup');assert.deepEqual(events,['mains-fail','backup-start']);
 for(let i=0;i<13;i++)intro.update(.1);assert.equal(intro.active,false);assert.equal(game.blackout.introLighting,undefined);assert.equal(game.blackout.powerOn,false);assert.deepEqual(events,['mains-fail','backup-start','call']);
});
test('cancel and restart clear the previous lighting override without placing a call',()=>{
 let calls=0;const first={blackout:{}},second={blackout:{}},intro=new BlackoutIntro({onComplete:()=>calls++});
 intro.start(first);intro.update(.1);intro.start(second);assert.equal(first.blackout.introLighting,undefined);assert.equal(second.blackout.introLighting,'mains');intro.stop();assert.equal(second.blackout.introLighting,undefined);intro.update(100);assert.equal(calls,0);
});
