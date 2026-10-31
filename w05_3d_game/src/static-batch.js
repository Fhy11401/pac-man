import * as THREE from '../vendor/three.module.js';

const supportedAttributes=new Set(['position','normal','tangent','uv','uv1','uv2','uv3','color']);

function canMerge(mesh){
  if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.children.length||Array.isArray(mesh.material))return false;
  const geometry=mesh.geometry,position=geometry?.attributes.position;
  if(!position||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity||Object.keys(geometry.morphAttributes).length)return false;
  if(mesh.customDepthMaterial||mesh.customDistanceMaterial)return false;
  if((geometry.index?.count??position.count)%3)return false;
  return Object.entries(geometry.attributes).every(([name,attribute])=>supportedAttributes.has(name)&&attribute.count===position.count&&!attribute.isInstancedBufferAttribute);
}

function identicalGeometry(a,b){
  if(a===b)return true;
  const names=Object.keys(a.attributes);if(names.length!==Object.keys(b.attributes).length)return false;
  for(const name of names){
    const x=a.attributes[name],y=b.attributes[name];if(!y||x.count!==y.count||x.itemSize!==y.itemSize)return false;
    for(let i=0;i<x.count;i++)for(let c=0;c<x.itemSize;c++)if(x.getComponent(i,c)!==y.getComponent(i,c))return false;
  }
  if(Boolean(a.index)!==Boolean(b.index)||a.index?.count!==b.index?.count)return false;
  if(a.index)for(let i=0;i<a.index.count;i++)if(a.index.getX(i)!==b.index.getX(i))return false;
  return true;
}

function mergeGeometry(items,names){
  const vertexCount=items.reduce((sum,{mesh})=>sum+mesh.geometry.attributes.position.count,0);
  const indexCount=items.reduce((sum,{mesh})=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count),0);
  const geometry=new THREE.BufferGeometry(),arrays={};
  for(const name of names){
    const size=items[0].mesh.geometry.attributes[name].itemSize;
    arrays[name]=new Float32Array(vertexCount*size);
    geometry.setAttribute(name,new THREE.BufferAttribute(arrays[name],size));
  }
  const indices=vertexCount>65535?new Uint32Array(indexCount):new Uint16Array(indexCount);
  const normalMatrix=new THREE.Matrix3(),vector=new THREE.Vector3();let vertexOffset=0,indexOffset=0;
  for(const {mesh,matrix} of items){
    const source=mesh.geometry,count=source.attributes.position.count,mirrored=matrix.determinant()<0;
    normalMatrix.getNormalMatrix(matrix);
    for(const name of names){
      const attribute=source.attributes[name],size=attribute.itemSize,output=arrays[name];
      for(let i=0;i<count;i++){
        const offset=(vertexOffset+i)*size;
        if(name==='position'||name==='normal'||name==='tangent'){
          vector.fromBufferAttribute(attribute,i);
          if(name==='position')vector.applyMatrix4(matrix);
          else if(name==='normal')vector.applyMatrix3(normalMatrix).normalize();
          else vector.transformDirection(matrix);
          output[offset]=vector.x;output[offset+1]=vector.y;output[offset+2]=vector.z;
          if(size===4)output[offset+3]=attribute.getW(i)*(name==='tangent'&&mirrored?-1:1);
        }else{
          // getComponent preserves normalized integer colors and interleaved UVs.
          for(let c=0;c<size;c++)output[offset+c]=attribute.getComponent(i,c);
        }
      }
    }
    const length=source.index?.count??count;
    for(let i=0;i<length;i+=3){
      const a=source.index?source.index.getX(i):i,b=source.index?source.index.getX(i+1):i+1,c=source.index?source.index.getX(i+2):i+2;
      indices[indexOffset++]=a+vertexOffset;indices[indexOffset++]=(mirrored?c:b)+vertexOffset;indices[indexOffset++]=(mirrored?b:c)+vertexOffset;
    }
    vertexOffset+=count;
  }
  geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

