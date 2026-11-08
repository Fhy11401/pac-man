import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {buildHalls,createHallCeiling} from '../src/hall-view.js';
import {hallAt,hallDimensions,hallFurniture,hallFurnitureWalls} from '../src/hall-layout.js';
import {BLACKOUT_LAYOUT} from '../src/blackout-layout.js';
import {MAP_CENTER,MAP_WIDTH,MAP_HEIGHT,CELL_SIZE,isOpen,RULES} from '../src/world.js';
import {beveledBoxGeometry} from '../src/joinery.js';
import {batchStaticMeshes} from '../src/static-batch.js';
import {slideMove} from '../src/movement.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
globalThis.Image=class{set src(value){queueMicrotask(()=>this.onerror?.());}};
const halls=BLACKOUT_LAYOUT.halls,world=(x,z,y=0)=>new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,y,(z-MAP_CENTER.z)*CELL_SIZE);
function fixture(width=1.8){const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black','trim'].map(k=>[k,new THREE.MeshStandardMaterial()]));return{scene,mat,corridorWidth:width,ceilingHeight:2.7,assetJobs:[],lampPositions:[],detailAudit:{},mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};}
function release(scene){const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});for(const m of ms){for(const t of Object.values(m))if(t?.isTexture)ts.add(t);m.dispose();}gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());}

test('raised ceilings cover the complete map once, close their steps and face the occupied volume',()=>{
  const geometry=createHallCeiling(halls,{width:MAP_WIDTH,height:MAP_HEIGHT,unit:CELL_SIZE,corridorWidth:1.8,ceilingHeight:2.7,center:MAP_CENTER}),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(const attribute of Object.values(geometry.attributes))assert.ok([...attribute.array].every(Number.isFinite));
  const area=geometry.userData.partitions.reduce((sum,r)=>sum+(r.x1-r.x0)*(r.z1-r.z0),0);assert.ok(Math.abs(area-MAP_WIDTH*MAP_HEIGHT)<1e-7);
  for(let z=0;z<MAP_HEIGHT;z++)for(let x=0;x<MAP_WIDTH;x++){
    const matches=geometry.userData.partitions.filter(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1);assert.equal(matches.length,1);
    const hall=hallAt(halls,x,z);assert.equal(matches[0].y,hall?hallDimensions(hall).height:2.7);
  }
  for(let i=0;i<geometry.index.count;i+=3){const a=geometry.index.getX(i),b=geometry.index.getX(i+1),c=geometry.index.getX(i+2),ab=new THREE.Vector3().fromBufferAttribute(p,b).sub(new THREE.Vector3().fromBufferAttribute(p,a)),ac=new THREE.Vector3().fromBufferAttribute(p,c).sub(new THREE.Vector3().fromBufferAttribute(p,a));assert.ok(ab.cross(ac).normalize().dot(new THREE.Vector3().fromBufferAttribute(n,a))>.999);const du=uv.getX(b)-uv.getX(a),dv=uv.getY(b)-uv.getY(a),eu=uv.getX(c)-uv.getX(a),ev=uv.getY(c)-uv.getY(a);assert.ok(Math.abs(du*ev-dv*eu)>1e-12,'texture basis stays nondegenerate on vertical risers');}
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),ray=new THREE.Raycaster();mesh.updateMatrixWorld(true);
  for(const hall of halls){const d=hallDimensions(hall),centre=world(d.x,d.z,2.8);for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){ray.set(centre,direction);const hits=ray.intersectObject(mesh);assert.ok(hits.length,'raised wall closes every side above the corridor ceiling');}ray.set(world(d.x,d.z,1.65),new THREE.Vector3(0,1,0));const hit=ray.intersectObject(mesh);assert.equal(hit.length,1);assert.ok(Math.abs(hit[0].point.y-d.height)<1e-5);}
  geometry.dispose();mesh.material.dispose();
});

test('hall furniture follows edited bounds, avoids openings and leaves the central circulation clear',()=>{
  for(const width of [1.3,1.8,2.4]){
    const plan=hallFurniture(halls,width,CELL_SIZE,isOpen),walls=hallFurnitureWalls(halls,width,CELL_SIZE,isOpen);assert.ok(plan.length>=10);assert.equal(plan.length,walls.length);
    for(const hall of halls){const b=hall.bounds,c={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};assert.ok(walls.every(w=>Math.abs(w.x-c.x)>w.halfX+1||Math.abs(w.z-c.z)>w.halfZ+1),'central two-grid wide area remains empty');
      const move=slideMove({x:b.minX,z:c.z},{x:b.maxX-b.minX,z:0},RULES.enemyRadius,width,walls);assert.ok(Math.hypot(move.position.x-b.maxX,move.position.z-c.z)<1e-5,'uninterrupted central crossing');}
    for(const item of plan){const p={x:Math.round(item.x+item.wall.x*.5),z:Math.round(item.z+item.wall.z*.5)};assert.equal(isOpen(p.x,p.z),false,'furniture backs onto actual solid wall');assert.equal(item.blocksSight,item.kind==='pilaster');}
  }
  const source=[{id:'new-lounge',type:'lounge',bounds:{minX:4,maxX:10,minZ:5,maxZ:9}}],dx=7,dz=12,moved=structuredClone(source);for(const b of [moved[0].bounds]){b.minX+=dx;b.maxX+=dx;b.minZ+=dz;b.maxZ+=dz;}
  const a=hallFurniture(source,1.8,CELL_SIZE,()=>false),b=hallFurniture(moved,1.8,CELL_SIZE,()=>false);assert.equal(a.length,b.length);a.forEach((item,i)=>{assert.equal(b[i].x,item.x+dx);assert.equal(b[i].z,item.z+dz);});assert.deepEqual(hallFurniture(source,1.8,CELL_SIZE,()=>true),[],'fully open borders never receive furniture');
});

test('hall artwork fits the real collision footprints and batches into a bounded static budget',async()=>{
  for(const width of [1.3,1.8,2.4]){
    const v=fixture(width),view=buildHalls(v,world,CELL_SIZE,halls,isOpen),walls=hallFurnitureWalls(halls,width,CELL_SIZE,isOpen);assert.equal(view.furniture.length,walls.length);
    for(const {spec,bounds} of view.furniture){const collider=walls.find(w=>w.id===spec.id),centre=world(collider.x,collider.z);assert.ok(!bounds.isEmpty());assert.ok(bounds.min.x>=centre.x-collider.halfX*CELL_SIZE-1e-5&&bounds.max.x<=centre.x+collider.halfX*CELL_SIZE+1e-5,spec.id+' x');assert.ok(bounds.min.z>=centre.z-collider.halfZ*CELL_SIZE-1e-5&&bounds.max.z<=centre.z+collider.halfZ*CELL_SIZE+1e-5,spec.id+' z');}
    assert.ok(view.lamps.length<=30);assert.ok(view.lamps.every(l=>l.hall&&Number.isFinite(l.strength)));let lightCount=0;v.scene.traverse(o=>{if(o.isLight)lightCount++;});assert.equal(lightCount,0,'all fixtures use the existing ten pooled lights');
    const audit=batchStaticMeshes(v.scene);assert.ok(audit.sourceMeshes>200&&audit.mergedMeshes>audit.sourceMeshes*.75);let meshes=0,triangles=0;v.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(Number.isFinite(o.geometry.boundingSphere?.radius??1));}});assert.ok(meshes<100,`draws ${meshes}`);assert.ok(triangles<50000,`triangles ${triangles}`);await Promise.all(v.assetJobs);release(v.scene);
  }
});
