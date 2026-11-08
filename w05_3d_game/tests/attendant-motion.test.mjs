import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {AttendantMotion,poseAttendant,sampleAttendantGait,strideLength,smoothAttendantHeading,trackAttendantGaze} from '../src/attendant-motion.js';
import {attendantMaterials,createAttendant,cloneAttendant} from '../src/enemy-model.js';

function rig(){const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};try{return createAttendant(attendantMaterials());}finally{globalThis.document=old;}}
function transforms(root){const result=[];root.traverse(n=>result.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));return result;}

test('intro reuses enemy surfaces while keeping every animated joint independent',()=>{
  const game=rig(),opening=cloneAttendant(game),before=transforms(game.root);
  const a=[],b=[];game.root.traverse(n=>{if(n.isMesh)a.push(n);});opening.root.traverse(n=>{if(n.isMesh)b.push(n);});
  assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){assert.equal(a[i].geometry,b[i].geometry);assert.equal(a[i].material,b[i].material);}
  for(const limb of opening.limbs.filter(l=>l.leg)){assert.equal(limb.knee.parent,limb.node);assert.equal(limb.ankle.parent,limb.knee);assert.notEqual(limb.node,game.limbs.find(l=>l.leg&&l.side===limb.side).node);}
  poseAttendant(opening,sampleAttendantGait(2.1,1.3),-.8);assert.deepEqual(transforms(game.root),before);
});

test('articulated walk and chase reach their foot targets without penetrating the floor',()=>{
  const model=rig(),point=new THREE.Vector3();
  for(const speed of [0,1.3,3.44,4.92,6])for(let step=0;step<128;step++){
    const pose=sampleAttendantGait(step*Math.PI/64,speed,speed?1:0);poseAttendant(model,pose);model.root.updateMatrixWorld(true);
    for(const leg of model.limbs.filter(l=>l.leg)){
      const foot=pose.feet.find(f=>f.side===leg.side);leg.ankle.getWorldPosition(point);model.root.worldToLocal(point);
      assert.ok(Math.abs(point.z-foot.z)<1e-7);assert.ok(Math.abs(point.y-foot.ankleHeight)<1e-7);
      assert.ok(foot.knee>=0&&foot.knee<2.6);
      leg.ankle.traverse(mesh=>{if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);assert.ok(point.y>=-.002,'shoe remains above floor');}});
    }
  }
});

test('planted feet move opposite the body instead of swinging like pendulums',()=>{
  for(const speed of [1.3,3.44,4.92]){
    const phase=.30,dt=.001,a=sampleAttendantGait(phase,speed),b=sampleAttendantGait(phase+speed*dt*Math.PI*2/strideLength(speed),speed);
    const fa=a.feet[0],fb=b.feet[0];assert.ok(fa.planted&&fb.planted);assert.ok(Math.abs((fb.z-fa.z)+speed*dt)<1e-7);
  }
});

test('pose is continuous around phase wrap; motion pauses and settles at rest',()=>{
  for(const speed of [1.3,4.92]){
    const a=sampleAttendantGait(Math.PI*2-1e-7,speed),b=sampleAttendantGait(1e-7,speed);
    for(let i=0;i<2;i++)for(const key of ['hip','knee','ankle','z','ankleHeight'])assert.ok(Math.abs(a.feet[i][key]-b.feet[i][key])<1e-5);
  }
  const motion=new AttendantMotion();for(let i=0;i<120;i++)motion.update(4.92,1/60);const before=motion.update(4.92,0);
  assert.deepEqual(motion.update(4.92,1,false),before);for(let i=0;i<120;i++)motion.update(0,1/60);
  const idle=motion.update(0,0);assert.ok(idle.weight<1e-7);assert.ok(idle.feet.every(f=>f.lift<1e-7));
  const a=new AttendantMotion(),b=new AttendantMotion();for(let i=0;i<120;i++)a.update(3.44,1/60);for(let i=0;i<60;i++)b.update(3.44,1/30);
  assert.ok(Math.abs(a.phase-b.phase)<1e-10);assert.ok(Math.abs(a.weight-b.weight)<1e-10);
});

test('ankle velocity remains continuous across heel release and touchdown',()=>{
  for(const speed of [1.3,3.44,4.92])for(const cycle of [0,.56-.22*Math.max(0,Math.min(1,(speed-1.2)/3.5))]){
    const phase=cycle*Math.PI*2,h=1e-5,left=sampleAttendantGait(phase-h,speed).feet[0],mid=sampleAttendantGait(phase,speed).feet[0],right=sampleAttendantGait(phase+h,speed).feet[0];
    for(const key of ['hip','knee','ankle'])assert.ok(Math.abs((mid[key]-left[key])/h-(right[key]-mid[key])/h)<.01,`${speed} ${cycle} ${key}`);
  }
});

