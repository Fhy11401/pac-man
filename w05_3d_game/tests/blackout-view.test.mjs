import {POWER_SECTORS} from '../src/power-grid.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {prepareBlackoutWorld,buildBlackoutView} from '../src/blackout-view.js';
import {BLACKOUT_LAYOUT,BLACKOUT_RULES} from '../src/blackout-layout.js';
import {MAP_CENTER,CELL_SIZE,ENTRY_GATE,SAFE_ROOM,gateWall} from '../src/world.js';
import {createBlackoutState} from '../src/blackout-state.js';
import {beveledBoxGeometry} from '../src/joinery.js';

globalThis.document={createElement:()=>{const canvas={width:0,height:0,texts:[]};canvas.getContext=()=>({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),save(){},restore(){},translate(){},rotate(){},scale(){},fillRect(){},strokeRect(){},fillText(text){canvas.texts.push(text);},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},arc(){},stroke(){}});return canvas;}};
const world=(x,z,y=0)=>new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,y,(z-MAP_CENTER.z)*CELL_SIZE);
function fixture(width=BLACKOUT_RULES.corridorWidth,beforePrepare){
  const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black','cloth','glow'].map(key=>[key,new THREE.MeshStandardMaterial()]));
  mat.glow=new THREE.MeshBasicMaterial({color:new THREE.Color(2.55,2.55,2.55),toneMapped:false});
  const v={scene,mat,corridorWidth:width,ceilingHeight:2.7,detailAudit:{},lampPositions:[],assetJobs:[],lights:[],motionTuning:{brightness:.7},renderer:{toneMappingExposure:.672,capabilities:{getMaxAnisotropy:()=>8}},camera:new THREE.PerspectiveCamera(60,16/9,.045,70),hemisphereLight:new THREE.HemisphereLight(),ambientLight:new THREE.AmbientLight(),cameraLight:new THREE.PointLight(),safeRoom:{group:new THREE.Group()},shardMesh:new THREE.Group(),shardGlow:new THREE.Group(),exit:new THREE.Group(),
    mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};
  for(const cell of [{x:22,z:10},{x:(SAFE_ROOM.minX+SAFE_ROOM.maxX)/2,z:(SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2}]){const bulb=v.mesh(new THREE.SphereGeometry(.1,8,4),mat.glow);bulb.position.copy(world(cell.x,cell.z,2.45));v.lampPositions.push(world(cell.x,cell.z,2.4));}
  beforePrepare?.(v);
  v.blackoutPreparation=prepareBlackoutWorld(v,world,CELL_SIZE);v.blackoutView=buildBlackoutView(v,world,CELL_SIZE);
  return v;
}
const game=()=>({phase:'playing',elapsed:0,blackout:createBlackoutState()});
function resources(scene){const meshes=[],geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.isMesh){meshes.push(o);geometries.add(o.geometry);for(const m of [o.material].flat())materials.add(m);}});return{meshes,geometries,materials};}

test('blackout isolates public bulbs and reflections while the emergency room remains powered, then restores legacy rendering',()=>{
  const v=fixture(),b=v.blackoutView,g=game(),publicBulb=v.scene.children.find(o=>o.isMesh),base=v.mat.glow.color.clone();
  assert.notEqual(publicBulb.material,v.mat.glow);
  const publicVersion=publicBulb.material.version;
  b.update(g,1/60);
  assert.equal(b.group.visible,true);assert.equal(v.safeRoom.group.visible,false);assert.equal(v.shardMesh.visible,false);assert.equal(v.exit.visible,false);
  assert.ok(publicBulb.material.color.r<.02);assert.ok(v.mat.glow.color.equals(base));
  assert.equal(b.allowedLamp(v.lampPositions[0],g),false);assert.equal(b.allowedLamp(v.lampPositions.find(p=>p.emergency),g),true);assert.equal(b.allowedLamp(v.lampPositions[1],g),false);
  assert.equal(v.hemisphereLight.intensity,.018);assert.equal(v.ambientLight.intensity,.009);
  g.blackout.powerOn=true;b.update(g,1/60);assert.ok(publicBulb.material.color.equals(base));assert.equal(b.allowedLamp(v.lampPositions[0],g),true);
  assert.equal(publicBulb.material.version,publicVersion,'power is a uniform change, not a material recompilation');
  delete g.blackout;b.update(g,1/60);assert.equal(b.group.visible,false);assert.equal(v.safeRoom.group.visible,true);assert.equal(v.shardMesh.visible,true);assert.equal(v.shardGlow.visible,true);assert.equal(v.exit.visible,true);assert.equal(b.flashlight.visible,true);assert.equal(b.flashlight.intensity,0);assert.equal(v.hemisphereLight.intensity,.19);assert.equal(b.allowedLamp(v.lampPositions[1],g),true);assert.equal(b.allowedLamp(v.lampPositions.find(p=>p.emergency),g),false);
});

