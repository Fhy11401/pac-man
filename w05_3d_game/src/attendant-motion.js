import * as THREE from '../vendor/three.module.js';
const neckAnchor=new THREE.Vector3();
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
export const strideLength=speed=>1.25+1.4*clamp((speed-1.2)/3.5);

// Metres and radians. Stance tracks the moving floor; swing carries the foot
// forward with matched end velocities. Two-bone IK keeps each sole level.
export function sampleAttendantGait(phase,speed,weight=1,time=0){
  weight=clamp(weight);const run=clamp((speed-1.2)/3.5),stance=.56-.22*run;
  const hipOffset=weight*(-.095-.055*run+.005*Math.cos(phase*2));
  const feet=[-1,1].map(side=>{
    const cycle=((phase/TAU+(side===1?.5:0))%1+1)%1,planted=cycle<stance;
    const travel=strideLength(speed)*stance;let z,lift=0,pitch=0;
    if(planted){const t=cycle/stance;z=travel*(.5-t);pitch=-.11*(1-ease(t/.25))+.20*ease((t-.70)/.30);}
    else{const t=(cycle-stance)/(1-stance),t2=t*t,t3=t2*t,tangent=-travel*(1-stance)/stance;
      z=(2*t3-3*t2+1)*(-travel/2)+(-2*t3+3*t2)*(travel/2)+(2*t3-3*t2+t)*tangent;
      lift=(.055+.12*run)*Math.sin(Math.PI*t)**2;pitch=.20-.31*ease(t);
    }
    z*=weight;lift*=weight;pitch*=weight;
    const ankleHeight=.065+lift+(Math.sqrt(pitch*pitch+.0001)+pitch)*.0675;
    const down=.80+hipOffset-ankleHeight,reach=Math.sqrt(Math.max(.001,.758**2-down**2));z=clamp(z,-reach,reach);
    const d=Math.hypot(down,z),hip=Math.atan2(-z,down)-Math.acos(clamp(d/(2*.38),-1,1));
    const knee=2*Math.acos(clamp(d/(2*.38),-1,1));
    return{side,planted,z,lift,ankleHeight,hip,knee,ankle:pitch-hip-knee};
  });
  return{phase,weight,run,hipOffset,time,breath:Math.sin(time*1.55)*.002*(1-weight),feet};
}

export function poseAttendant(model,pose,glance=0){
  const {phase,weight,run,hipOffset,breath,time=0,alert=0}=pose,body=model.body;
  // Smooth, infrequent head cocks break the regular gait without frame-based noise.
  const cock=Math.max(0,Math.sin(time*.73+.2))**16,reach=alert*weight;
  body.position.set(Math.sin(phase)*.018*weight,hipOffset+breath,0);
  body.rotation.set(.06+run*.14*weight+.04*alert,Math.sin(phase-.4)*.05*weight,Math.sin(phase)*.028*weight);
  if(model.head){
    model.head.rotation.set(-body.rotation.x*.85+.025*Math.sin(time*1.1),-body.rotation.y*.8+glance+.035*Math.sin(time*.81),-body.rotation.z*.8-.07+.16*cock+.025*Math.sin(time*.67));
    neckAnchor.set(0,-.18,-.02).multiply(model.head.scale).applyQuaternion(model.head.quaternion);
    model.head.position.set(0,1.46,.006).sub(neckAnchor);
    const jaw=.035+.035*(.5+.5*Math.sin(time*1.8))+.26*alert;
    model.head.traverse(o=>{if(o.morphTargetInfluences)o.morphTargetInfluences[0]=jaw;});
  }
  for(const limb of model.limbs){
    const offset=phase+(limb.side===1?Math.PI:0);
    if(limb.leg&&limb.knee&&limb.ankle){const foot=pose.feet.find(f=>f.side===limb.side);limb.node.position.y=.8+hipOffset;limb.node.rotation.x=foot.hip;limb.knee.rotation.x=foot.knee;limb.ankle.rotation.x=foot.ankle;}
    else if(!limb.leg){limb.node.rotation.x=-.10+Math.cos(offset-.35)*(.27+.20*run)*weight*(1-.55*reach)-reach*(limb.side===1?.72:.46);limb.node.rotation.z=limb.side*(.065+.035*reach)+.025*Math.sin(time*1.3+limb.side);if(limb.elbow)limb.elbow.rotation.x=-.28-.20*run*weight+.12*Math.sin(offset-.9)*weight-.18*reach;}
  }
}

