import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {batchStaticMeshes} from '../src/static-batch.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function triangle(){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,1],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));g.computeVertexNormals();return g;
}

test('Different geometry sizes merge with correct nested world transforms, normals and UVs',()=>{
 const scene=new THREE.Scene(),group=new THREE.Group(),material=new THREE.MeshStandardMaterial();scene.add(group);
 scene.position.set(2,3,1);group.position.set(3,.3,3);group.rotation.set(.2,.5,-.3);group.scale.set(2,.7,1.3);
 const a=new THREE.Mesh(triangle(),material),b=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6),material);group.add(a,b);b.position.x=.7;
 scene.updateMatrixWorld(true);const transform=new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(a.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform);
 const positions=Array.from({length:3},(_,i)=>new THREE.Vector3().fromBufferAttribute(a.geometry.attributes.position,i).applyMatrix4(transform));
 const normals=Array.from({length:3},(_,i)=>new THREE.Vector3().fromBufferAttribute(a.geometry.attributes.normal,i).applyMatrix3(normalMatrix).normalize());
 const result=batchStaticMeshes(scene,{chunkSize:100});assert.equal(result.mergedMeshes,2);assert.equal(result.batches,1);
 const batch=scene.children.find(m=>m.userData.staticBatch);assert.equal(batch.material,material);assert.deepEqual(batch.position.toArray(),[0,0,0]);
 for(let i=0;i<3;i++){
  const p=new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.position,i),n=new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.normal,i);
  positions[i].toArray().forEach((v,j)=>near(v,p.getComponent(j)));normals[i].toArray().forEach((v,j)=>near(v,n.getComponent(j)));near(n.length(),1);
 }
 assert.deepEqual([...batch.geometry.attributes.uv.array.slice(0,6)],[0,0,1,0,0,1]);
 assert.equal(batch.geometry.index.count,3+36);assert.ok(batch.geometry.boundingSphere.radius>0);
 const lateTexture=new THREE.Texture();material.map=lateTexture;assert.equal(batch.material.map,lateTexture,'async material updates stay shared');
});

test('Chunks and shadow/material/attribute layouts remain separate; transparent and instanced meshes stay untouched',()=>{
 const scene=new THREE.Scene(),a=new THREE.MeshStandardMaterial(),b=new THREE.MeshStandardMaterial(),transparent=new THREE.MeshBasicMaterial({transparent:true});
 const add=(x,material=a,cast=false,color=false)=>{const g=new THREE.BoxGeometry(.2,.2,.2);if(color)g.setAttribute('color',new THREE.Uint8BufferAttribute(new Uint8Array(g.attributes.position.count*3).fill(128),3,true));const mesh=new THREE.Mesh(g,material);mesh.position.set(x,1,1);mesh.castShadow=cast;scene.add(mesh);return mesh;};
 for(const x of [1,1.3,8,8.3])add(x);
 add(1,b);add(1.3,b);add(1,a,true);add(1.3,a,true);add(1,a,false,true);add(1.3,a,false,true);
 const glass=add(1,transparent),instances=new THREE.InstancedMesh(new THREE.BoxGeometry(),a,2);scene.add(instances);
 const result=batchStaticMeshes(scene,{chunkSize:7.2});assert.equal(result.batches,5);assert.equal(result.mergedMeshes,10);assert.ok(scene.children.includes(glass));assert.ok(scene.children.includes(instances));
 const batches=scene.children.filter(m=>m.userData.staticBatch);assert.equal(batches.filter(m=>m.castShadow).length,1);
 const colored=batches.find(m=>m.geometry.attributes.color);near(colored.geometry.attributes.color.getX(0),128/255);
 for(const mesh of batches)assert.ok(mesh.geometry.boundingBox.max.x-mesh.geometry.boundingBox.min.x<1,'distant corridors retain independent culling bounds');
});

test('Identical transparent planes retain instancing while different UVs stay independent',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial({transparent:true}),source=new THREE.PlaneGeometry();
 const a=new THREE.Mesh(source,material),b=new THREE.Mesh(source.clone(),material),different=new THREE.Mesh(source.clone(),material);
 a.position.x=1;b.position.x=2;different.geometry.attributes.uv.setX(0,.2);scene.add(a,b,different);
 const result=batchStaticMeshes(scene);assert.equal(result.transparentBatches,1);assert.equal(result.batches,0);assert.ok(scene.children.includes(different));
 const batch=scene.children.find(m=>m.isInstancedMesh);assert.equal(batch.count,2);assert.equal(batch.geometry,source);
 const matrix=new THREE.Matrix4();batch.getMatrixAt(1,matrix);near(matrix.elements[12],2);
});

test('Mirrored geometry retains outward triangle winding and tangent handedness',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial(),geometry=triangle();
 geometry.setAttribute('tangent',new THREE.Float32BufferAttribute([1,0,0,1,1,0,0,1,1,0,0,1],4));
 const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material);a.scale.x=-1;a.position.set(2,1,1);b.position.set(3,1,1);scene.add(a,b);batchStaticMeshes(scene);
 const batch=scene.children.find(m=>m.userData.staticBatch),g=batch.geometry,position=g.attributes.position,index=g.index;
 const p=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(position,index.getX(i)));
 const face=new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0])).normalize(),normal=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,0);
 assert.ok(face.dot(normal)>.999);assert.equal(g.attributes.tangent.getW(0),-1);assert.equal(g.attributes.tangent.getW(3),1);
});

test('Only orphaned source geometry is disposed once; retained shared geometry and materials survive',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial(),orphan=new THREE.BoxGeometry(),shared=new THREE.BoxGeometry();let orphanDisposals=0,sharedDisposals=0,materialDisposals=0;
 orphan.addEventListener('dispose',()=>orphanDisposals++);shared.addEventListener('dispose',()=>sharedDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
 for(const g of [orphan,orphan,shared]){const mesh=new THREE.Mesh(g,material);mesh.position.set(1,1,1);scene.add(mesh);}
 const retained=new THREE.Mesh(shared,new THREE.MeshBasicMaterial({transparent:true}));scene.add(retained);
 const result=batchStaticMeshes(scene);assert.equal(result.disposedGeometries,1);assert.equal(orphanDisposals,1);assert.equal(sharedDisposals,0);assert.equal(materialDisposals,0);assert.ok(scene.children.includes(retained));
});
