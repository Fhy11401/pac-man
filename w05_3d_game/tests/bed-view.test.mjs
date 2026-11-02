import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {getBedHideSpots,bedTransitionPose,bedViewHeight,BED_EYE_HEIGHT,BED_UNDERSIDE} from '../src/bed-layout.js';
import {buildSecurityRooms,doorBashPose} from '../src/security-rooms.js';
import {roomCollisionWalls} from '../src/security-room-layout.js';
import {WorldView} from '../src/view.js';
import {PlayerMotion} from '../src/player-motion.js';
import {attendantMaterials,createAttendant} from '../src/enemy-model.js';
import {MAP_CENTER,CELL_SIZE} from '../src/world.js';
import {DEFAULT_TUNING} from '../src/tuning.js';
import {beveledBoxGeometry} from '../src/joinery.js';
import {slideMove} from '../src/movement.js';
import {BLACKOUT_RULES as R} from '../src/blackout-layout.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){},createRadialGradient:()=>({addColorStop(){}})})})};
globalThis.Image=class{set src(value){queueMicrotask(()=>this.onerror?.());}};
const world=(p,y=0)=>new THREE.Vector3((p.x-MAP_CENTER.x)*CELL_SIZE,y,(p.z-MAP_CENTER.z)*CELL_SIZE);
function fixture(){const scene=new THREE.Scene(),mat=Object.fromEntries(['wood','brass','black'].map(k=>[k,new THREE.MeshStandardMaterial()]));return{scene,mat,corridorWidth:R.corridorWidth,ceilingHeight:2.7,assetJobs:[],lampPositions:[],detailAudit:{},lights:[],mesh(g,m,parent=scene){const mesh=new THREE.Mesh(g,m);parent.add(mesh);return mesh;},box(w,h,d,m,x,y,z,parent=scene){const mesh=this.mesh(beveledBoxGeometry(w,h,d),m,parent);mesh.position.set(x,y,z);return mesh;}};}
function dispose(scene){const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of [o.material].flat())if(m)ms.add(m);});for(const m of ms){for(const t of Object.values(m))if(t?.isTexture)ts.add(t);m.dispose();}gs.forEach(g=>g.dispose());ts.forEach(t=>t.dispose());}

test('entry lowers outside the mattress, exit rises outside, and all ordinary bodies remain blocked by the bed',()=>{
  for(const width of [1.3,1.8,R.corridorWidth,2.4])for(const spot of getBedHideSpots(width)){
    const walls=roomCollisionWalls(width),bed=walls.find(w=>w.id===spot.bedId);
    for(const approach of spot.approaches){
      for(const radius of [.12,.15,.19]){const move=slideMove(approach,{x:spot.target.x-approach.x,z:spot.target.z-approach.z},radius,width,walls);assert.ok(Math.hypot(move.position.x-spot.target.x,move.position.z-spot.target.z)>.25);}
      for(const entering of [true,false]){const from=entering?approach:spot.target,to=entering?spot.target:approach;
        for(let step=0;step<=110;step++){const pose=bedTransitionPose(from,to,step/110,entering);const inside=Math.abs(pose.position.x-bed.x)<bed.halfX&&Math.abs(pose.position.z-bed.z)<bed.halfZ;assert.ok(pose.eyeHeight>=BED_EYE_HEIGHT-1e-8&&pose.eyeHeight<=1.65+1e-8);if(inside)assert.ok(pose.eyeHeight<BED_UNDERSIDE,'head cannot traverse mattress or side rails');}
        assert.deepEqual(bedTransitionPose(from,to,0,entering).position,from);assert.deepEqual(bedTransitionPose(from,to,1,entering).position,to);
      }
    }
  }
});

test('the actual batched bed has clear low sight lines to the moving original attendant legs',async()=>{
  const v=fixture(),rooms=buildSecurityRooms(v,(x,z,y=0)=>world({x,z},y),CELL_SIZE),enemy=createAttendant(attendantMaterials());v.scene.add(enemy.root);rooms.group.visible=true;
  for(const spot of getBedHideSpots(v.corridorWidth))for(const approach of spot.approaches){
    const eye=world(spot.target,BED_EYE_HEIGHT),outside=world(approach,BED_EYE_HEIGHT);v.scene.updateMatrixWorld(true);let ray=new THREE.Raycaster(eye,outside.clone().sub(eye).normalize(),0,eye.distanceTo(outside));assert.equal(ray.intersectObject(rooms.fixed,true).length,0,'real bed underside is hollow');
    ray=new THREE.Raycaster(eye,new THREE.Vector3(0,1,0),0,1);const roof=ray.intersectObject(rooms.fixed,true)[0];assert.ok(roof&&roof.point.y>=BED_UNDERSIDE&&roof.point.y<.75,'solid mattress/slats remain above the hide camera');
    enemy.root.position.copy(world(approach));
    for(const phase of [0,.6,1.2,1.8]){
      for(const limb of enemy.limbs.filter(l=>l.leg))limb.node.rotation.x=Math.sin(phase)*limb.side*.42;
      v.scene.updateMatrixWorld(true);const near=enemy.limbs.find(l=>l.leg&&l.side===(approach.x<spot.target.x?1:-1)),target=new THREE.Vector3(0,-.56,0).applyMatrix4(near.node.matrixWorld);
      ray=new THREE.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target)+.2);const hits=ray.intersectObjects([rooms.fixed,enemy.root],true);assert.ok(hits.length);let node=hits[0].object;while(node&&node!==enemy.root)node=node.parent;assert.equal(node,enemy.root,'moving shin is seen through the gap, not an opaque fake bed base');
    }
  }
  await Promise.all(v.assetJobs);dispose(v.scene);
});

