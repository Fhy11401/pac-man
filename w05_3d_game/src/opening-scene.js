import {faceReveal,OPENING_REVEAL_AT} from './scare-timing.js';
import {cloneAttendant} from './enemy-model.js';
import {AttendantMotion,poseAttendant} from './attendant-motion.js';
import * as THREE from '../vendor/three.module.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {securityCameraPoses} from './security-cameras.js';
import {OPENING_STRIKE_AT,OPENING_STRIKE_DURATION,OPENING_CUT_AT,OPENING_CRAWL_AT,OPENING_CRAWL_MOVE_AT,OPENING_CRAWL_END,openingPushProgress} from './opening-timing.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function travel(time,start,end){
  const duration=end-start,ramp=.65,t=Math.max(0,Math.min(duration,time-start)),integral=u=>u*u*u-.5*u*u*u*u;
  const distance=t<ramp?ramp*integral(t/ramp):t>duration-ramp?duration-ramp-ramp*integral((duration-t)/ramp):t-ramp/2;
  return{distance:distance/(duration-ramp),speed:smooth(t/ramp)*smooth((duration-t)/ramp)/(duration-ramp)};
}
export function openingWalk(time){
  const entry=travel(time,1.1,3.3),crawlTravel=travel(time,OPENING_CRAWL_MOVE_AT,OPENING_CRAWL_END),progress=.46*entry.distance;
  const strikeTime=Math.max(0,Math.min(1,(time-OPENING_STRIKE_AT)/OPENING_STRIKE_DURATION)),strike=smooth(strikeTime),lunging=time>=OPENING_STRIKE_AT;
  const crawl=smooth((time-OPENING_CRAWL_AT)/.6)*(1-strike),glance=smooth((time-6.7)/.65);
  const pulse=(center,width)=>Math.max(0,1-Math.abs(time-center)/width);
  return{progress,speed:.46*entry.speed,approach:lunging?.70+.30*strike:0,approachSpeed:lunging?.30*6*strikeTime*(1-strikeTime)/OPENING_STRIKE_DURATION:0,strike,lunging,crawl,crawlTravel:crawlTravel.distance,crawlSpeed:crawlTravel.speed,
    bodyTurn:smooth((time-7.25)/.6),visible:time>=1.1&&(time<OPENING_CRAWL_END||lunging)&&time<OPENING_CUT_AT,phase:progress*9.6*Math.PI,glance,lensThreat:lunging?strike:0,
    faceExposure:faceReveal(time,OPENING_REVEAL_AT),interference:.12*pulse(2,.10)+.45*pulse(OPENING_STRIKE_AT+.07,.065)};
}

