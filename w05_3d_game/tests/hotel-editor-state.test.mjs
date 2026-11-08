import test from 'node:test';
import assert from 'node:assert/strict';
import {HotelEditorState,setHotelCell,fillHotelRectangle,resizeHotel,hotelEntities,moveHotelEntity} from '../src/hotel-editor-state.js';
import {createDefaultHotelDocument} from '../src/hotel-document.js';
import {saveHotelDraft,loadHotelDraft,createHotelPreview} from '../src/hotel-draft.js';

test('a whole brush stroke is one undo step, even when undo arrives before its explicit commit',()=>{
  const state=new HotelEditorState(),before=JSON.stringify(state.document);
  state.begin();for(let x=5;x<=9;x++)setHotelCell(state.document,x,5,'*');
  state.begin();setHotelCell(state.document,10,5,'*');
  assert.equal(state.commit(),true);assert.equal(state.undoStack.length,1);assert.equal(state.commit(),false);
  const painted=JSON.stringify(state.document);assert.equal(state.undo(),true);assert.equal(JSON.stringify(state.document),before);assert.equal(state.redo(),true);assert.equal(JSON.stringify(state.document),painted);
  state.begin();setHotelCell(state.document,11,5,'*');assert.equal(state.undo(),true);assert.equal(state.before,null);assert.equal(JSON.stringify(state.document),painted);
});

test('moving a guest room preserves its interior tiles and moves its door, phone and batteries as one edit',()=>{
  const state=new HotelEditorState(),before=structuredClone(state.document),room=hotelEntities(state.document).find(e=>e.kind==='rooms');
  assert.equal(moveHotelEntity(state.document,room,0,0),false);assert.deepEqual(state.document,before);
  state.change(doc=>moveHotelEntity(doc,room,2,0));const moved=state.document.facilities.rooms[0],phone=state.document.facilities.phones[0],battery=state.document.facilities.batteries[0];
  assert.deepEqual(moved.bounds,{minX:22,maxX:23,minZ:7,maxZ:8});assert.deepEqual(moved.door,{x:21.5,z:8,axis:'x',inside:{x:22,z:8},outside:{x:21,z:8}});
  assert.equal(phone.x,22);assert.equal(battery.x,22);assert.equal(state.document.map.tiles[7][20],'#');assert.equal(state.document.map.tiles[7][22],before.map.tiles[7][20]);
  assert.equal(state.validate().valid,false,'moving a room does not silently tunnel across the hotel');
  state.change(doc=>setHotelCell(doc,20,8,'*'));assert.equal(state.validate().valid,true);
  state.undo();state.undo();assert.deepEqual(state.document,before);state.redo();assert.deepEqual(state.document.facilities.rooms[0],moved);
});

test('replacement, undo/redo, branching edits and thrown mutations keep complete independent documents',()=>{
  const state=new HotelEditorState(),initial=structuredClone(state.document),replacement=createDefaultHotelDocument();replacement.name='Imported layout';replacement.facilities.power.x=47;
  assert.equal(state.replace(replacement),true);replacement.facilities.power.x=46;assert.equal(state.document.facilities.power.x,47);
  state.undo();assert.deepEqual(state.document,initial);state.redo();assert.equal(state.document.name,'Imported layout');
  assert.throws(()=>state.change(doc=>{doc.name='broken';throw new Error('cancel');}),/cancel/);assert.equal(state.document.name,'Imported layout');assert.equal(state.before,null);
  state.undo();state.change(doc=>{doc.name='New branch';});assert.equal(state.redo(),false);assert.equal(state.document.name,'New branch');
});

test('resize and oversized rectangle edits stay bounded, preserve the outer wall and undo cleanly',()=>{
  const state=new HotelEditorState(),before=structuredClone(state.document);
  state.change(doc=>resizeHotel(doc,64,48));assert.equal(state.document.map.tiles[3].slice(0,56),before.map.tiles[3]);
  state.change(doc=>fillHotelRectangle(doc,{x:-1000000000,z:-1000000000},{x:1000000000,z:1000000000},'.'));
  const map=state.document.map;assert.ok(map.tiles.every((row,z)=>row.length===64&&(z===0||z===47?row==='#'.repeat(64):row[0]==='#'&&row[63]==='#')));
  state.undo();state.undo();assert.deepEqual(state.document,before);
  state.change(doc=>resizeHotel(doc,32,27));assert.equal(state.document.map.tiles.length,27);assert.equal(state.document.map.tiles[26],'#'.repeat(32));assert.equal(state.validate().valid,false,'truncated facilities are reported instead of silently moved');
  assert.throws(()=>state.change(doc=>resizeHotel(doc,NaN,27)));assert.equal(state.document.map.width,32);state.undo();assert.deepEqual(state.document,before);
});

test('semantic errors remain saveable drafts while preview requires a complete playable layout',()=>{
  const state=new HotelEditorState(),data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  state.change(doc=>setHotelCell(doc,doc.facilities.power.x,doc.facilities.power.z,'#'));assert.equal(state.validate().valid,false);
  saveHotelDraft(state.document,{storage});assert.deepEqual(loadHotelDraft({storage}).document,state.document);assert.throws(()=>createHotelPreview(state.document,{storage}));
  state.undo();assert.equal(state.validate().valid,true);assert.ok(createHotelPreview(state.document,{storage}).url.includes('hotelDraft='));
});

test('camera moves retain fractional mounting offsets and translate the look target; hall moves preserve existing routes',()=>{
  const state=new HotelEditorState(),camera=hotelEntities(state.document).find(e=>e.kind==='cameras'),before=structuredClone(camera.value);
  state.change(doc=>moveHotelEntity(doc,camera,.1,-.2));assert.ok(Math.abs(camera.value.position.x-before.position.x-.1)<1e-10);assert.ok(Math.abs(camera.value.target.z-before.target.z+.2)<1e-10);
  const hall=hotelEntities(state.document).find(e=>e.kind==='halls'),old=structuredClone(hall.value.bounds),tile=state.document.map.tiles[old.minZ][old.minX];
  state.change(doc=>moveHotelEntity(doc,hall,1,0));assert.equal(state.document.map.tiles[old.minZ][old.minX],tile);
});
