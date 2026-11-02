import test from 'node:test';
import assert from 'node:assert/strict';
import {HotelEditorState,hotelEntities,moveHotelEntity} from '../src/hotel-editor-state.js';
import {createDefaultHotelDocument,serializeHotelDocument,normalizeHotelDocument,validateHotelDocument} from '../src/hotel-document.js';
import {resolvePowerLayout} from '../src/power-layout.js';
import {POWER_SECTORS} from '../src/power-grid.js';
import {saveHotelDraft,loadHotelDraft,createHotelPreview,loadRuntimeHotelDefinition} from '../src/hotel-draft.js';
test('old single-panel files migrate in editor without changing any terrain or game panel coordinates',()=>{
 const original=createDefaultHotelDocument(),state=new HotelEditorState(original);
 assert.deepEqual(state.document.map,original.map);assert.equal(original.facilities.powerPanels,undefined);
 assert.equal(state.document.facilities.powerPanels.length,4);assert(state.validate().valid);
 assert.deepEqual(resolvePowerLayout(state.document).sectors,POWER_SECTORS);
 assert.equal(hotelEntities(state.document).filter(e=>e.kind==='power').length,4);
});
test('panel movement, undo, export, draft and preview all preserve the same sector and wall',()=>{
 const s=new HotelEditorState(),panel=hotelEntities(s.document).find(e=>e.kind==='power'&&e.number===1),before=serializeHotelDocument(s.document);
 s.change(doc=>moveHotelEntity(doc,panel,1,0));assert(s.validate().valid);const moved=serializeHotelDocument(s.document);
 assert.notEqual(moved,before);s.undo();assert.equal(serializeHotelDocument(s.document),before);s.redo();assert.equal(serializeHotelDocument(s.document),moved);
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 saveHotelDraft(s.document,{storage});const loaded=loadHotelDraft({storage}).document;assert.equal(serializeHotelDocument(loaded),moved);
 const preview=createHotelPreview(loaded,{storage}),runtime=loadRuntimeHotelDefinition({storage,search:new URL(preview.url).search});
 assert.equal(runtime.error,null);assert.equal(resolvePowerLayout(runtime.definition).sectors[0].x,15);assert.equal(resolvePowerLayout(runtime.definition).sectors[0].sector,'reception');
 assert.equal(serializeHotelDocument(normalizeHotelDocument(JSON.parse(moved))),moved);
});
test('unusable, duplicate, missing and misassigned panels prevent an invalid preview',()=>{
 for(const [mutate,code] of [
  [d=>d.facilities.powerPanels[0].x=0,'facility-terrain'],
  [d=>d.facilities.powerPanels[0].wall={x:0,z:1},'fixture-wall'],
  [d=>d.facilities.powerPanels[0].sector='lounge','power-sector'],
  [d=>d.facilities.powerPanels.pop(),'power-missing'],
  [d=>Object.assign(d.facilities.powerPanels[0],{x:42,z:27}),'power-location'],
 ]){const d=new HotelEditorState().document;mutate(d);assert(validateHotelDocument(d).errors.some(e=>e.code===code),code);}
});