// Solve a two-segment limb in its sagittal plane. The negative bend retains
// the unsettling silhouette while keeping a fixed length and floor clearance.
function limbAngles(down,forward,upper,lower){
  const d=Math.max(.01,Math.min(upper+lower-.004,Math.hypot(down,forward))),clamp=x=>Math.max(-1,Math.min(1,x));
  return{upper:-Math.atan2(forward,down)+Math.acos(clamp((upper*upper+d*d-lower*lower)/(2*upper*d))),lower:Math.acos(clamp((upper*upper+lower*lower-d*d)/(2*upper*lower)))-Math.PI};
}
const jointPoint=new THREE.Vector3(),footPoint=new THREE.Vector3();
export function prepareOpeningBody(model){
  const headNodes=new Set();model.head.traverse(o=>headNodes.add(o));const copies=new Map();
  model.root.traverse(o=>{if(!o.isMesh||headNodes.has(o)||!o.material?.isMeshStandardMaterial)return;
    const source=o.material;let m=copies.get(source);
    if(!m){m=source.clone();delete m.userData.threatExposure;
      if(source.userData.threatExposure){m.map=null;m.bumpMap=null;m.roughnessMap=null;m.color.setHex(0xaaa096);}
      else if(source.color.getHex()!==0x050606)m.color.lerp(new THREE.Color(0x766c73),.55);
      m.envMapIntensity=.3;m.emissive.copy(m.color);m.emissiveIntensity=.025;copies.set(source,m);
    }o.material=m;
  });
  // Lift the rigid skirt into a folded hem when crouching; do not drag the
  // standing calf-length shell through the thighs or floor.
  for(const o of model.body.children){if(!o.isMesh)continue;o.updateMatrix();o.geometry.computeBoundingBox();if(o.geometry.boundingBox.clone().applyMatrix4(o.matrix).min.y>=.9)continue;const g=o.geometry.clone(),a=g.attributes.position,morph=a.clone();
    for(let i=0;i<a.count;i++){const y=a.getY(i),w=Math.max(0,Math.min(1,(.9-y)/.5));morph.setXYZ(i,a.getX(i)*(1+.12*w),y+(.8-y)*.48*w,a.getZ(i)*(1+.12*w));}
    g.morphAttributes.position=[morph];o.geometry=g;o.updateMorphTargets();
  }
  return copies;
}
const neckBase=new THREE.Vector3(0,-.18,-.02),neckOffset=new THREE.Vector3();
export function anchorOpeningNeck(model){
  // Counter-rotating the head must pivot at the neck, not the face centre.
  neckOffset.copy(neckBase).multiply(model.head.scale).applyQuaternion(model.head.quaternion);
  model.head.position.set(0,1.46,.006).sub(neckOffset);
}
export function poseOpeningCrawl(model,pose,time){
  const w=pose.crawl;for(const o of model.body.children)if(o.morphTargetInfluences)o.morphTargetInfluences[0]=w;
  if(w<=0)return;
  const phase=(time-OPENING_CRAWL_MOVE_AT)*8,moving=smooth(pose.crawlSpeed*5),blend=(a,b)=>a+(b-a)*w;
  const pitch=blend(model.body.rotation.x,1.18),pelvisY=blend(.8+model.body.position.y,.50+Math.sin(phase*2)*.008*moving),pelvisZ=-.30*w;
  model.body.rotation.set(pitch,0,0);
  // Rotate around the pelvis, not the feet; hips stay attached to the coat.
  model.body.position.set(0,pelvisY-.8*Math.cos(pitch),pelvisZ-.8*Math.sin(pitch));model.body.updateMatrix();
  for(const limb of model.limbs){const beat=Math.sin(phase+(limb.side===1?Math.PI:0))*moving,lift=Math.max(0,beat)*.045;
    if(limb.leg){
      limb.node.updateMatrix();limb.knee.updateMatrix();footPoint.copy(limb.ankle.position).applyMatrix4(limb.knee.matrix).applyMatrix4(limb.node.matrix);
      jointPoint.set(limb.side*.13,.8,0).applyMatrix4(model.body.matrix);limb.node.position.copy(jointPoint);
      const targetY=Math.max(.075,blend(footPoint.y,.075+lift)),targetZ=blend(footPoint.z,pelvisZ-.34+beat*.13),a=limbAngles(jointPoint.y-targetY,targetZ-jointPoint.z,.38,.38);
      limb.node.rotation.set(a.upper,0,0);limb.knee.rotation.x=a.lower;limb.ankle.rotation.x=-a.upper-a.lower;
    }else{
      limb.node.updateMatrix();limb.elbow.updateMatrix();footPoint.set(0,-.412,0).applyMatrix4(limb.elbow.matrix).applyMatrix4(limb.node.matrix).applyMatrix4(model.body.matrix);
      jointPoint.copy(limb.node.position).applyMatrix4(model.body.matrix);
      const targetY=Math.max(.09,blend(footPoint.y,.09+Math.max(0,-beat)*.045)),targetZ=blend(footPoint.z,jointPoint.z+.10-beat*.12),a=limbAngles(jointPoint.y-targetY,targetZ-jointPoint.z,.29,.412);
      limb.node.rotation.set(a.upper-pitch,0,0);limb.elbow.rotation.x=a.lower;
    }
  }
}

export function openingFraming(time){return{push:openingPushProgress(time),appeared:time>=1.1};}

