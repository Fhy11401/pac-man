import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildLandmarkPlan,regionFor} from '../src/map-landmarks.js';
import {START,EXIT,isInSafeRoom,isOpen,edgeIsOpen,pathTo} from '../src/world.js';

test('landmarks mark the actual spawn, actual exit and all three map regions',()=>{
 const plan=buildLandmarkPlan(),at=kind=>plan.filter(p=>p.kind===kind);
 for(const [kind,expected] of [['reception',START],['exit',EXIT]]){assert.equal(at(kind).length,1);assert.equal(at(kind)[0].x,expected.x);assert.equal(at(kind)[0].z,expected.z);}
 assert.deepEqual(at('region').map(p=>regionFor(p.x)).sort(),[0,1,2]);
 assert.ok(at('guide').length<=4);
 const approach=pathTo(START,EXIT);
 if(approach.slice(0,-1).every(isInSafeRoom))assert.equal(at('guide').length,0,'an exit immediately outside reception needs no intermediate route arrow');
});

test('an imported layout with a distant exit retains visible, correctly routed guide arrows',()=>{
 const doc=JSON.parse(readFileSync(new URL('../assets/maps/maplab-before-editor.json',import.meta.url),'utf8'));
 const source=`globalThis.window={location:{search:'?mapDraft=landmark-fixture'},localStorage:{getItem(){return JSON.stringify([{id:'landmark-fixture',createdAt:Date.now(),document:${JSON.stringify(doc)}}]);}}};
 const {buildLandmarkPlan}=await import('./src/map-landmarks.js'),w=await import('./src/world.js');
 const guides=buildLandmarkPlan().filter(p=>p.kind==='guide');
 console.log(JSON.stringify(guides.map(p=>({wall:!w.isOpen(p.x+p.face.x,p.z+p.face.z),open:w.edgeIsOpen(p,p.next),closer:w.pathTo(p.next,w.EXIT).length===w.pathTo(p,w.EXIT).length-1,parallel:Math.abs((p.next.x-p.x)*p.face.x+(p.next.z-p.z)*p.face.z)<1e-9,correctGlyph:p.glyph===((p.next.x-p.x)*Math.cos(p.face.a)-(p.next.z-p.z)*Math.sin(p.face.a)>0?'→':'←')}))));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(child.status,0,child.stderr);
 const guides=JSON.parse(child.stdout);assert.ok(guides.length>0&&guides.length<=4);
 for(const guide of guides)assert.ok(Object.values(guide).every(Boolean));
});

test('every sign mounts on a solid exterior wall and every arrow follows a valid shortest exit path',()=>{
 const plan=buildLandmarkPlan();for(const p of plan){
  assert.equal(isOpen(p.x,p.z),true);const wall={x:p.x+p.face.x,z:p.z+p.face.z};assert.equal(isOpen(wall.x,wall.z),false);assert.equal(edgeIsOpen(p,wall),false);
  if(p.kind!=='guide')continue;assert.equal(edgeIsOpen(p,p.next),true);assert.equal(pathTo(p.next,EXIT).length,pathTo(p,EXIT).length-1);
  const dx=p.next.x-p.x,dz=p.next.z-p.z;assert.ok(Math.abs(dx*p.face.x+dz*p.face.z)<1e-9);
  const right=dx*Math.cos(p.face.a)-dz*Math.sin(p.face.a);assert.equal(p.glyph,right>0?'→':'←');
 }
});
