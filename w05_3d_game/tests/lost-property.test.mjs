import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,getBlackoutInteraction} from '../src/core.js';
import {propertyEntries,propertyTranscript} from '../src/lost-property-note.js';
import {controlRoomNotePoint} from '../src/control-room-layout.js';
import {exchangeRoomItem} from '../src/room-items.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
const make=(random=()=>.99)=>createGame({}, {mode:'blackout',random,waitForOfficeDoor:true});
test('the paper records the actual randomly selected rooms and keeps its original handover after pickup',()=>{
 const a=make(),b=make(()=>0);assert.notDeepEqual(a.blackout.lostProperty,b.blackout.lostProperty);
 assert.deepEqual(a.blackout.lostProperty,a.blackout.roomItems.map(({roomId,kind})=>({roomId,kind})));
 const before=structuredClone(a.blackout.lostProperty);exchangeRoomItem(a,a.blackout.roomItems[0].id);assert.deepEqual(a.blackout.lostProperty,before);
 const entries=propertyEntries(before);assert.equal(entries.length,2);
 for(let i=0;i<2;i++)assert.equal(entries[i].room,String(L.rooms.find(r=>r.id===before[i].roomId).room));
 assert.match(propertyTranscript(before),/Hockey Stick/);assert.match(propertyTranscript(before),/Stethoscope/);
});
test('reading the desk paper blocks movement, devices and doors without releasing the enemy',()=>{
 const g=make(),point=controlRoomNotePoint(g.tuning.corridorWidth);g.player={x:point.x+.4,z:point.z};
 assert.equal(getBlackoutInteraction(g,Math.PI/2).kind,'note');
 assert(tick(g,{x:0,z:0,heading:Math.PI/2,action:'interact'},.1).includes('note-open'));
 const position={...g.player};for(const action of ['office-door','monitor','flashlight','phone'])tick(g,{x:1,z:1,action},.1);
 assert.deepEqual(g.player,position);assert(g.blackout.doorClosed);assert(!g.blackout.enemyReleased);assert(!g.blackout.monitor);assert(!g.blackout.flashlight);
});
