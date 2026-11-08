import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultHotelDocument} from '../src/hotel-document.js';
import {HOTEL_DRAFT_STORAGE_KEY,HOTEL_PREVIEW_STORAGE_KEY,HOTEL_PREVIEW_TTL_MS,saveHotelDraft,loadHotelDraft,createHotelPreview,loadRuntimeHotelDefinition} from '../src/hotel-draft.js';

const memory=()=>{const data=new Map();return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
test('only explicit hotel previews access persisted layouts; ordinary play ignores draft and tuning storage',()=>{
  const storage={getItem(){throw new Error('must not read storage');}};
  const result=loadRuntimeHotelDefinition({storage,search:''});assert.equal(result.isDraft,false);assert.equal(result.error,null);assert.equal(result.definition.map.width,56);
  const store=memory(),doc=createDefaultHotelDocument();doc.facilities.power.x=0;saveHotelDraft(doc,{storage:store});
  assert.deepEqual(loadHotelDraft({storage:store}).document,doc);assert.throws(()=>createHotelPreview(doc,{storage:store}));
  assert.deepEqual([...store.data.keys()],[HOTEL_DRAFT_STORAGE_KEY]);
});
test('previews snapshot the complete map and facilities independently from later saved edits',()=>{
  const storage=memory(),doc=createDefaultHotelDocument(),now=2000000000000;doc.facilities.power.x=47;
  const preview=createHotelPreview(doc,{storage,now,baseURL:'http://localhost/hotel-editor.html?mapDraft=old#tab'}),url=new URL(preview.url);
  assert.equal(url.pathname,'/index.html');assert.equal(url.searchParams.get('hotelDraft'),preview.id);assert.equal(url.searchParams.has('mapDraft'),false);assert.equal(url.hash,'');
  doc.facilities.power.x=46;saveHotelDraft(doc,{storage});
  const loaded=loadRuntimeHotelDefinition({storage,now,search:url.search});assert.equal(loaded.error,null);assert.equal(loaded.isDraft,true);assert.equal(loaded.definition.facilities.power.x,47);
  assert.equal(loadHotelDraft({storage}).document.facilities.power.x,46);assert.deepEqual([...storage.data.keys()].sort(),[HOTEL_DRAFT_STORAGE_KEY,HOTEL_PREVIEW_STORAGE_KEY].sort());
});
test('bad links, expired or tampered snapshots and storage failures never silently start a different hotel',()=>{
  const storage=memory(),now=2000000000000,preview=createHotelPreview(createDefaultHotelDocument(),{storage,now}),search=new URL(preview.url).search;
  for(const query of ['?hotelDraft=bad',`${search}&mapDraft=other-map`,`${search}&hotelDraft=duplicate-id`]){const r=loadRuntimeHotelDefinition({storage,now,search:query});assert.equal(r.definition,null);assert.ok(r.error);}
  assert.ok(loadRuntimeHotelDefinition({storage,now:now+HOTEL_PREVIEW_TTL_MS+1,search}).error);
  const list=JSON.parse(storage.getItem(HOTEL_PREVIEW_STORAGE_KEY));list[0].document.facilities.power.x=0;storage.setItem(HOTEL_PREVIEW_STORAGE_KEY,JSON.stringify(list));
  assert.ok(loadRuntimeHotelDefinition({storage,now,search}).error);
  const broken={getItem(){throw new Error('disabled');},setItem(){throw new Error('quota');}};
  assert.ok(loadHotelDraft({storage:broken}).error);assert.throws(()=>saveHotelDraft(createDefaultHotelDocument(),{storage:broken}),/quota/);
});
