import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {SecurityCoverage,SECURITY_COVERAGE_RANGE} from '../src/security-coverage.js';
import {MAP,MAP_CENTER,CELL_SIZE,ENTRY_GATE,MAP_DOCUMENT} from '../src/world.js';
import {BLACKOUT_LAYOUT as L,BLACKOUT_RULES as R,SECURITY_CAMERA_LAYOUT as CHANNELS} from '../src/blackout-layout.js';
import {securityCameraPoses} from '../src/security-cameras.js';
import {hasMazeSight} from '../src/visibility.js';

const world=p=>new THREE.Vector3((p.x-MAP_CENTER.x)*CELL_SIZE,p.y??.035,(p.z-MAP_CENTER.z)*CELL_SIZE);
const options=()=>({tiles:MAP,center:MAP_CENTER,unit:CELL_SIZE,entryGate:ENTRY_GATE,rooms:L.rooms,barriers:MAP_DOCUMENT.barriers});
const corridor=['##########','##########','#........#','##########','##########'];
const channel={id:'test',position:{x:1,z:2,y:2.1},target:{x:8,z:2,y:1},fov:78};
const room={id:'test-room',door:{x:4.5,z:2,axis:'x',inside:{x:5,z:2},outside:{x:4,z:2}}};
const sceneCamera=(coverage,c)=>{const camera=new THREE.PerspectiveCamera(c.fov,16/9,.045,70),p=coverage.world(c.position,c.position.y),t=coverage.world(c.target,c.target.y);camera.position.set(p.x,p.y,p.z);camera.lookAt(t.x,t.y,t.z);camera.updateMatrixWorld(true);return camera;};

test('selected-camera floor patches agree with real Three projection and do not cross walls',()=>{
  const width=R.corridorWidth,coverage=new SecurityCoverage(options()),poses=securityCameraPoses(width,CELL_SIZE,CHANNELS);let visible=0;
  CHANNELS.forEach((config,index)=>{
    const actual=new THREE.PerspectiveCamera(config.fov,16/9,.045,70);actual.position.copy(poses[index].position);actual.lookAt(poses[index].target);actual.updateMatrixWorld(true);
    const result=coverage.get(config,{corridorWidth:width});assert.equal(result.approximate,true);assert.equal(result.range,40);assert.ok(result.path.length>0);assert.match(result.path,/^[MHVZ0-9. \-]+$/);
    for(const p of result.samples){const position=world(p),ndc=position.clone().project(actual);assert.ok(position.distanceTo(actual.position)<=SECURITY_COVERAGE_RANGE+1e-7);for(const axis of ['x','y','z'])assert.ok(Math.abs(ndc[axis])<=1+1e-7,'real camera projects every returned floor sample');assert.equal(hasMazeSight(config.position,p,width),true);visible++;}
    // Filling does not spread the rectangular raster across the expanded walls.
    for(const rect of result.rectangles)for(const x of [rect.x0+.00001,rect.x1-.00001])for(const z of [rect.z0+.00001,rect.z1-.00001])assert.equal(hasMazeSight(config.position,{x,z},width),true);
  });assert.ok(visible>1500);assert.equal(coverage.computations,CHANNELS.length);
});

test('a whole dividing wall and permanent partition remain opaque even for a wide lens',()=>{
  const tiles=['##########','#...#....#','#...#....#','#...#....#','##########'],c={...channel,position:{x:1,z:2,y:2.2},target:{x:8,z:2,y:.8},fov:115};
  const coverage=new SecurityCoverage({tiles}),result=coverage.get(c);assert.ok(result.samples.length>0);assert.ok(result.samples.every(p=>p.x<3.5));assert.ok(result.rectangles.every(p=>p.x1<=3.375+1e-8));
  const partitioned=new SecurityCoverage({tiles:corridor,barriers:[{a:{x:4,z:2},b:{x:5,z:2}}]}),blocked=partitioned.get(channel);assert.ok(blocked.samples.length>0);assert.ok(blocked.samples.every(p=>p.x<4.31));
  const narrow=coverage.get(c,{corridorWidth:1.3});assert.notEqual(narrow,result);assert.equal(coverage.staticComputations,2);
});

