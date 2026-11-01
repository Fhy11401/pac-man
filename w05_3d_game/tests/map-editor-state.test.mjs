import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultMapDocument,validateMapDocument,isProtectedCell} from '../src/map-document.js';
import {EditorHistory,paintCell,placeMarker,setBarrier,hasBarrier,strokeCells} from '../src/map-editor-state.js';
const point=(d,p)=>d.tiles[p.z][p.x];
const sample=d=>{for(let z=1;z<26;z++)for(let x=1;x<31;x++)if(d.tiles[z][x]==='#'&&!isProtectedCell(d,{x,z})&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>d.tiles[z+b][x+a]!=='#'))return{x,z};};

test('a multi-cell stroke is one reversible edit, including incident barrier removal',()=>{
 const h=new EditorHistory(createDefaultMapDocument()),before=JSON.stringify(h.document),p=sample(h.document);h.begin('paint');assert.equal(paintCell(h.document,p,'path').changed,true);
 const adjacent=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,z])=>({x:p.x+x,z:p.z+z})).find(q=>point(h.document,q)!=='#'&&!isProtectedCell(h.document,q));
 if(adjacent){assert.equal(setBarrier(h.document,p,adjacent,true).changed,true);assert.equal(hasBarrier(h.document,p,adjacent),true);paintCell(h.document,p,'wall');assert.equal(hasBarrier(h.document,p,adjacent),false);paintCell(h.document,p,'path');}
 assert.equal(h.finish(),true);assert.equal(h.past.length,1);const after=JSON.stringify(h.document);h.undo();assert.equal(JSON.stringify(h.document),before);h.redo();assert.equal(JSON.stringify(h.document),after);
});
test('painting preserves protected entry, boundary and placed markers',()=>{
 const d=createDefaultMapDocument(),before=JSON.stringify(d);for(const p of [d.start,d.entryGate.inside,d.entryGate.outside,{x:0,z:0}])paintCell(d,p,'wall');
 assert.equal(JSON.stringify(d),before);assert.equal(paintCell(d,d.enemy,'wall').changed,false);assert.equal(paintCell(d,d.exit,'wall').changed,false);
 assert.equal(setBarrier(d,d.entryGate.inside,d.entryGate.outside,true).changed,false);
});
test('markers move to legal cells and cannot replace another marker or leave the protected room',()=>{
 const d=createDefaultMapDocument();assert.equal(placeMarker(d,{x:15,z:16},'start').changed,true);assert.equal(placeMarker(d,{x:2,z:3},'start').changed,false);
 assert.equal(placeMarker(d,d.start,'enemy').changed,false);assert.equal(placeMarker(d,{x:2,z:3},'enemy').changed,true);assert.equal(validateMapDocument(d).valid,true);
});
test('fast drag fills intermediate cells; straight tool does not introduce a stair-step',()=>{
 assert.deepEqual(strokeCells({x:2,z:3},{x:7,z:5},true),Array.from({length:6},(_,i)=>({x:i+2,z:3})));
 const p=strokeCells({x:2,z:3},{x:7,z:5});assert.deepEqual(p[0],{x:2,z:3});assert.deepEqual(p.at(-1),{x:7,z:5});
 for(let i=1;i<p.length;i++)assert.equal(Math.abs(p[i].x-p[i-1].x)+Math.abs(p[i].z-p[i-1].z),1);
});
test('restoring default is undoable and never changes the bundled default',()=>{
 const pristine=createDefaultMapDocument(),h=new EditorHistory(pristine),p=sample(h.document);h.begin('paint');paintCell(h.document,p,'path');h.finish();const edited=JSON.stringify(h.document);
 h.replace(createDefaultMapDocument(),'restore');assert.deepEqual(h.document,pristine);h.undo();assert.equal(JSON.stringify(h.document),edited);assert.deepEqual(createDefaultMapDocument(),pristine);
 h.begin('no-op');h.finish();assert.equal(h.future.length,1);h.redo();assert.deepEqual(h.document,pristine);
});
