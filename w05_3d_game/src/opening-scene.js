import {cloneAttendant} from './enemy-model.js';
import {AttendantMotion,poseAttendant} from './attendant-motion.js';
import * as THREE from '../vendor/three.module.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {securityCameraPoses} from './security-cameras.js';
import {OPENING_STRIKE_AT,OPENING_STRIKE_DURATION,OPENING_CUT_AT} from './opening-timing.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function travel(time,start,end){
  const duration=end-start,ramp=.65,t=Math.max(0,Math.min(duration,time-start)),integral=u=>u*u*u-.5*u*u*u*u;
  const distance=t<ramp?ramp*integral(t/ramp):t>duration-ramp?duration-ramp-ramp*integral((duration-t)/ramp):t-ramp/2;
  return{distance:distance/(duration-ramp),speed:smooth(t/ramp)*smooth((duration-t)/ramp)/(duration-ramp)};
}
export function openingWalk(time){
  const entry=travel(time,1.1,4.4),creep=travel(time,6,11.55),progress=.46*entry.distance;
  const strikeTime=Math.max(0,Math.min(1,(time-OPENING_STRIKE_AT)/OPENING_STRIKE_DURATION)),strike=smooth(strikeTime);
  const approach=.38*creep.distance+.62*strike,glance=smooth((time-4.15)/1.25);
  const pulse=(center,width)=>Math.max(0,1-Math.abs(time-center)/width);
  return{progress,speed:.46*entry.speed,approach,approachSpeed:.38*creep.speed+.62*6*strikeTime*(1-strikeTime)/OPENING_STRIKE_DURATION,strike,bodyTurn:smooth((time-5.1)/.9),visible:time>=1.1&&time<OPENING_CUT_AT,phase:progress*9.6*Math.PI,glance,lensThreat:smooth((approach-.80)/.18),interference:.12*pulse(5.35,.3)+.45*pulse(OPENING_STRIKE_AT+.07,.065)+.4*pulse(13.02,.18)};
}

// The same attendant has independent intro joints; pursuit state stays untouched.
export function buildOpeningScene(v,world,unit){
  const model=cloneAttendant(v.enemyRig),actor=model.root;actor.name='opening-attendant';actor.visible=false;v.scene.add(actor);
  const hall=BLACKOUT_LAYOUT.halls.find(h=>h.bounds.maxX-h.bounds.minX>=4&&h.bounds.maxZ-h.bounds.minZ>=4),camera=new THREE.PerspectiveCamera(42,16/9,.045,70);
  let path;
  if(hall){const b=hall.bounds,z=(b.minZ+b.maxZ)/2,x=b.minX+2.8;camera.position.copy(world(b.minX+1.1,z,1.85));camera.lookAt(world(x,z,1.1));path={x,from:b.minZ+.25,to:b.maxZ-.25};}
  else{const pose=securityCameraPoses(v.corridorWidth,unit)[0];camera.position.copy(pose.position);camera.lookAt(pose.target);}
  camera.updateMatrixWorld(true);
  const motion=new AttendantMotion(),aimCamera=camera.clone(),headPoint=new THREE.Vector3(),approachVector=new THREE.Vector3();let lastTime=null,lensThreat=0;
  if(path){const stop=world(path.x,path.from+(path.to-path.from)*.46);approachVector.copy(camera.position).sub(stop);approachVector.y=0;approachVector.multiplyScalar(Math.max(0,1-.70/approachVector.length()));}
  function update(game,playerCamera){
    const watching=game.blackout?.introShot==='monitor';actor.visible=watching&&Boolean(path);if(!watching){lastTime=null;lensThreat=0;return false;}
    const time=game.blackout.introTime??0,pose=openingWalk(time);actor.visible=actor.visible&&pose.visible;lensThreat=pose.lensThreat;
    if(path){
      const distance=(path.to-path.from)*unit,approachDistance=approachVector.length(),speed=p=>p.strike>0?0:Math.hypot(p.speed*distance,p.approachSpeed*approachDistance);
      if(lastTime===null||time<lastTime||time-lastTime>.25){motion.reset();for(let t=0;t<time;){const step=Math.min(1/120,time-t);t+=step;motion.update(speed(openingWalk(t)),step);} }
      else motion.update(speed(pose),time-lastTime);
      actor.position.copy(world(path.x,path.from+(path.to-path.from)*pose.progress)).addScaledVector(approachVector,pose.approach);
      const heading=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);actor.rotation.y=heading*pose.bodyTurn;
      poseAttendant(model,motion.update(0,0),(heading-actor.rotation.y)*pose.glance);model.head.rotation.z-=pose.glance*.08*(1-pose.lensThreat);
      model.body.rotation.x+=pose.strike*.055;model.head.rotation.z-=pose.strike*.065;
      for(const limb of model.limbs)if(!limb.leg){limb.node.rotation.x+=(-1.05-limb.node.rotation.x)*pose.strike;limb.elbow.rotation.x+=(-.18-limb.elbow.rotation.x)*pose.strike;}
      actor.updateMatrixWorld(true);model.head.getWorldPosition(headPoint);
      const horizontal=Math.hypot(camera.position.x-headPoint.x,camera.position.z-headPoint.z);
      model.head.rotation.x=-Math.atan2(camera.position.y-headPoint.y,horizontal)*pose.glance-model.body.rotation.x;
      aimCamera.lookAt(headPoint);
    }
    lastTime=time;

    playerCamera.position.copy(camera.position);playerCamera.quaternion.copy(camera.quaternion).slerp(aimCamera.quaternion,smooth(pose.approach));playerCamera.fov=42;playerCamera.updateProjectionMatrix();return true;
  }
  return{actor,model,camera,path,get lensThreat(){return lensThreat;},label:hall?.label.split(' / ')[0]??'公共区域',update};
}
