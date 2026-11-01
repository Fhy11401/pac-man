import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createDefaultMapDocument,cloneMapDocument,normalizeMapDocument,validateMapDocument,isProtectedCell,isProtectedEdge} from '../src/map-document.js';
import {DRAFT_STORAGE_KEY,PREVIEW_STORAGE_KEY,PREVIEW_TTL_MS,saveDraft,loadDraft,createPreview,loadRuntimeMapDefinition} from '../src/map-draft.js';

const edit=(doc,p,tile)=>{doc.tiles[p.z]=doc.tiles[p.z].slice(0,p.x)+tile+doc.tiles[p.z].slice(p.x+1);};
const nearby=p=>[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
const open=(doc,p)=>doc.tiles[p.z]?.[p.x]!==undefined&&doc.tiles[p.z][p.x]!=='#';
const cells=doc=>doc.tiles.flatMap((row,z)=>[...row].map((tile,x)=>({x,z,tile})));
const has=(doc,code)=>validateMapDocument(doc).errors.some(error=>error.code===code);
function memoryStorage(){
  const entries=new Map();return {getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key),entries};
}

test('the current and legacy layouts are valid independent documents with preserved collection counts',()=>{
  const doc=createDefaultMapDocument(),bundled=JSON.parse(readFileSync(new URL('../DEFAULT_MAP.json',import.meta.url),'utf8')),legacy=JSON.parse(readFileSync(new URL('../assets/maps/maplab-before-editor.json',import.meta.url),'utf8'));
  assert.deepEqual(doc,bundled);
  for(const map of [doc,legacy]){
    const before=JSON.stringify(map),result=validateMapDocument(map);assert.equal(result.valid,true,JSON.stringify(result.errors));
    assert.equal(result.analysis.stats.shards,map.tiles.join('').split('*').length-1);assert.equal(JSON.stringify(map),before);
    assert.ok(map.tiles.every(row=>/^[#.*]+$/.test(row)));
  }
  assert.deepEqual(doc.barriers,[],'the default has no permanent edge partitions');assert.equal(doc.barriers.length,bundled.barriers.length);assert.equal(legacy.barriers.length,8);
  const cloned=cloneMapDocument(doc);cloned.start.x=15;edit(cloned,{x:1,z:1},'.');assert.notDeepEqual(cloned,doc);assert.deepEqual(doc,createDefaultMapDocument());
});

test('normalization rejects malformed or unknown data without modifying its input',()=>{
  const mutations=[d=>{d.version=2;},d=>{d.extra=true;},d=>{d.width=33;},d=>{d.tiles[0]+='#';},d=>{d.tiles[0]='S'+d.tiles[0].slice(1);},d=>{d.start.x=Infinity;},d=>{d.start.z=.5;},d=>{d.enemy.label='bad';},d=>{d.barriers=[{a:{x:1,z:1},b:{x:2,z:1},hidden:true}];},d=>{d.entryGate.z=NaN;}];
  for(const mutate of mutations){const doc=createDefaultMapDocument();mutate(doc);const before=JSON.stringify(doc);assert.throws(()=>normalizeMapDocument(doc),TypeError);assert.equal(JSON.stringify(doc),before);assert.equal(validateMapDocument(doc).valid,false);}
  const polluted=JSON.parse(JSON.stringify(createDefaultMapDocument()).replace('{','{"__proto__":{"polluted":true},'));assert.throws(()=>normalizeMapDocument(polluted),TypeError);assert.equal({}.polluted,undefined);
});

test('safe-room terrain, perimeter and doorway edges are protected while ordinary corridor cells remain editable',()=>{
  const doc=createDefaultMapDocument();
  for(const p of [doc.start,doc.entryGate.inside,doc.entryGate.outside,{x:15,z:14},{x:0,z:5}])assert.equal(isProtectedCell(doc,p),true);
  assert.equal(isProtectedEdge(doc,doc.entryGate.inside,doc.entryGate.outside),true);
  const editable=cells(doc).find(p=>p.tile==='*'&&!isProtectedCell(doc,p));assert.ok(editable);
  const blocked=cloneMapDocument(doc);edit(blocked,doc.entryGate.inside,'#');assert.ok(has(blocked,'protected-terrain'));
  const board=cloneMapDocument(doc);board.barriers.push({a:{...doc.entryGate.inside},b:{...doc.entryGate.outside}});assert.ok(has(board,'protected-edge'));
  const crystal=cloneMapDocument(doc);edit(crystal,doc.start,'*');assert.ok(has(crystal,'safe-shard'));
  const boundary=cloneMapDocument(doc);edit(boundary,{x:0,z:1},'.');assert.ok(has(boundary,'open-boundary'));
  const moved=cloneMapDocument(doc);moved.safeRoom.minX--;assert.ok(has(moved,'protected-structure'));
});

test('markers remain distinct and reachable, and the exit needs a real adjacent wall',()=>{
  const doc=createDefaultMapDocument();doc.start={x:15,z:15};assert.equal(validateMapDocument(doc).valid,true);
  const overlap=cloneMapDocument(doc);overlap.enemy={...doc.exit};assert.ok(has(overlap,'marker-overlap'));
  const wall=cloneMapDocument(doc);wall.enemy={x:0,z:0};assert.ok(has(wall,'marker-terrain'));
  const safe=cloneMapDocument(doc);safe.enemy={x:16,z:15};assert.ok(has(safe,'unsafe-marker'));
  const exterior=cloneMapDocument(doc);exterior.start={...doc.enemy};assert.ok(has(exterior,'start-room'));
  const unsupported=cloneMapDocument(doc);unsupported.exit={x:7,z:7};for(const p of [unsupported.exit,...nearby(unsupported.exit)])edit(unsupported,p,'.');assert.ok(has(unsupported,'exit-wall'));
});

test('unfinished islands and invalid barriers are errors, but a connected dead end is only a warning',()=>{
  const doc=createDefaultMapDocument(),isolated=cells(doc).find(p=>p.tile==='#'&&!isProtectedCell(doc,p)&&nearby(p).every(n=>!open(doc,n)));
  assert.ok(isolated);const island=cloneMapDocument(doc);edit(island,isolated,'*');assert.ok(has(island,'unreachable'));
  const branch=cells(doc).find(p=>p.tile==='#'&&!isProtectedCell(doc,p)&&nearby(p).filter(n=>open(doc,n)).length===1);
  assert.ok(branch);const deadEnd=cloneMapDocument(doc);edit(deadEnd,branch,'.');const validation=validateMapDocument(deadEnd);assert.equal(validation.valid,true,JSON.stringify(validation.errors));assert.ok(validation.warnings.some(w=>w.code==='dead-ends'));
  const pair=cells(doc).filter(p=>p.tile!=='#').flatMap(a=>nearby(a).filter(b=>open(doc,b)&&!isProtectedEdge(doc,a,b)).map(b=>({a:{x:a.x,z:a.z},b}))).find(({a,b})=>{const candidate=cloneMapDocument(doc);candidate.barriers.push({a,b});return validateMapDocument(candidate).valid;});
  assert.ok(pair);const duplicate=cloneMapDocument(doc);duplicate.barriers.push(pair,{a:{...pair.b},b:{...pair.a}});assert.ok(has(duplicate,'duplicate-barrier'));
  const diagonal=cloneMapDocument(doc);diagonal.barriers.push({a:{x:2,z:2},b:{x:3,z:3}});assert.ok(has(diagonal,'barrier-endpoints'));
});

test('draft saving keeps incomplete geometry, reports storage errors, and never stores game parameters',()=>{
  const storage=memoryStorage(),doc=createDefaultMapDocument();doc.name='未完成草稿';
  const isolated=cells(doc).find(p=>p.tile==='#'&&!isProtectedCell(doc,p)&&nearby(p).every(n=>!open(doc,n)));
  assert.ok(isolated,'the invalid draft fixture needs a wall cell with no open neighbors');
  edit(doc,isolated,'*');assert.equal(validateMapDocument(doc).valid,false);
  assert.deepEqual(loadDraft({storage}),{document:null,error:null});saveDraft(doc,{storage});assert.deepEqual(loadDraft({storage}).document,doc);
  assert.deepEqual([...storage.entries.keys()],[DRAFT_STORAGE_KEY]);
  assert.throws(()=>createPreview(doc,{storage}),/到达/);
  const previous=storage.getItem(DRAFT_STORAGE_KEY);assert.throws(()=>saveDraft(doc,{storage:{setItem(){throw new Error('quota');}}}),/quota/);assert.equal(storage.getItem(DRAFT_STORAGE_KEY),previous);
  storage.setItem(DRAFT_STORAGE_KEY,'{broken');assert.equal(loadDraft({storage}).document,null);assert.match(loadDraft({storage}).error,/读取失败/);
});

test('preview snapshots are immutable and retain only the latest five independently of the draft',()=>{
  const storage=memoryStorage(),doc=createDefaultMapDocument(),now=10000000;saveDraft(doc,{storage});
  const previews=[];for(let i=0;i<6;i++){doc.name=`地图 ${i}`;previews.push(createPreview(doc,{storage,now:now+i,baseURL:'http://localhost:5185/editor.html'}));}
  assert.equal(JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY)).length,5);assert.equal(loadDraft({storage}).document.name,'我的地图');
  assert.match(previews.at(-1).url,/index\.html\?mapDraft=/);doc.name='继续编辑';
  const selected=loadRuntimeMapDefinition({storage,search:`?mapDraft=${previews.at(-1).id}`,now:now+7});assert.equal(selected.isDraft,true);assert.equal(selected.definition.name,'地图 5');assert.equal(selected.error,null);
  const evicted=loadRuntimeMapDefinition({storage,search:`?mapDraft=${previews[0].id}`,now:now+7});assert.equal(evicted.definition,null);assert.match(evicted.error,/移除/);
});

test('expired, missing, corrupted and semantically invalid previews fail closed; normal launch never touches storage',()=>{
  const storage=memoryStorage(),doc=createDefaultMapDocument(),now=20000000,preview=createPreview(doc,{storage,now});
  const expired=loadRuntimeMapDefinition({storage,search:`?mapDraft=${preview.id}`,now:now+PREVIEW_TTL_MS+1});assert.equal(expired.definition,null);assert.match(expired.error,/过期/);
  for(const search of ['?mapDraft=','?mapDraft=../bad','?mapDraft=not-found','?mapDraft=first-one&mapDraft=second-two']){const result=loadRuntimeMapDefinition({storage,search,now});assert.equal(result.isDraft,true);assert.equal(result.definition,null);assert.ok(result.error);}
  const bad=JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY));bad[0].document.enemy={x:0,z:0};storage.setItem(PREVIEW_STORAGE_KEY,JSON.stringify(bad));assert.match(loadRuntimeMapDefinition({storage,search:`?mapDraft=${preview.id}`,now}).error,/快照无法运行/);
  storage.setItem(PREVIEW_STORAGE_KEY,'not json');assert.equal(loadRuntimeMapDefinition({storage,search:`?mapDraft=${preview.id}`,now}).definition,null);
  const defaultRun=loadRuntimeMapDefinition({search:'?v=latest',get storage(){throw new Error('default startup must not access storage');}});assert.equal(defaultRun.isDraft,false);assert.equal(defaultRun.error,null);
});