test('guest-room coverage follows the real two rotating door leaves rather than a stale closed flag',()=>{
  const width=R.corridorWidth,coverage=new SecurityCoverage({tiles:corridor,rooms:[room]}),counts=[];
  for(const p of [1,.5,0]){
    const result=coverage.get(channel,{corridorWidth:width,roomDoors:{[room.id]:{progress:p,closed:true}}});counts.push(result.samples.filter(s=>s.x>4.5).length);
    const gate=new THREE.Group(),point=coverage.world(room.door,0);gate.position.set(point.x,0,point.z);gate.rotation.y=Math.PI/2;
    for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.x=side*width/2;pivot.rotation.y=side*(1-p)*Math.PI/2;gate.add(pivot);const mesh=new THREE.Mesh(new THREE.BoxGeometry(width/2-.006,2.24,.05),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(-side*width/4,1.12,0);pivot.add(mesh);}gate.updateMatrixWorld(true);
    const camera=sceneCamera(coverage,channel);
    for(const sample of result.samples){const q=coverage.world(sample),to=new THREE.Vector3(q.x,q.y,q.z),ray=new THREE.Raycaster(camera.position,to.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(to));assert.equal(ray.intersectObject(gate,true).length,0,'rendered door leaf occludes no advertised point');}
    gate.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  assert.equal(counts[0],0);assert.ok(counts[1]>0);assert.ok(counts[2]>counts[1]);
});

test('the mechanical door blocks the ground when shut and reveals the gap as its panel rises',()=>{
  const width=R.corridorWidth,coverage=new SecurityCoverage({tiles:corridor,entryGate:{...room.door}}),closed=coverage.get(channel,{corridorWidth:width}),half=coverage.get(channel,{corridorWidth:width,doorProgress:.5}),open=coverage.get(channel,{corridorWidth:width,doorProgress:0});
  assert.equal(closed.samples.filter(p=>p.x>4.5).length,0);assert.ok(half.samples.some(p=>p.x>4.5));assert.ok(open.samples.length>=half.samples.length);
  for(const [result,p] of [[closed,1],[half,.5],[open,0]]){
    const door=new THREE.Mesh(new THREE.BoxGeometry(width+.012,2.28,.05),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),centre=coverage.world(room.door,0);door.position.set(centre.x,1.14+(1-p)*2.335,centre.z);door.rotation.y=Math.PI/2;door.updateMatrixWorld(true);const camera=sceneCamera(coverage,channel);
    for(const sample of result.samples){const q=coverage.world(sample),target=new THREE.Vector3(q.x,q.y,q.z),ray=new THREE.Raycaster(camera.position,target.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(target));assert.equal(ray.intersectObject(door).length,0);}
    door.geometry.dispose();door.material.dispose();
  }
});

test('idle calls reuse one result; door changes reuse static visibility and never read actor state',()=>{
  const coverage=new SecurityCoverage({tiles:corridor,rooms:[room],maxCache:4}),state={corridorWidth:1.8,doorProgress:1,roomDoors:{[room.id]:{progress:1,hold:0}}};
  Object.defineProperties(state,{player:{get(){throw new Error('player must not be read');}},enemy:{get(){throw new Error('enemy must not be read');}}});
  const first=coverage.get(channel,state);for(let i=0;i<600;i++){state.roomDoors[room.id].hold=i;assert.equal(coverage.get(channel,state),first);}assert.equal(coverage.computations,1);assert.equal(coverage.staticComputations,1);
  for(const p of [.99,.98,.97,.96]){state.roomDoors[room.id].progress=p;coverage.get(channel,state);}assert.equal(coverage.computations,2,'one partial-door bucket');assert.equal(coverage.staticComputations,1);
  for(const p of [.875,.75,.625,.5,.375,.25,.125,0]){state.roomDoors[room.id].progress=p;coverage.get(channel,state);}assert.equal(coverage.staticComputations,1,'door updates never trace the full map again');assert.ok(coverage.cache.size<=4);
  for(let i=0;i<32;i++)coverage.get({...channel,id:`camera-${i}`},state);assert.ok(coverage.cache.size<=4&&coverage.staticViews.size<=4);assert.equal(coverage.layouts.size,1);
  coverage.clear();assert.equal(coverage.cache.size+coverage.staticViews.size+coverage.layouts.size,0);
});

test('static input is snapshotted, results are immutable and invalid geometry is rejected',()=>{
  const tiles=[...corridor],coverage=new SecurityCoverage({tiles}),before=JSON.stringify(channel);tiles[2]='#........#'.replaceAll('.','#');const result=coverage.get(channel);assert.ok(result.samples.length>0);assert.equal(JSON.stringify(channel),before);
  assert.throws(()=>result.samples.push({x:0,z:0}),TypeError);assert.throws(()=>new SecurityCoverage({tiles:['##','#']}),TypeError);assert.throws(()=>coverage.get(channel,{corridorWidth:0}),RangeError);assert.throws(()=>coverage.get({...channel,target:channel.position}),RangeError);assert.throws(()=>coverage.get({...channel,position:{x:0,y:NaN,z:0}}),TypeError);
});
