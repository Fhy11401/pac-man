import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {attendantMaterials,attendantHead,createAttendant} from '../src/enemy-model.js';

function dispose(root,materials){
  const geometries=new Set(),textures=new Set();root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);});
  for(const geometry of geometries)geometry.dispose();
  for(const material of Object.values(materials)){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
  for(const texture of textures)texture.dispose();
}

function audit(root){
  let meshes=0,triangles=0;root.updateMatrixWorld(true);
  root.traverse(object=>{
    if(!object.isMesh)return;meshes++;const geometry=object.geometry;
    triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;
    for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value),'finite geometry/UV/normal');
    geometry.computeBoundingSphere();assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  });
  return{meshes,triangles,bounds:new THREE.Box3().setFromObject(root)};
}

test('mask color and physical microdetail use separate color spaces and shared texture ownership',()=>{
  const m=attendantMaterials(),mask=m.porcelain;
  assert.equal(mask.map.colorSpace,THREE.SRGBColorSpace);
  assert.equal(mask.bumpMap.colorSpace,THREE.NoColorSpace);
  assert.notEqual(mask.map,mask.bumpMap);
  assert.equal(mask.bumpMap,mask.roughnessMap);
  assert.notEqual(m.leather.bumpMap,mask.bumpMap,'garments retain a handle when the mask fallback is replaced');
  assert.equal(m.leather.bumpMap.source,mask.bumpMap.source,'the separate handles share source pixels');
  assert.equal(mask.bumpMap.userData.hotelAssetOwned,true);
  assert.equal(m.leather.bumpMap.userData.hotelAssetOwned,false);
  assert.equal(m.coat.bumpMap,m.shirt.bumpMap);
  const roughness=mask.roughnessMap.image.data;let min=255,max=0;
  for(let i=1;i<roughness.length;i+=4){min=Math.min(min,roughness[i]);max=Math.max(max,roughness[i]);}
  assert.ok(min>140&&max<240&&max-min>20,'restrained but nonuniform roughness');
  const textures=new Set(Object.values(m).flatMap(material=>Object.values(material).filter(value=>value?.isTexture)));
  assert.equal(textures.size,4,'bounded shared texture handles');
  const sources=new Set([...textures].map(texture=>texture.source));assert.equal(sources.size,3);
  assert.ok([...sources].reduce((sum,source)=>sum+source.data.data.byteLength,0)<=1.3*1024*1024);
  dispose(new THREE.Group(),m);
});

test('the standalone jumpscare head stays within its established fit and mesh budget',t=>{
  const m=attendantMaterials(),head=attendantHead(m),result=audit(head);
  assert.equal(head.name,'attendant-head');assert.ok(result.meshes<=9);assert.ok(result.triangles<19000);
  const {min,max}=result.bounds;assert.ok(min.x>-.23&&max.x<.23&&min.y>-.27&&max.y<.29&&min.z>-.27&&max.z<.25);
  t.diagnostic(JSON.stringify({meshes:result.meshes,triangles:result.triangles}));dispose(head,m);
});

test('the full enemy preserves animated joints, independent poses and the existing rendering budget',t=>{
  // Only the unrelated contact-shadow canvas needs a DOM surface in this CPU test.
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  const m=attendantMaterials();let model;
  try{model=createAttendant(m);}finally{globalThis.document=oldDocument;}
  const {root,body,limbs}=model,result=audit(root);
  assert.equal(body.parent,root);assert.equal(limbs.length,4);
  assert.equal(limbs.filter(limb=>limb.leg).length,2);assert.equal(limbs.filter(limb=>!limb.leg&&limb.elbow?.parent===limb.node).length,2);
  assert.equal(body.getObjectByName('attendant-head')?.parent,body);
  assert.ok(result.meshes<=34);assert.ok(result.triangles<=28000);
  const start=root.getObjectByName('attendant-head').getWorldPosition(new THREE.Vector3());
  limbs[0].node.rotation.x=.45;limbs[0].elbow.rotation.x=-.6;limbs.find(limb=>limb.leg).node.rotation.x=-.35;
  root.updateMatrixWorld(true);const end=root.getObjectByName('attendant-head').getWorldPosition(new THREE.Vector3());
  assert.ok(start.distanceTo(end)<1e-12,'limb animation leaves the jumpscare head anchor stable');
  t.diagnostic(JSON.stringify({meshes:result.meshes,triangles:result.triangles}));dispose(root,m);
});