test('mechanical gate moves at the collider plane and fully clears eye height, with no frozen child transforms',()=>{
  for(const width of [1.3,1.8,BLACKOUT_RULES.corridorWidth,2.4]){
    const v=fixture(width),b=v.blackoutView,g=game(),wall=gateWall(width);b.update(g,0);v.scene.updateMatrixWorld(true);
    assert.ok(b.gate.position.distanceTo(world(ENTRY_GATE.x,ENTRY_GATE.z))<1e-10);
    const closed=new THREE.Box3().setFromObject(b.leaf),plane=world(wall.x,wall.z).z;
    assert.ok(closed.min.z>=plane-wall.halfZ*CELL_SIZE-1e-6&&closed.max.z<=plane+wall.halfZ*CELL_SIZE+1e-6);
    assert.ok(closed.min.y<.001&&closed.max.y>=b.doorHeight-.001);
    g.blackout.doorProgress=.5;b.update(g,1/60);v.scene.updateMatrixWorld(true);const moving=new THREE.Box3().setFromObject(b.leaf);assert.ok(moving.min.y>closed.min.y+1);
    g.blackout.doorProgress=0;b.update(g,1/60);v.scene.updateMatrixWorld(true);const opened=new THREE.Box3().setFromObject(b.leaf);assert.ok(opened.min.y>2.2);
    assert.equal(b.leaf.matrixAutoUpdate,true);assert.equal(b.gate.matrixAutoUpdate,true);
  }
});

test('unlimited flashlight keeps its wall-shadow cone after night-vision battery depletion and no camera transform is modified',()=>{
  const v=fixture(),b=v.blackoutView,g=game();v.camera.position.copy(world(22,10,1.65));v.camera.rotation.set(.1,.7,0,'YXZ');
  const position=v.camera.position.clone(),rotation=v.camera.quaternion.clone();g.blackout.flashlight=true;g.blackout.battery=0;g.blackout.nightVision=true;b.update(g,1/60);
  assert.equal(b.flashlight.intensity,82);assert.ok(Math.abs(v.renderer.toneMappingExposure-.672)<1e-10);assert.equal(b.flashlight.castShadow,true);assert.equal(b.flashlight.shadow.mapSize.x,1024);assert.equal(b.flashlight.distance,BLACKOUT_RULES.flashlightRange*CELL_SIZE);
  assert.ok(b.flashlight.angle<.4&&b.flashlight.shadow.normalBias<=.012);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation),aim=b.flashlight.target.position.clone().sub(position).normalize();assert.ok(aim.distanceTo(forward)<1e-10);assert.ok(b.flashlight.position.distanceTo(position.clone().add(new THREE.Vector3(-.26,-.30,-.22).applyQuaternion(rotation)))<1e-10);
  assert.ok(position.equals(v.camera.position));assert.ok(rotation.equals(v.camera.quaternion));
  b.flashlight.shadow.needsUpdate=false;b.update(g,1/60);assert.equal(b.flashlight.shadow.needsUpdate,false,'stationary flashlight shadow is retained');
  v.camera.rotation.y+=.05;b.update(g,1/60);assert.equal(b.flashlight.shadow.needsUpdate,true);
  g.blackout.battery=50;b.update(g,1/60);assert.ok(Math.abs(v.renderer.toneMappingExposure-.672*14)<1e-10);
  assert.equal(v.hemisphereLight.intensity,.018);assert.equal(v.ambientLight.intensity,.009);assert.equal(b.flashlight.intensity,82,'night-vision gain does not alter physical lighting');
  v.motionTuning.brightness=.8;b.update(g,1/60);assert.ok(Math.abs(v.renderer.toneMappingExposure-.768*14)<1e-10);
  g.blackout.nightVision=false;b.update(g,1/60);assert.ok(Math.abs(v.renderer.toneMappingExposure-.768)<1e-10);
});