test('bed height survives remote monitoring, follows the shared transition and leaves mouse yaw and pitch untouched',()=>{
  const v=fixture(),enemy=createAttendant(attendantMaterials()),camera=new THREE.PerspectiveCamera(60,16/9,.045,70),spot=getBedHideSpots(v.corridorWidth)[0],game={player:{...spot.approaches[0]},playerVelocity:{x:0,z:0},enemy:{x:28,z:3},enemyVelocity:{x:0,z:0},collected:new Set(),entryOpened:true,phase:'playing',blackout:{bedHide:{...spot,exitPoint:spot.approaches[0]},bedTransition:{id:'entry:1',from:spot.approaches[0],to:spot.target,progress:0,entering:true},enemyHeading:0}};
  Object.assign(v,{camera,cameraLight:new THREE.PointLight(),eyeHeight:1.65,horizontalFov:86,playerMotion:new PlayerMotion(),motionTuning:{...DEFAULT_TUNING},motionEnabled:true,reducedMotion:{matches:false},shardFade:new Float32Array(0),enemyPhase:0,enemy:enemy.root,enemyBody:enemy.body,enemyLimbs:enemy.limbs,warningLight:new THREE.SpotLight(),warningShadowPose:{},exitMaterial:{color:new THREE.Color()},exitRing:{material:{color:new THREE.Color()},rotation:{}},lampHalos:{instanceMatrix:{}},security:{active:false,resetAim(){},updateAim(){},observeEnemy(){},camera:new THREE.PerspectiveCamera(),selected:{id:'other'},shouldRender:()=>false},blackoutView:{update(){}},film:{render(){}},updateLampPool(){},updateFov:WorldView.prototype.updateFov});
  v.scene.add(enemy.root);
  for(let i=0;i<=33;i++){
    const t=i/33;game.blackout.bedTransition.progress=t;game.player=bedTransitionPose(spot.approaches[0],spot.target,t,true).position;const yaw=-.7+i*.04,pitch=.12;WorldView.prototype.render.call(v,game,yaw,pitch,i/60,1/60);assert.ok(Math.abs(camera.position.y-bedViewHeight(game.blackout))<1e-8);assert.equal(camera.rotation.y,yaw);assert.equal(camera.rotation.x,pitch);
  }
  game.blackout.bedTransition=null;v.security.active=true;WorldView.prototype.render.call(v,game,.9,-.15,1,1/60);assert.equal(camera.position.y,BED_EYE_HEIGHT);
  v.security.active=false;WorldView.prototype.render.call(v,game,1.0,.20,1.1,1/60);assert.equal(camera.position.y,BED_EYE_HEIGHT);assert.equal(camera.rotation.y,1.0);
  game.phase='caught';game.blackout.bedHide=null;game.caught=1.1;WorldView.prototype.render.call(v,game,1.1,.20,1.2,1/60);assert.equal(camera.position.y,BED_EYE_HEIGHT,'catch does not suddenly stand up');
  game.phase='respawn';WorldView.prototype.render.call(v,game,0,0,1.3,1/60);assert.equal(camera.position.y,1.65,'respawn clears the low view');dispose(v.scene);
});

test('five-second door-bash state produces only bounded leaf flex and retained stress marks, with no allocations',async()=>{
  const v=fixture(),rooms=buildSecurityRooms(v,(x,z,y=0)=>world({x,z},y),CELL_SIZE),state={powerOn:false,roomDoors:Object.fromEntries(rooms.doors.map(d=>[d.id,{progress:1,bashing:true,bashProgress:0,bashPulse:1}]))},count=()=>{let value=0;rooms.group.traverse(o=>{if(o.isMesh)value++;});return value;},before=count();
  const transforms=rooms.doors.map(d=>d.gate.matrix.clone());
  for(let frame=0;frame<=300;frame++){const time=frame/60;for(const status of Object.values(state.roomDoors)){status.bashProgress=time/5;status.bashPulse=Math.max(0,1-(time%.5)/.18);const pose=doorBashPose(status);assert.ok(Math.abs(pose.depth)<=.012&&Math.abs(pose.angle)<=.007);}rooms.update({blackout:state});assert.equal(count(),before);for(const door of rooms.doors)for(const leaf of door.leaves){assert.ok(Math.abs(leaf.object.position.z)<=.012);assert.ok(Math.abs(leaf.object.rotation.y)<=.007);}}
  for(const status of Object.values(state.roomDoors)){status.bashing=false;status.progress=0;}rooms.update({blackout:state});rooms.doors.forEach((door,i)=>{assert.ok(door.gate.matrix.equals(transforms[i]));for(const leaf of door.leaves){assert.equal(leaf.object.position.z,0);assert.ok(Math.abs(Math.abs(leaf.object.rotation.y)-Math.PI/2)<1e-9);assert.equal(leaf.stress.visible,true);}});
  for(const status of Object.values(state.roomDoors)){status.bashProgress=0;status.progress=1;}rooms.update({blackout:state});for(const door of rooms.doors)for(const leaf of door.leaves)assert.equal(leaf.stress.visible,false);
  await Promise.all(v.assetJobs);dispose(v.scene);
});
