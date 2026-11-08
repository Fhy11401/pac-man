import test from 'node:test';
import assert from 'node:assert/strict';
import {NIGHTS,customPreset,configureNight,canContinue,nightClock} from '../src/night-session.js';
import {createGame,tick} from '../src/core.js';
import {START,ENEMY_START,ENTRY_GATE} from '../src/world.js';
import {Sound} from '../src/audio.js';
test('only the implemented first night can be selected',()=>{assert.deepEqual(NIGHTS.map(n=>n.available),[true,false,false,false,false]);assert(Object.isFrozen(NIGHTS));});
test('custom presets clamp bad values without mutating normal night defaults',()=>{const g=createGame({}, {mode:'blackout'}),normal=createGame({}, {mode:'blackout'});assert.deepEqual(customPreset({threat:Infinity,battery:-1,lives:99}),{threat:10,battery:30,lives:3});configureNight(g,{threat:20,battery:40,lives:1});assert.equal(g.lives,1);assert.equal(g.blackout.battery,40);assert(Math.abs(g.tuning.enemySpeed/normal.tuning.enemySpeed-1.45)<1e-9);assert.equal(normal.lives,3);assert.equal(normal.blackout.battery,90);});
test('continue accepts suspended living sessions and refuses absent or finished sessions',()=>{for(const phase of ['playing','caught','respawn'])assert(canContinue({phase},true));for(const phase of ['won','lost'])assert.equal(canContinue({phase},true),false);assert.equal(canContinue({phase:'playing'},false),false);assert.equal(canContinue(null,true),false);});
test('night clock reports elapsed real minutes without implying a six AM win',()=>{assert.equal(nightClock(0),'12:00 AM');assert.equal(nightClock(125),'12:02 AM');assert.equal(nightClock(3600),'1:00 AM');});
test('office door controls work only inside the control room and retain obstruction checks',()=>{const g=createGame({}, {mode:'blackout'});g.enemyDelay=999;tick(g,{x:0,z:0,action:'office-door'},.1);assert.equal(g.blackout.doorClosed,false);g.player={...ENEMY_START};g.enemy={...START};tick(g,{x:0,z:0,action:'office-door'},.1);assert.equal(g.blackout.doorClosed,false);g.player={...START};g.enemy={...ENTRY_GATE};const events=tick(g,{x:0,z:0,action:'office-door'},.1);assert(events.includes('door-blocked'));assert.equal(g.blackout.doorClosed,false);});
test('audio controls affect music-independent master and effects buses and keep pause mute',()=>{const values={},bus=key=>({gain:{setTargetAtTime:v=>values[key]=v}}),s={ctx:{currentTime:1},master:bus('master'),effects:bus('effects'),threat:bus('threat'),paused:false,playing:true,muted:false};Sound.prototype.setMixVolumes.call(s,.5,.25);assert.equal(values.master,.4);assert.equal(values.effects,.3);assert.equal(values.threat,.3);s.paused=true;s.playing=false;Sound.prototype.setMixVolumes.call(s,.8,.8);assert.equal(values.effects,0);assert.equal(values.threat,0);s.muted=true;Sound.prototype.setMixVolumes.call(s,1,1);assert.equal(values.master,0);});

test('opening and call states suppress the gameplay readout',async()=>{
 const {NightUI}=await import('../src/night-ui.js');const nodes={};
 const ui={by:id=>nodes[id]??={}};const game=createGame({}, {mode:'blackout'});
 for(const block of [{intro:true},{callBusy:true},{active:false}]){NightUI.prototype.update.call(ui,game,{active:true,...block});assert.equal(nodes['night-readout'].hidden,true);}
 NightUI.prototype.update.call(ui,game,{active:true});assert.equal(nodes['night-readout'].hidden,false);
});