test('repair, phone, battery and hiding state are reversible and do not allocate geometry during updates',()=>{
  const v=fixture(),b=v.blackoutView,g=game(),before=resources(v.scene);v.camera.position.copy(world(18,12,1.65));v.camera.rotation.y=.4;
  const position=v.camera.position.clone(),rotation=v.camera.quaternion.clone();g.blackout.hidden='locker-fixture';g.blackout.circuits[b.panels[0].site.id]=.4;g.blackout.phones[0].remaining=3;g.elapsed=.17;g.blackout.batteries.add(BLACKOUT_LAYOUT.batteries[0].id);g.blackout.flashlight=true;
  b.update(g,1/60);assert.equal(b.hideMask.visible,true);assert.equal(b.flashlight.intensity,0);assert.ok(position.equals(v.camera.position));assert.ok(rotation.equals(v.camera.quaternion));assert.equal(b.batteries[0].group.visible,false);assert.equal(b.batteries[1].group.visible,true);assert.equal(b.progress.scale.x,.4);assert.notEqual(b.phones[0].receiver.rotation.z,0);assert.equal(b.phones[1].receiver.rotation.z,0);
  const slatMaterial=b.hideMask.children[0].material,normalFloor=slatMaterial.emissiveIntensity;g.blackout.nightVision=true;b.update(g,1/60);assert.ok(Math.abs(slatMaterial.emissiveIntensity*14-normalFloor)<1e-12,'the near-eye louver floor is exposure compensated');
  g.blackout.hidden='bed:room-201';b.update(g,1/60);assert.equal(b.hideMask.visible,false,'bed hiding sees the real room without a locker screen overlay');assert.ok(rotation.equals(v.camera.quaternion));g.blackout.hidden='locker-fixture';
  for(let i=0;i<180;i++){g.elapsed+=1/60;b.update(g,1/60);}const after=resources(v.scene);assert.equal(after.meshes.length,before.meshes.length);assert.equal(after.geometries.size,before.geometries.size);assert.equal(after.materials.size,before.materials.size);
  b.update(game(),1/60);assert.equal(b.hideMask.visible,false);assert.equal(b.batteries[0].group.visible,true);assert.equal(b.phones[0].receiver.rotation.z,0);assert.equal(slatMaterial.emissiveIntensity,normalFloor);
});

test('phone flashlight stays inside the corridor when its left offset would cross a nearby wall',()=>{
  const v=fixture(),b=v.blackoutView,g=game();g.blackout.flashlight=true;
  const half=v.corridorWidth/(2*CELL_SIZE);
  v.camera.position.copy(world(18-half+.135,12,1.65));v.camera.rotation.set(0,Math.PI/4,0,'YXZ');const camera=v.camera.position.clone();
  const desired=camera.clone().add(new THREE.Vector3(-.26,-.30,-.22).applyQuaternion(v.camera.quaternion)),wallX=world(18-half,12).x;
  assert.ok(desired.x<wallX);b.update(g,1/60);assert.ok(b.flashlight.position.x>=wallX+.017);assert.ok(v.camera.position.equals(camera));
  const aim=new THREE.Vector3(0,0,-1).applyQuaternion(v.camera.quaternion).multiplyScalar(8).add(camera);assert.ok(b.flashlight.target.position.distanceTo(aim)<1e-10);
});