// Call once after constructing owned, static decoration, before adding actors or collectibles.
// Coarse spatial batches cut draw calls while bounding the size of future, larger levels.
// The current 36 m hotel fits in one block, matching its former global instance bounds.
// Finer blocks cost more calls than they save here. Materials stay shared during async loading.
export function batchStaticMeshes(scene,{chunkSize=36,disposeSources=true}={}){
  if(!Number.isFinite(chunkSize)||chunkSize<=0)throw new RangeError('chunkSize must be positive');
  scene.updateMatrixWorld(true);
  const inverseScene=scene.matrixWorld.clone().invert(),center=new THREE.Vector3(),buckets=new Map(),transparentBuckets=new Map();
  let sourceMeshes=0,mergedMeshes=0,disposedGeometries=0,transparentBatches=0;
  scene.traverseVisible(mesh=>{
    if(!canMerge(mesh))return;sourceMeshes++;
    const geometry=mesh.geometry,matrix=new THREE.Matrix4().multiplyMatrices(inverseScene,mesh.matrixWorld);
    if(!geometry.boundingBox)geometry.computeBoundingBox();geometry.boundingBox.getCenter(center).applyMatrix4(matrix);
    const chunk=[Math.floor(center.x/chunkSize+.5),Math.floor(center.z/chunkSize+.5)],names=Object.keys(geometry.attributes).sort();
    const layout=names.map(name=>name+':'+geometry.attributes[name].itemSize).join(',');
    if(mesh.material.transparent){
      // Keep the existing cheap instancing of identical lamp washes/contact planes.
      // Do not concatenate different transparent shapes into a sorting-dependent surface.
      const key=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.layers.mask,mesh.renderOrder,layout,geometry.attributes.position.count].join('|');
      if(!transparentBuckets.has(key))transparentBuckets.set(key,[]);
      const groups=transparentBuckets.get(key);let group=groups.find(group=>identicalGeometry(group[0].mesh.geometry,geometry));
      if(!group){group=[];groups.push(group);}group.push({mesh,matrix});return;
    }
    const key=[chunk.join('/'),mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.layers.mask,mesh.renderOrder,layout].join('|');
    if(!buckets.has(key))buckets.set(key,{items:[],names,chunk});buckets.get(key).items.push({mesh,matrix});
  });
  const sourceGeometries=new Set(),batches=[];
  for(const {items,names,chunk} of buckets.values()){
    if(items.length<2)continue;
    const first=items[0].mesh,batch=new THREE.Mesh(mergeGeometry(items,names),first.material);
    batch.name='hotel-static-'+chunk.join('-');batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
    batch.layers.mask=first.layers.mask;batch.renderOrder=first.renderOrder;
    batch.userData.staticBatch={sourceMeshes:items.length,chunk};
    for(const {mesh} of items){sourceGeometries.add(mesh.geometry);mesh.removeFromParent();mergedMeshes++;}
    scene.add(batch);batches.push(batch);
  }
  for(const groups of transparentBuckets.values())for(const items of groups){
    if(items.length<2)continue;const first=items[0].mesh,batch=new THREE.InstancedMesh(first.geometry,first.material,items.length);
    batch.name='hotel-static-transparent';batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
    batch.layers.mask=first.layers.mask;batch.renderOrder=first.renderOrder;
    items.forEach(({mesh,matrix},i)=>{batch.setMatrixAt(i,matrix);sourceGeometries.add(mesh.geometry);mesh.removeFromParent();mergedMeshes++;});
    batch.computeBoundingBox();batch.computeBoundingSphere();scene.add(batch);transparentBatches++;
  }
  if(disposeSources){
    const retained=new Set();scene.traverse(object=>{if(object.geometry)retained.add(object.geometry);});
    for(const geometry of sourceGeometries)if(!retained.has(geometry)){geometry.dispose();disposedGeometries++;}
  }
  return {sourceMeshes,mergedMeshes,batches:batches.length,transparentBatches,disposedGeometries};
}