export class AttendantMotion{
  constructor(){this.reset();}
  reset(){this.phase=0;this.weight=0;this.time=0;this.speed=0;this.alert=0;}
  update(speed,dt,active=true,threat=0){
    if(active&&Number.isFinite(dt)&&dt>0){
      dt=Math.min(.1,dt);speed=Math.max(0,Number.isFinite(speed)?speed:0);this.time+=dt;this.alert+=(clamp(threat)-this.alert)*(1-Math.exp(-dt*6));
      // Use the same filtered speed for stride geometry and cadence. Small
      // substeps keep the transition consistent at 30, 60 and 120 Hz.
      const count=Math.ceil(dt*120),step=dt/count;
      for(let i=0;i<count;i++){const before=this.speed;this.speed+=(speed-this.speed)*(1-Math.exp(-step*9));const average=(before+this.speed)/2;this.phase=(this.phase+average*step*TAU/strideLength(average))%TAU;this.weight+=(clamp(this.speed/.6)-this.weight)*(1-Math.exp(-step*12));}
      if(speed===0&&this.speed<.0001&&this.weight<.0005){this.speed=0;this.weight=0;}
    }
    return {...sampleAttendantGait(this.phase,this.speed,this.weight,this.time),alert:this.alert};
  }
}

export function smoothAttendantHeading(angle,target,velocity,dt){
  const delta=Math.atan2(Math.sin(angle-target),Math.cos(angle-target)),omega=12,decay=Math.exp(-omega*dt),spring=velocity+omega*delta;
  return{angle:angle-delta+(delta+spring*dt)*decay,velocity:(velocity-omega*spring*dt)*decay};
}


const gazeOrigin=new THREE.Vector3(),gazeDirection=new THREE.Vector3(),gazeTarget=new THREE.Quaternion(),gazeParent=new THREE.Quaternion(),gazeEuler=new THREE.Euler(0,0,0,'YXZ');
// Head-only gaze: body navigation and detection stay independent of presentation.
export function trackAttendantGaze(model,target,dt,active=true){
 if(!model?.head)return;
 if(!target&&!model.gaze)return;
 model.root.updateMatrixWorld(true);
 if(target){
  model.head.getWorldPosition(gazeOrigin);gazeDirection.copy(target).sub(gazeOrigin);
  if(gazeDirection.lengthSq()<.0001)return;
  gazeEuler.set(clamp(-Math.atan2(gazeDirection.y,Math.hypot(gazeDirection.x,gazeDirection.z)),-.4,.55),Math.atan2(gazeDirection.x,gazeDirection.z),model.head.rotation.z,'YXZ');gazeTarget.setFromEuler(gazeEuler);
 }else model.head.getWorldQuaternion(gazeTarget);
 if(!model.gaze)model.gaze=model.head.getWorldQuaternion(new THREE.Quaternion());
 if(active&&Number.isFinite(dt)&&dt>0)model.gaze.slerp(gazeTarget,1-Math.exp(-Math.min(dt,.1)*8));
 if(!target&&model.gaze.angleTo(gazeTarget)<.001){model.gaze=null;return;}
 model.head.quaternion.copy(model.body.getWorldQuaternion(gazeParent).invert()).multiply(model.gaze);
 neckAnchor.set(0,-.18,-.02).multiply(model.head.scale).applyQuaternion(model.head.quaternion);model.head.position.set(0,1.46,.006).sub(neckAnchor);
}

export function poseDoorBash(model,time){
 if(!model)return;const strike=Math.max(0,Math.cos(time*Math.PI*4));
 model.body.rotation.x+=.06+strike*.10;
 for(const limb of model.limbs)if(!limb.leg){limb.node.rotation.x=-1.3-strike*.35;limb.node.rotation.z=limb.side*.12;if(limb.elbow)limb.elbow.rotation.x=-.75+strike*.6;}
}