test('installation geometry has finite bounds/UVs and a fixed budget independent of the full maze',()=>{
  const v=fixture(),b=v.blackoutView,{meshes,geometries}=resources(b.group);let triangles=0;
  for(const geometry of geometries){geometry.computeBoundingBox();geometry.computeBoundingSphere();assert.ok(Number.isFinite(geometry.boundingSphere.radius));for(const axis of ['x','y','z'])assert.ok(Number.isFinite(geometry.boundingBox.min[axis])&&Number.isFinite(geometry.boundingBox.max[axis]));for(const attr of Object.values(geometry.attributes))for(const value of attr.array)assert.ok(Number.isFinite(value));}
  for(const mesh of meshes)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
  assert.ok(triangles<100000,`new installation triangles ${triangles}`);assert.ok(meshes.length<110,`new installation meshes ${meshes.length}`);
  assert.equal(b.phones.length,2);assert.equal(b.lockers.length,BLACKOUT_LAYOUT.lockers.length);assert.equal(b.batteries.length,2);assert.equal(v.detailAudit.blackout.extraShadowLights,1);
  assert.ok(v.detailAudit.blackout.maxPropProjection<.12*CELL_SIZE,'props remain within the smallest supported body-to-wall clearance');
});

test('collection-only landmark captions are replaced before batching, with the original retained for legacy play',()=>{
  let original;
  const v=fixture(1.8,v=>{original=new THREE.Group();original.name='map-exit';original.position.copy(world(ENTRY_GATE.x+.375,ENTRY_GATE.outside.z));original.rotation.y=-Math.PI/2;original.userData.landmark={kind:'exit',cell:ENTRY_GATE.outside};v.scene.add(original);const plate=v.mesh(new THREE.PlaneGeometry(.94,.47),new THREE.MeshStandardMaterial(),original);plate.position.y=1.88;}),b=v.blackoutView,g=game();
  assert.equal(b.preparation.signs.length,1);assert.equal(original.parent,b.preparation.legacy);
  const text=resources(b.fixed).materials.values().flatMap(m=>m.map?.image.texts??[]).toArray();assert.ok(text.includes('监控室'));assert.ok(text.includes('SECURITY  /  恢复供电后返回'));assert.ok(!text.some(t=>t.includes('集齐')));
  b.update(g,0);assert.equal(b.preparation.legacy.visible,false);delete g.blackout;b.update(g,0);assert.equal(b.preparation.legacy.visible,true);
});

test('intro lighting cycles mains, complete outage and backup without changing repaired power or recompiling materials',()=>{
  const v=fixture(),b=v.blackoutView,g=game(),publicBulb=v.scene.children.find(o=>o.isMesh),baseline=publicBulb.material.color.clone();
  const materials=[...resources(v.scene).materials],versions=materials.map(m=>m.version),emergency=v.lampPositions.find(p=>p.emergency),hall=v.lampPositions[0];
  for(let cycle=0;cycle<3;cycle++){
    g.blackout.introLighting='mains';b.update(g,0);assert.equal(g.blackout.powerOn,false);assert.ok(publicBulb.material.color.equals(baseline));assert.equal(v.hemisphereLight.intensity,.19);assert.equal(b.allowedLamp(hall,g),true);assert.equal(b.allowedLamp(emergency,g),true);assert.equal(v.lightClock,1);
    g.blackout.introLighting='blackout';g.blackout.flashlight=true;b.update(g,0);assert.equal(v.hemisphereLight.intensity,.003);assert.equal(v.ambientLight.intensity,0);assert.equal(v.cameraLight.intensity,0);assert.equal(b.flashlight.intensity,0);assert.equal(publicBulb.material.color.r+publicBulb.material.color.g+publicBulb.material.color.b,0);assert.ok(v.lampPositions.every(p=>!b.allowedLamp(p,g)));assert.equal(v.lightClock,1);
    b.group.traverse(o=>{if(o.material?.isMeshBasicMaterial)assert.equal(o.material.color.r+o.material.color.g+o.material.color.b,0);if(o.material?.emissiveIntensity!==undefined)assert.equal(o.material.emissiveIntensity,0);});
    g.blackout.flashlight=false;g.blackout.introLighting='backup';b.update(g,0);assert.equal(b.allowedLamp(emergency,g),true);assert.equal(b.allowedLamp(hall,g),false);assert.equal(v.cameraLight.intensity,.035);assert.equal(v.ambientLight.intensity,.009);assert.equal(v.lightClock,1);
    g.blackout.introLighting=null;b.update(g,0);assert.equal(g.blackout.powerOn,false);assert.equal(b.allowedLamp(hall,g),false);assert.equal(b.allowedLamp(emergency,g),true);
  }
  materials.forEach((material,index)=>assert.equal(material.version,versions[index]));
  g.blackout.powerOn=true;b.update(g,0);assert.equal(b.allowedLamp(hall,g),true);assert.ok(publicBulb.material.color.equals(baseline));
});

