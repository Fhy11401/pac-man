import test from 'node:test';
import assert from 'node:assert/strict';
import {attendantMaterials,attendantHead} from '../src/enemy-model.js';
import {scarePerformance,scareTargetHeight,setScareMouth} from '../src/scare-performance.js';
test('impact uses a bounded deterministic burst and reduced-motion mode removes shake',()=>{
 assert.equal(scarePerformance(-.01).mouth,0);assert.equal(scarePerformance(-.01).backdrop,0);assert(scarePerformance(.08).mouth>.9);
 for(let t=0;t<2;t+=1/144){const a=scarePerformance(t);assert.deepEqual(a,scarePerformance(t));for(const x of Object.values(a))assert(Number.isFinite(x));assert(Math.abs(a.x)<.018&&Math.abs(a.roll)<.12);assert(a.mouth<=1);const r=scarePerformance(t,{reduced:true});for(const key of ['x','y','pitch','yaw','roll'])assert.equal(r[key],0);assert.equal(r.zoom,1);}
 for(const aspect of [.75,4/3,16/9,21/9])assert(scareTargetHeight(aspect)>=2.8&&scareTargetHeight(aspect)<=3.8);
});
test('mouth morph opens the lower face while keeping the eyes stable and neutral geometry intact',()=>{
 const m=attendantMaterials(),neutral=attendantHead(m),original=neutral.children.map(o=>o.geometry),head=attendantHead(m,{scare:true});let displacement=0;
 for(let k=0;k<head.children.length;k++){const o=head.children[k],a=o.geometry.attributes.position,b=o.geometry.morphAttributes.position[0];assert.notEqual(o.geometry,original[k]);
 for(let i=0;i<a.count;i++){const n=o.geometry.morphAttributes.normal[0];for(const value of [n.getX(i),n.getY(i),n.getZ(i)])assert(Number.isFinite(value));if(a.getY(i)>.03)assert(Math.abs(n.getY(i)-o.geometry.attributes.normal.getY(i))<.001,'unmoved surfaces preserve their smooth normals');assert(Number.isFinite(b.getY(i)));assert.equal(a.getY(i),original[k].attributes.position.getY(i));if(a.getY(i)>.03)assert(Math.abs(a.getY(i)-b.getY(i))<.001,'eyes and brow stay stable');displacement=Math.max(displacement,a.getY(i)-b.getY(i));}}
 assert(displacement>.09,'mouth opens substantially');setScareMouth(head,1);assert(head.children.every(o=>o.morphTargetInfluences[0]===1));setScareMouth(head,0);assert(head.children.every(o=>o.morphTargetInfluences[0]===0));
});
