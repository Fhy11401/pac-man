import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {applyHotelAsset} from '../src/hotel-assets.js';

const requests=[];
globalThis.Image=class {set src(value){this.url=value;requests.push(value);queueMicrotask(()=>this.onload?.());}};

test('PBR color and data maps have distinct color spaces but repeat and rotate together',async()=>{
 const material=new THREE.MeshStandardMaterial(),result=await applyHotelAsset(material,'wood',{repeat:[2.65,1.1]});
 assert.equal(result.loaded,true);assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(material.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(material.roughnessMap.colorSpace,THREE.NoColorSpace);
 for(const key of ['map','normalMap','roughnessMap']){assert.deepEqual(material[key].repeat.toArray(),[2.65,1.1]);assert.equal(material[key].rotation,Math.PI/2);assert.ok(material[key].name.includes('Wood051'));}
 assert.equal(material.bumpMap,null);assert.deepEqual(material.normalScale.toArray(),[.28,.28]);
});

test('Shared source images decode once while each material retains independent UV transforms',async()=>{
 const a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial(),before=requests.length;
 await Promise.all([applyHotelAsset(a,'plaster',{repeat:[1.6,.5]}),applyHotelAsset(b,'plaster',{repeat:[18,18]})]);
 assert.equal(requests.length-before,3);
 for(const key of ['map','normalMap','roughnessMap']){assert.notEqual(a[key],b[key]);assert.equal(a[key].source,b[key].source);}
 assert.deepEqual(a.normalMap.repeat.toArray(),[1.6,.5]);assert.deepEqual(b.normalMap.repeat.toArray(),[18,18]);
});

test('Paper print and micro-weave use independent scales and never turn color into normals',async()=>{
 const paper=new THREE.MeshStandardMaterial(),cloth=new THREE.MeshStandardMaterial();
 await Promise.all([applyHotelAsset(paper,'paper',{repeat:[1.65,1.35],bump:.1}),applyHotelAsset(cloth,'fabric')]);
 assert.equal(paper.map.name,'reference/damask-reference-v281.png');assert.equal(paper.normalMap.name,'pbr/Fabric030_1K-JPG_NormalGL.jpg');
 assert.notEqual(paper.map.source,paper.normalMap.source);assert.equal(paper.normalMap.source,cloth.normalMap.source);assert.equal(paper.roughnessMap.source,cloth.roughnessMap.source);
 assert.deepEqual(paper.normalMap.repeat.toArray(),[16.5,13.5]);assert.equal(paper.bumpMap,null);assert.equal(cloth.map,null);
});

test('Late image resolution cannot attach textures to a disposed scene material',async()=>{
 const material=new THREE.MeshStandardMaterial(),job=applyHotelAsset(material,'wood');material.dispose();
 const result=await job;assert.equal(result.loaded,false);assert.equal(result.disposed,true);assert.equal(material.map,null);assert.equal(material.normalMap,null);assert.equal(material.roughnessMap,null);
});

test('Reference wood keeps supplemental normal grain aligned when rotating structural members',async()=>{
 const upright=new THREE.MeshStandardMaterial(),crossbar=new THREE.MeshStandardMaterial();
 await Promise.all([applyHotelAsset(upright,'referenceWood'),applyHotelAsset(crossbar,'referenceWood',{rotation:Math.PI/2})]);
 assert.equal(upright.map.rotation,0);assert.equal(upright.normalMap.rotation,Math.PI/2);
 assert.equal(crossbar.map.rotation,Math.PI/2);assert.equal(crossbar.normalMap.rotation,Math.PI);
 assert.equal(crossbar.normalMap.source,upright.normalMap.source);assert.equal(crossbar.map.source,upright.map.source);
});

test('Art atlas crop coordinates remain unchanged by the expanded PBR loader',async()=>{
 const material=new THREE.MeshStandardMaterial();await applyHotelAsset(material,'art',{repeat:[1/3-.002,1],offset:[1/3+.001,0]});
 material.map.updateMatrix();const uv=new THREE.Vector2(0,0).applyMatrix3(material.map.matrix);
 assert.ok(Math.abs(uv.x-(1/3+.001))<1e-12);assert.equal(uv.y,0);assert.deepEqual(material.map.center.toArray(),[0,0]);
});

test('Replacing maps releases owned handles once without disposing unrelated shared fallback maps',async()=>{
 const material=new THREE.MeshStandardMaterial(),fallbackColor=new THREE.Texture(),sharedNoise=new THREE.Texture();let colorDisposed=0,noiseDisposed=0;
 fallbackColor.addEventListener('dispose',()=>colorDisposed++);sharedNoise.addEventListener('dispose',()=>noiseDisposed++);material.map=fallbackColor;material.roughnessMap=sharedNoise;material.bumpMap=sharedNoise;
 await applyHotelAsset(material,'plaster');assert.equal(colorDisposed,1);assert.equal(noiseDisposed,0);
 const oldMap=material.map,oldNormal=material.normalMap;let oldDisposals=0;oldMap.addEventListener('dispose',()=>oldDisposals++);oldNormal.addEventListener('dispose',()=>oldDisposals++);
 await applyHotelAsset(material,'plaster');assert.equal(oldDisposals,2);assert.notEqual(material.map,oldMap);assert.equal(material.map.source,oldMap.source);
});