test('sector bulbs sharing a source material switch independently without allocating lights',()=>{
 const bulbs=[],points=[POWER_SECTORS[0],POWER_SECTORS[3]];
 const v=fixture(2,v=>{for(const p of points){const bulb=v.mesh(new THREE.SphereGeometry(.1,8,4),v.mat.glow);bulb.position.copy(world(p.x,p.z+1,2.45));bulbs.push(bulb);}}),g=game();
 assert.notEqual(bulbs[0].material,bulbs[1].material);v.blackoutView.update(g,0);
 assert(bulbs.every(b=>b.material.color.r<.02));g.blackout.circuits[points[0].id]=1;v.blackoutView.update(g,0);
 assert(bulbs[0].material.color.r>1);assert(bulbs[1].material.color.r<.02);
 assert(v.blackoutView.allowedLamp(world(points[0].x,points[0].z+1,2.4),g));assert.equal(v.blackoutView.allowedLamp(world(points[1].x,points[1].z+1,2.4),g),false);
 assert.equal(v.detailAudit.blackout.extraShadowLights,1);
});

test('television feeds are staggered, use the story camera only for its screen and go dark in the outage',()=>{
 const v=fixture(),room=v.blackoutView.controlRoom,g=game(),draws=[];g.player={x:SAFE_ROOM.minX,z:SAFE_ROOM.minZ};
 v.security={active:false};v.lampHalos={visible:true};let target=null;
 Object.assign(v.renderer,{shadowMap:{autoUpdate:true},getRenderTarget:()=>target,setRenderTarget:t=>target=t,render:(scene,camera)=>draws.push({target,camera})});
 v.openingScene={camera:new THREE.PerspectiveCamera()};g.blackout.introShot='monitor';
 for(let i=0;i<30;i++){const count=draws.length;room.updateFeeds(g,1/60);assert(draws.length-count<=2,'at most one story and one background feed per frame');}
 assert.equal(room.feeds.length,9);assert(room.feeds.every(f=>f.ready));
 assert(draws.some(d=>d.target===room.focusFeed.target&&d.camera===v.openingScene.camera));
 assert(draws.filter(d=>d.target!==room.focusFeed.target).every(d=>d.camera!==v.openingScene.camera));
 assert.equal(room.focusFeed.target.width,1920);assert.equal(room.focusFeed.target.height,1080);
 g.blackout.introTime=5.5;for(let i=0;i<6;i++){const n=draws.length;room.updateFeeds(g,1/144);assert.equal(draws.length-n,1);assert.equal(draws.at(-1).target,room.focusFeed.target,'close-up updates every display frame, without background feed passes');}
 const fullCount=draws.length;g.blackout.introTime=6.7;room.updateFeeds(g,1/60);assert.equal(draws.length,fullCount,'full-screen film pass needs no duplicate monitor render');
 const count=draws.length;g.blackout.introLighting='blackout';room.updateFeeds(g,.1);assert.equal(room.screenGroup.visible,false);assert.equal(draws.length,count);
 g.blackout.introLighting='backup';g.blackout.introShot='return';room.updateFeeds(g,.1);assert.equal(room.screenGroup.visible,true);assert.equal(target,null);assert.equal(v.renderer.shadowMap.autoUpdate,true);assert.equal(v.lampHalos.visible,true);
});

test('the paper rests entirely above its separate table surface without intersection',()=>{
 const v=fixture(),note=v.blackoutView.controlRoom.note,p=new THREE.Vector3();
 for(let i=0;i<note.geometry.attributes.position.count;i++){
  p.fromBufferAttribute(note.geometry.attributes.position,i).applyMatrix4(note.matrix);
  assert(p.y>.76+.045/2,'every curled paper vertex clears the tabletop');
  assert(Math.abs(p.x)<.68/2&&Math.abs(p.z)<.60/2,'paper remains on its own table');
 }
});