test('runtime preview derives the edited markers, spawn heading and shards without S/E overlay losses',()=>{
  const doc=createDefaultMapDocument();doc.start={x:15,z:15};
  const choices=cells(doc).filter(p=>p.tile==='*'&&!isProtectedCell(doc,p)&&nearby(p).some(n=>!open(doc,n)));
  doc.enemy={x:choices[0].x,z:choices[0].z};doc.exit={x:choices.at(-1).x,z:choices.at(-1).z};assert.equal(validateMapDocument(doc).valid,true);
  const source=`globalThis.window={location:{search:'?mapDraft=runtime-fixture'},localStorage:{getItem(){return JSON.stringify([{id:'runtime-fixture',createdAt:Date.now(),document:${JSON.stringify(doc)}}]);}}};const w=await import('./src/world.js');console.log(JSON.stringify({start:w.START,enemy:w.ENEMY_START,exit:w.EXIT,yaw:w.START_YAW,shards:w.SHARDS.length,draft:w.IS_MAP_DRAFT,error:w.MAP_DRAFT_ERROR}));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(child.status,0,child.stderr);
  const result=JSON.parse(child.stdout);assert.deepEqual(result.start,doc.start);assert.deepEqual(result.enemy,doc.enemy);assert.deepEqual(result.exit,doc.exit);
  assert.equal(result.yaw,-Math.PI/2);assert.equal(result.shards,doc.tiles.join('').split('*').length-1);assert.equal(result.draft,true);assert.equal(result.error,null);
});
