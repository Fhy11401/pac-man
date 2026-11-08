import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick} from '../src/core.js';
import {resetBlackoutAfterDeath,blackoutShouldCatch} from '../src/blackout-state.js';
import {DiscoveryWarning} from '../src/discovery-warning.js';
import {ENTRY_GATE} from '../src/world.js';
const make=()=>createGame({}, {mode:'blackout',waitForOfficeDoor:true});
const still={x:0,z:0};

test('initial preparation freezes enemy movement, perception and delay, but permits equipment',()=>{
 const g=make(),before={...g.enemy},delay=g.enemyDelay,target={...g.blackout.enemyTarget};
 tick(g,{...still,action:'phone-a'},.1);
 tick(g,{...still,action:'flashlight'},.1);assert(g.blackout.flashlight);
 for(let i=0;i<400;i++)tick(g,still,.1);
 assert.deepEqual(g.enemy,before);assert.equal(g.enemyDelay,delay);
 assert.deepEqual(g.blackout.enemyTarget,target);assert.equal(g.blackout.enemyMode,'patrol');assert.deepEqual(g.blackout.phoneTasks,[]);
 assert.equal(g.blackout.enemyRoomSearch,null);assert.equal(g.blackout.enemyReleased,false);
 g.enemy={...g.player};assert.equal(blackoutShouldCatch(g),false);
});

test('opening the office door starts an immediate pursuit exactly once; closing does not freeze it',()=>{
 const g=make(),before={...g.enemy};
 const events=tick(g,{...still,action:'office-door'},.1);
 assert(events.includes('enemy-released'));assert.equal(g.blackout.enemyReleased,true);assert.equal(g.enemyDelay,0);
 assert.equal(g.blackout.enemyMode,'chase');assert.notDeepEqual(g.enemy,before);
 const next={...g.enemy};assert(!tick(g,{...still,action:'office-door'},.1).includes('enemy-released'));
 assert.equal(g.blackout.doorClosed,true);assert.notDeepEqual(g.enemy,next);
 assert(!tick(g,{...still,action:'office-door'},.1).includes('enemy-released'));
});

test('the nearby interaction key releases the same protection as the office control',()=>{
 const g=make();g.player={x:ENTRY_GATE.x,z:ENTRY_GATE.z+.6};
 const events=tick(g,{...still,heading:0,action:'interact'},.1);
 assert(events.includes('enemy-released'));assert(g.blackout.enemyReleased);
});

test('death does not restore first-exit protection; a new night does',()=>{
 const g=make();tick(g,{...still,action:'office-door'},.1);resetBlackoutAfterDeath(g);
 assert(g.blackout.enemyReleased);assert(!tick(g,{...still,action:'office-door'},.1).includes('enemy-released'));
 assert.equal(make().blackout.enemyReleased,false);
});

test('the warning respects pause, expiry and fresh night identity',()=>{
 const el={hidden:true,style:{}},w=new DiscoveryWarning(el),g={elapsed:10};
 w.update(g,true);assert(el.hidden);w.trigger(g);g.elapsed+=.3;w.update(g,true);assert(!el.hidden);assert.equal(el.style.opacity,'1');
 w.update(g,false);assert(el.hidden);w.update(g,true);assert(!el.hidden);
 w.update({elapsed:g.elapsed},true);assert(el.hidden);g.elapsed+=5;w.update(g,true);assert(el.hidden);
});

test('opening CCTV releases protection once when the transition completes, and it keeps moving after closing',()=>{
 const g=make(),before={...g.enemy};let count=0;
 tick(g,{...still,action:'monitor'},.05);assert(g.blackout.monitorConnecting>0);assert.equal(g.blackout.enemyReleased,false);assert.deepEqual(g.enemy,before);
 for(let i=0;i<20;i++)count+=tick(g,still,.05).filter(e=>e==='enemy-released').length;
 assert.equal(g.blackout.monitor,true);assert.equal(g.blackout.enemyReleased,true);assert.equal(g.blackout.doorClosed,true);assert.equal(g.blackout.enemyMode,'patrol');assert.equal(g.enemyDelay,0);assert.notDeepEqual(g.enemy,before);assert.equal(count,1);
 tick(g,{...still,action:'monitor'},.05);const moving={...g.enemy};for(let i=0;i<10;i++)tick(g,still,.05);assert.notDeepEqual(g.enemy,moving);assert.equal(g.blackout.enemyReleased,true);
 tick(g,{...still,action:'monitor'},.05);for(let i=0;i<20;i++)count+=tick(g,still,.05).filter(e=>e==='enemy-released').length;
 tick(g,{...still,action:'monitor'},.05);assert(!tick(g,{...still,action:'office-door'},.05).includes('enemy-released'));assert.equal(count,1);
});
test('canceling the monitor lift before a feed opens does not release the enemy',()=>{
 const g=make(),before={...g.enemy};tick(g,{...still,action:'monitor'},.05);tick(g,{...still,action:'monitor'},.05);for(let i=0;i<30;i++)tick(g,still,.1);
 assert.equal(g.blackout.monitor,false);assert.equal(g.blackout.monitorConnecting,0);assert.equal(g.blackout.enemyReleased,false);assert.deepEqual(g.enemy,before);
});


test('CCTV activates patrol silently; only the first office opening announces discovery',()=>{
 const g=make();
 assert(!tick(g,{...still,action:'monitor'},.05).includes('first-office-open'));
 for(let i=0;i<20;i++)assert(!tick(g,still,.05).includes('first-office-open'));
 assert(g.blackout.enemyReleased);assert.equal(g.blackout.officeOpened,false);
 tick(g,{...still,action:'monitor'},.05);
 assert(tick(g,{...still,action:'office-door'},.05).includes('first-office-open'));
 assert(g.blackout.officeOpened);
 assert(!tick(g,{...still,action:'office-door'},.05).includes('first-office-open'));
 assert(!tick(g,{...still,action:'office-door'},.05).includes('first-office-open'));
 resetBlackoutAfterDeath(g);assert(g.blackout.officeOpened);
 assert.equal(make().blackout.officeOpened,false);
});
