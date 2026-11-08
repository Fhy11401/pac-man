import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {beveledBoxGeometry} from '../src/joinery.js';
import {timberUV,paneledDoor} from '../src/hotel-joinery.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
function fixture(height){
 const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black'].map(k=>[k,new THREE.MeshStandardMaterial()]));
 return {scene,mat,ceilingHeight:height,detailAudit:{ajarDoors:0},mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};
}

test('door leaf, frame and hardware stay inside the existing wall clearance at every supported room height',()=>{
 for(const ceiling of [2.5,2.7,3.4])for(const ajar of [false,true]){
  const v=fixture(ceiling),parent=new THREE.Group();v.scene.add(parent);paneledDoor(v,parent,201,{ajar});
  const bounds=new THREE.Box3().setFromObject(parent);
  assert.ok(bounds.min.y>=-1e-7);assert.ok(bounds.max.y<ceiling-.09);assert.ok(bounds.max.z+.036<=.20);
  assert.ok(bounds.min.x>=-.59&&bounds.max.x<=.59);assert.equal(v.detailAudit.ajarDoors,Number(ajar));
 }
});

test('long timber members preserve physical grain scale and nondegenerate UVs on both faces and end grain',()=>{
 for(const [width,height,depth,axis] of [[1.8,.045,.09,'x'],[.085,2.27,.13,'y'],[.14,.18,.035,'y']]){
  const g=timberUV(beveledBoxGeometry(width,height,depth),axis),uv=g.attributes.uv;
  for(let i=0;i<g.index.count;i+=3){
   const ids=[0,1,2].map(j=>g.index.getX(i+j)),q=ids.map(id=>[uv.getX(id),uv.getY(id)]);
   const area=(q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0]);
   assert.ok(Number.isFinite(area)&&Math.abs(area)>1e-11,'each bevel/end face has a finite UV basis');
  }
 }
 const g=timberUV(beveledBoxGeometry(1.8,.045,.09),'x'),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,points=[];
 for(let i=0;i<p.count;i++)if(n.getZ(i)>.999)points.push([p.getX(i),uv.getY(i)]);
 points.sort((a,b)=>a[0]-b[0]);assert.ok(Math.abs((points.at(-1)[1]-points[0][1])-(points.at(-1)[0]-points[0][0])/1.9)<1e-6);
});