test('heading eases through the shortest turn with frame-rate independent momentum',()=>{
  let a={angle:Math.PI-.05,velocity:0},b={...a};const target=-Math.PI+.4;
  const first=smoothAttendantHeading(a.angle,target,0,1/60);assert.ok(first.angle>a.angle&&first.angle-a.angle<.02);
  for(let i=0;i<60;i++)a=smoothAttendantHeading(a.angle,target,a.velocity,1/60);
  for(let i=0;i<30;i++)b=smoothAttendantHeading(b.angle,target,b.velocity,1/30);
  assert.ok(Math.abs(a.angle-b.angle)<1e-10);assert.ok(Math.abs(Math.atan2(Math.sin(a.angle-target),Math.cos(a.angle-target)))<.001);
});


test('larger silhouette fits the narrowest door, anchors the neck and blends pursuit smoothly',()=>{
 const model=rig(),motion=new AttendantMotion();let previous=0;
 for(let i=0;i<300;i++){
  const pose=motion.update(i<60?0:3.5,1/60,true,i>=120?1:0);poseAttendant(model,pose);model.root.updateMatrixWorld(true);
  assert(Math.abs(pose.alert-previous)<.1);previous=pose.alert;
  const neck=new THREE.Vector3(0,-.18,-.02).applyMatrix4(model.head.matrix);assert(neck.distanceTo(new THREE.Vector3(0,1.46,.006))<1e-9);
  const box=new THREE.Box3().setFromObject(model.root);assert(box.max.y<2.17,'door header clearance');assert(box.max.x-box.min.x<1.2,'narrow door clearance');
 }
 const frozen=motion.update(3,0);assert.deepEqual(motion.update(3,1,false,0),frozen);assert(frozen.alert>.99);
 const chaseArm=model.limbs.find(l=>!l.leg&&l.side===1);assert(chaseArm.node.rotation.x<-.45,'pursuit reaches toward the player');
});


test('head tracks the player around the body with smooth turns and a connected neck',()=>{
 const model=rig(),target=new THREE.Vector3(),forward=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,0]){
  target.set(Math.sin(angle)*4,1.65,Math.cos(angle)*4);const bodyBefore=model.root.quaternion.clone();
  for(let i=0;i<100;i++){poseAttendant(model,sampleAttendantGait(i*.025,1,1,i/60));const before=model.gaze?.clone();trackAttendantGaze(model,target,1/60);if(before)assert(before.angleTo(model.gaze)<.4,'no instantaneous turn');}
  model.root.updateMatrixWorld(true);model.head.getWorldPosition(position);model.head.getWorldQuaternion(rotation);forward.set(0,0,1).applyQuaternion(rotation);
  assert(forward.dot(target.clone().sub(position).normalize())>.99,'face points toward the player');assert(model.root.quaternion.equals(bodyBefore),'gaze never turns navigation root');
  const neck=new THREE.Vector3(0,-.18,-.02).applyMatrix4(model.head.matrix);assert(neck.distanceTo(new THREE.Vector3(0,1.46,.006))<1e-9);
  assert(new THREE.Box3().setFromObject(model.root).max.y<2.17,'turned head clears the door');
 }
 const frozen=model.gaze.clone();trackAttendantGaze(model,new THREE.Vector3(10,0,0),1,false);assert(model.gaze.equals(frozen));
});


test('non-pursuit keeps the gait pose and leaving chase smoothly releases player gaze',()=>{
 const model=rig(),pose=sampleAttendantGait(1,1,1,1),target=new THREE.Vector3(4,1.65,0);
 poseAttendant(model,pose);const neutral=model.head.quaternion.clone();trackAttendantGaze(model,null,1/60);
 assert(model.head.quaternion.equals(neutral));assert.equal(model.gaze,undefined);
 for(let i=0;i<120;i++){poseAttendant(model,pose);trackAttendantGaze(model,target,1/60);}
 const tracking=model.head.quaternion.clone();poseAttendant(model,pose);trackAttendantGaze(model,null,1/60);
 assert(model.head.quaternion.angleTo(tracking)<.25,'release does not snap');assert(model.head.quaternion.angleTo(neutral)>.5);
 for(let i=0;i<120;i++){poseAttendant(model,pose);trackAttendantGaze(model,null,1/60);}
 assert.equal(model.gaze,null);assert(model.head.quaternion.angleTo(neutral)<.00001);
});
