import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {buildSecurityRooms,roomCollisionWalls} from '../src/security-rooms.js';
import {securityRoomFurniture} from '../src/security-room-layout.js';
import {BLACKOUT_LAYOUT,BLACKOUT_RULES} from '../src/blackout-layout.js';
import {MAP_CENTER,CELL_SIZE} from '../src/world.js';
import {beveledBoxGeometry} from '../src/joinery.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
globalThis.Image=class{set src(value){queueMicrotask(()=>this.onerror?.());}};
const world=(x,z,y=0)=>new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,y,(z-MAP_CENTER.z)*CELL_SIZE);
function fixture(){const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black'].map(key=>[key,new THREE.MeshStandardMaterial()]));return{scene,mat,corridorWidth:BLACKOUT_RULES.corridorWidth,ceilingHeight:2.7,assetJobs:[],lampPositions:[],detailAudit:{},lights:[],mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};}
const state=progress=>({blackout:{powerOn:false,roomDoors:Object.fromEntries(BLACKOUT_LAYOUT.rooms.map(room=>[room.id,{progress}]))}});

test('real bedroom beds and desks match physical footprints and preserve door-to-foot aisles',async()=>{
  const v=fixture(),rooms=buildSecurityRooms(v,world,CELL_SIZE);v.scene.updateMatrixWorld(true);
  const walls=roomCollisionWalls(v.corridorWidth);assert.equal(walls.length,4);assert.equal(rooms.beds.length,2);assert.equal(rooms.desks.length,2);
  for(const item of [...rooms.beds,...rooms.desks]){
    // Original child meshes are merged into fixed; inspect their captured real
    // geometry bounds, never an emptied source group's infinite/empty bounds.
    const bounds=item.geometryBounds,aabb=walls.find(w=>w.id===item.footprint.id),center=world(aabb.x,aabb.z);assert.ok(!bounds.isEmpty()&&bounds.min.toArray().every(Number.isFinite)&&bounds.max.toArray().every(Number.isFinite));
    assert.ok(bounds.min.x>=center.x-aabb.halfX*CELL_SIZE-1e-5&&bounds.max.x<=center.x+aabb.halfX*CELL_SIZE+1e-5,item.footprint.id+' x fits collider');
    assert.ok(bounds.min.z>=center.z-aabb.halfZ*CELL_SIZE-1e-5&&bounds.max.z<=center.z+aabb.halfZ*CELL_SIZE+1e-5,item.footprint.id+' z fits collider');
  }
  for(const {room,bed} of securityRoomFurniture(v.corridorWidth)){
    const half=v.corridorWidth/(2*CELL_SIZE),left=(bed.x-bed.halfX-(room.bounds.minX-half))*CELL_SIZE,right=(room.bounds.maxX+half-bed.x-bed.halfX)*CELL_SIZE;assert.ok(left>=1.2&&right>=1.2);
    for(const x of [room.bounds.minX,room.bounds.maxX])assert.ok(Math.abs(x-bed.x)-bed.halfX>.15,'side grid centres fit the normal body radius');
  }
  await Promise.all(v.assetJobs);
});

test('double doors use the core progress exactly, clear the central passage when open, and remain dynamic after batching',async()=>{
  const v=fixture(),rooms=buildSecurityRooms(v,world,CELL_SIZE);
  rooms.update(state(1));assert.equal(rooms.group.visible,true);
  for(const door of rooms.doors){const spec=BLACKOUT_LAYOUT.rooms.find(room=>room.id===door.id);assert.ok(door.gate.position.distanceTo(world(spec.door.x,spec.door.z))<1e-10);for(const leaf of door.leaves)assert.equal(Math.abs(leaf.object.rotation.y),0);}
  rooms.update(state(.5));for(const door of rooms.doors)for(const leaf of door.leaves)assert.ok(Math.abs(Math.abs(leaf.object.rotation.y)-Math.PI/4)<1e-10);
  rooms.update(state(0));v.scene.updateMatrixWorld(true);
  for(const door of rooms.doors)for(const leaf of door.leaves){assert.equal(leaf.object.matrixAutoUpdate,true);assert.ok(Math.abs(Math.abs(leaf.object.rotation.y)-Math.PI/2)<1e-10);const box=new THREE.Box3().setFromObject(leaf.object),centre=door.gate.position,clearHalf=v.corridorWidth/2-.20;assert.ok(box.max.z<centre.z-clearHalf||box.min.z>centre.z+clearHalf,'open leaf stays at the passage edge');}
  rooms.update({});assert.equal(rooms.group.visible,false);await Promise.all(v.assetJobs);
});

test('bedroom lighting is off during blackout, restores with power, and resource counts do not grow while doors move',async()=>{
  const v=fixture(),rooms=buildSecurityRooms(v,world,CELL_SIZE),meshes=[],geometries=new Set();rooms.group.traverse(o=>{if(o.isMesh){meshes.push(o);geometries.add(o.geometry);}});
  for(const geometry of geometries){geometry.computeBoundingSphere();assert.ok(Number.isFinite(geometry.boundingSphere.radius));for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));}
  assert.equal(v.lampPositions.filter(p=>p.guestRoom).length,2);assert.ok(v.lampPositions.every(p=>p.blackoutOnly));
  const bulbs=meshes.filter(mesh=>mesh.material.isMeshBasicMaterial),original=bulbs.map(mesh=>mesh.material.color.clone());rooms.update(state(1));for(const bulb of bulbs)assert.ok(bulb.material.color.r<.03);
  const intro=state(1);intro.blackout.introLighting='mains';rooms.update(intro);bulbs.forEach((bulb,i)=>assert.ok(bulb.material.color.equals(original[i])));assert.equal(intro.blackout.powerOn,false);
  intro.blackout.introLighting='blackout';rooms.update(intro);bulbs.forEach(bulb=>assert.equal(bulb.material.color.r+bulb.material.color.g+bulb.material.color.b,0));
  intro.blackout.introLighting='backup';rooms.update(intro);bulbs.forEach(bulb=>assert.ok(bulb.material.color.r<.03));
  const lit=state(0);lit.blackout.powerOn=true;rooms.update(lit);bulbs.forEach((bulb,i)=>assert.ok(bulb.material.color.equals(original[i])));
  for(let i=0;i<180;i++)rooms.update(state(i%60/59));let count=0;rooms.group.traverse(o=>{if(o.isMesh)count++;});assert.equal(count,meshes.length);assert.ok(count<65);await Promise.all(v.assetJobs);
});
