import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {buildSafeRoom,splitBoardGeometry,ENTRY_BREAK_SECONDS} from '../src/safe-room-view.js';
import {MAP_CENTER,CELL_SIZE,ENTRY_GATE,SAFE_ROOM} from '../src/world.js';
import {beveledBoxGeometry} from '../src/joinery.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
globalThis.Image=class{set src(value){queueMicrotask(()=>this.onerror?.());}};
const world=(x,z,y=0)=>new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,y,(z-MAP_CENTER.z)*CELL_SIZE);
function fixture(width=1.5,height=2.7){
  const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black','cloth','glow'].map(key=>[key,new THREE.MeshStandardMaterial()]));
  return{scene,mat,corridorWidth:width,ceilingHeight:height,detailAudit:{},assetJobs:[],lampPositions:[],mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};
}

test('entry boards separate at the actual gate and fully clear the opening after the break interval',async()=>{
  const v=fixture(),room=buildSafeRoom(v,world,CELL_SIZE),gatePosition=world(ENTRY_GATE.x,ENTRY_GATE.z);
  assert.ok(room.gate.position.distanceTo(gatePosition)<1e-8);assert.equal(room.fragments.length,10);
  room.update({entryOpened:false,entryBreakTime:0},0);assert.equal(room.barrier.visible,true);assert.equal(room.chips.visible,false);
  for(const part of room.fragments){assert.equal(part.object.matrixAutoUpdate,true);assert.ok(part.object.position.equals(part.home));}
  room.update({entryOpened:true,entryBreakTime:.3},.3);assert.equal(room.barrier.visible,true);assert.equal(room.chips.visible,true);
  for(const part of room.fragments){assert.notEqual(part.object.rotation.y,0);assert.ok(part.object.position.y<part.home.y);assert.equal(part.mesh.castShadow,false);}
  room.update({entryOpened:true,entryBreakTime:ENTRY_BREAK_SECONDS},.5);assert.equal(room.barrier.visible,false);assert.equal(room.chips.visible,false);
  room.update({entryOpened:false,entryBreakTime:0},0);assert.equal(room.barrier.visible,true);
  for(const part of room.fragments){assert.ok(part.object.position.equals(part.home));assert.equal(part.object.rotation.y,0);assert.equal(part.mesh.castShadow,true);}
  await Promise.all(v.assetJobs);
});

test('room fixtures leave the entrance axis clear and fit all supported widths and heights',async()=>{
  for(const width of [1.3,1.5,2.4])for(const height of [2.5,3.4]){
    const v=fixture(width,height),room=buildSafeRoom(v,world,CELL_SIZE);v.scene.updateMatrixWorld(true);
    const fixed=room.group.getObjectByName('safe-room-fixed-details'),bounds=new THREE.Box3().setFromObject(fixed);
    assert.ok(bounds.min.y>=-1e-7&&bounds.max.y<height);
    const wallX=world(SAFE_ROOM.minX-width/(2*CELL_SIZE),0).x,consoleLimit=wallX+.25,entryX=world(ENTRY_GATE.x,0).x;
    assert.ok(entryX-consoleLimit>CELL_SIZE);
    assert.ok(v.detailAudit.safeRoom.consoleProjection<.12*CELL_SIZE);
    let lights=0;room.group.traverse(object=>{if(object.isLight)lights++;});assert.equal(lights,0);
    assert.equal(v.lampPositions.length,1);const lamp=v.lampPositions[0],gateZ=world(ENTRY_GATE.x,ENTRY_GATE.z).z;
    assert.ok(lamp.z>gateZ&&lamp.aimZ<0);
    const fraction=(gateZ-lamp.z)/lamp.aimZ,heightAtBoards=lamp.y*(1-fraction);
    assert.ok(heightAtBoards>1.1&&heightAtBoards<1.6,'beam crosses the front of the boards around chest height');
    await Promise.all(v.assetJobs);
  }
});

test('split planks retain finite physical UVs and their combined width',()=>{
  for(const length of [1.43,1.63,2.53]){
    const pieces=splitBoardGeometry(length,.23),bounds=new THREE.Box3();
    for(const piece of pieces){const {geometry,pivot}=piece;const p=geometry.attributes.position,uv=geometry.attributes.uv;
      for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));assert.ok(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));}
      bounds.union(geometry.boundingBox.clone().translate(new THREE.Vector3(pivot,0,0)));
    }
    assert.ok(Math.abs(bounds.max.x-bounds.min.x-length-.002)<1e-5);
  }
});