export function openingFeedFov(fov,panelAspect,viewAspect){return THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*Math.min(1,panelAspect/viewAspect)));}

export function openingHallShot(bounds,world){
  const b=bounds,z=(b.minZ+b.maxZ)/2,x=b.minX+2.8,camera=new THREE.PerspectiveCamera(42,16/9,.045,70);
  camera.position.copy(world(b.minX+1.1,z,1.85));camera.lookAt(world(x,z,1.1));camera.updateMatrixWorld(true);
  return{camera,path:{x,from:b.minZ+.25,to:b.maxZ-.25}};
}

// The same attendant has independent intro joints; pursuit state stays untouched.
export function buildOpeningScene(v,world,unit){
  const model=cloneAttendant(v.enemyRig),actor=model.root;actor.name='opening-attendant';actor.visible=false;prepareOpeningBody(model);v.scene.add(actor);
  const hall=BLACKOUT_LAYOUT.halls.find(h=>h.bounds.maxX-h.bounds.minX>=4&&h.bounds.maxZ-h.bounds.minZ>=4);let camera=new THREE.PerspectiveCamera(42,16/9,.045,70);
  let path;
  if(hall){({camera,path}=openingHallShot(hall.bounds,world));}
  else{const pose=securityCameraPoses(v.corridorWidth,unit)[0];camera.position.copy(pose.position);camera.lookAt(pose.target);}
  camera.updateMatrixWorld(true);
  const initialCameraRotation=camera.quaternion.clone(),motion=new AttendantMotion(),aimCamera=camera.clone(),headPoint=new THREE.Vector3(),approachVector=new THREE.Vector3();let lastTime=null,lensThreat=0,faceExposure=0;
  if(path){const stop=world(path.x,path.from+(path.to-path.from)*.46);approachVector.copy(camera.position).sub(stop);approachVector.y=0;approachVector.multiplyScalar(Math.max(0,1-.53/approachVector.length()));}
  const revealLight=new THREE.SpotLight(0xeee5d5,0,9,.85,.7,1);v.scene.add(revealLight,revealLight.target);
  const bodyLight=new THREE.SpotLight(0xc4c9d5,0,9,.85,1,2);bodyLight.name='opening-body-fill';v.scene.add(bodyLight,bodyLight.target);
  const room=v.blackoutView.controlRoom,seatCamera=new THREE.PerspectiveCamera(),endCamera=new THREE.PerspectiveCamera(),playPosition=new THREE.Vector3(),playRotation=new THREE.Quaternion();
  function seatedCamera(playerCamera,time){
    const progress=openingFraming(time),target=room.focusPosition;
    seatCamera.position.copy(room.seatPosition);seatCamera.lookAt(target);
    // The screen fills the viewport before handing off to the full-quality CCTV pass.
    // Matching the cropped vertical FOV keeps the final frame continuous at any aspect.
    const panel=room.focusFeed.panel,aspect=playerCamera.aspect;
    if(progress.push===1){playerCamera.position.copy(camera.position);playerCamera.quaternion.copy(camera.quaternion);playerCamera.fov=openingFeedFov(camera.fov,panel.width/panel.height,aspect);playerCamera.updateProjectionMatrix();return;}
    const fov=68+(44-68)*progress.push,fit=Math.min(panel.height,panel.width/aspect)/(2*Math.tan(THREE.MathUtils.degToRad(44/2)));
    endCamera.position.copy(target).addScaledVector(room.focusNormal,fit);endCamera.lookAt(target);
    playerCamera.position.copy(seatCamera.position).lerp(endCamera.position,progress.push);
    playerCamera.quaternion.copy(seatCamera.quaternion).slerp(endCamera.quaternion,progress.push);playerCamera.fov=fov;playerCamera.updateProjectionMatrix();
  }
  function update(game,playerCamera){
    const shot=game.blackout?.introShot,watching=shot==='monitor';actor.visible=watching&&Boolean(path);
    if(!watching){
      revealLight.intensity=0;bodyLight.intensity=0;lastTime=null;lensThreat=0;
      if(shot){playPosition.copy(playerCamera.position);playRotation.copy(playerCamera.quaternion);const fov=playerCamera.fov;seatedCamera(playerCamera,0);if(shot==='return'){const t=smooth((game.blackout.introTime??0)/1.8);playerCamera.position.lerp(playPosition,t);playerCamera.quaternion.slerp(playRotation,t);playerCamera.fov+=(fov-playerCamera.fov)*t;playerCamera.updateProjectionMatrix();}return true;}
      return false;
    }
    const time=game.blackout.introTime??0,pose=openingWalk(time);faceExposure=pose.faceExposure;actor.visible=actor.visible&&pose.visible;lensThreat=pose.lensThreat;
    if(path){
      const distance=(path.to-path.from)*unit,approachDistance=approachVector.length(),speed=p=>p.strike>0?0:Math.hypot(p.speed*distance,p.crawlSpeed*distance*.65)/actor.scale.z;
      if(lastTime===null||time<lastTime||time-lastTime>.25){motion.reset();for(let t=0;t<time;){const step=Math.min(1/120,time-t);t+=step;motion.update(speed(openingWalk(t)),step);} }
      else motion.update(speed(pose),time-lastTime);
      actor.position.copy(world(path.x,path.from+(path.to-path.from)*(pose.progress+(pose.lunging?0:.65*pose.crawlTravel)))).addScaledVector(approachVector,pose.approach);
      if(pose.lunging)actor.position.y-=.55*(1-pose.strike);
      const heading=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);actor.rotation.y=pose.lunging?heading:heading*pose.bodyTurn*(1-pose.crawl);
      for(const limb of model.limbs){limb.node.position.z=0;limb.node.rotation.z=0;}
      model.head.position.set(0,1.64,.026);poseAttendant(model,motion.update(0,0),(heading-actor.rotation.y)*pose.glance);model.head.rotation.z-=pose.glance*.08*(1-pose.lensThreat);
      poseOpeningCrawl(model,pose,time);model.head.rotation.y=(heading-actor.rotation.y)*pose.glance;model.head.rotation.z-=pose.crawl*.22;
      model.body.rotation.x+=pose.strike*.055;model.head.rotation.z-=pose.strike*.065;
      for(const limb of model.limbs)if(!limb.leg){limb.node.rotation.x+=(-1.05-limb.node.rotation.x)*pose.strike;limb.elbow.rotation.x+=(-.18-limb.elbow.rotation.x)*pose.strike;}
      actor.updateMatrixWorld(true);model.head.getWorldPosition(headPoint);
      const horizontal=Math.hypot(camera.position.x-headPoint.x,camera.position.z-headPoint.z);
      model.head.rotation.x=-Math.atan2(camera.position.y-headPoint.y,horizontal)*pose.glance-model.body.rotation.x;
      anchorOpeningNeck(model);actor.updateMatrixWorld(true);model.head.getWorldPosition(headPoint);
      aimCamera.lookAt(headPoint);revealLight.position.copy(camera.position);revealLight.target.position.copy(headPoint);revealLight.intensity=actor.visible?1.8+faceReveal(time,OPENING_REVEAL_AT)*1.4:0;
    }
    bodyLight.position.copy(camera.position);bodyLight.position.y+=.35;bodyLight.target.position.copy(actor.position);bodyLight.target.position.y+=.85-pose.crawl*.4;bodyLight.intensity=actor.visible&&!pose.lunging?22:0;
    lastTime=time;

    camera.quaternion.copy(initialCameraRotation).slerp(aimCamera.quaternion,smooth(pose.approach));camera.aspect=room.focusFeed.panel.width/room.focusFeed.panel.height;camera.updateProjectionMatrix();seatedCamera(playerCamera,time);return true;
  }
  return{actor,model,camera,path,revealLight,bodyLight,get lensThreat(){return lensThreat;},get faceExposure(){return faceExposure;},label:hall?.label.split(' / ')[0]??'公共区域',update};
}
