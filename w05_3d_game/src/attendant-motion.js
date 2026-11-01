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
  return{phase,weight,run,hipOffset,breath:Math.sin(time*1.55)*.002*(1-weight),feet};
}

export function poseAttendant(model,pose,glance=0){
  const {phase,weight,run,hipOffset,breath}=pose,body=model.body;
  body.position.set(Math.sin(phase)*.014*weight,hipOffset+breath,0);
  body.rotation.set(.035+run*.10*weight,Math.sin(phase-.25)*.035*weight,Math.sin(phase)*.022*weight);
  if(model.head){model.head.rotation.set(-body.rotation.x*.65,-body.rotation.y*.7+glance,-body.rotation.z*.65);}
  for(const limb of model.limbs){
    const offset=phase+(limb.side===1?Math.PI:0);
    if(limb.leg&&limb.knee&&limb.ankle){const foot=pose.feet.find(f=>f.side===limb.side);limb.node.position.y=.8+hipOffset;limb.node.rotation.x=foot.hip;limb.knee.rotation.x=foot.knee;limb.ankle.rotation.x=foot.ankle;}
    else if(!limb.leg){limb.node.rotation.x=-.06+Math.cos(offset-.22)*(.23+.23*run)*weight;limb.node.rotation.z=limb.side*.04;if(limb.elbow)limb.elbow.rotation.x=-.25-.22*run*weight+.10*Math.sin(offset-.7)*weight;}
  }
}

export class AttendantMotion{
  constructor(){this.reset();}
  reset(){this.phase=0;this.weight=0;this.time=0;this.speed=0;}
  update(speed,dt,active=true){
    if(active&&Number.isFinite(dt)&&dt>0){
      dt=Math.min(.1,dt);speed=Math.max(0,Number.isFinite(speed)?speed:0);this.time+=dt;
      // Use the same filtered speed for stride geometry and cadence. Small
      // substeps keep the transition consistent at 30, 60 and 120 Hz.
      const count=Math.ceil(dt*120),step=dt/count;
      for(let i=0;i<count;i++){const before=this.speed;this.speed+=(speed-this.speed)*(1-Math.exp(-step*9));const average=(before+this.speed)/2;this.phase=(this.phase+average*step*TAU/strideLength(average))%TAU;this.weight+=(clamp(this.speed/.6)-this.weight)*(1-Math.exp(-step*12));}
      if(speed===0&&this.speed<.0001&&this.weight<.0005){this.speed=0;this.weight=0;}
    }
    return sampleAttendantGait(this.phase,this.speed,this.weight,this.time);
  }
}

export function smoothAttendantHeading(angle,target,velocity,dt){
  const delta=Math.atan2(Math.sin(angle-target),Math.cos(angle-target)),omega=12,decay=Math.exp(-omega*dt),spring=velocity+omega*delta;
  return{angle:angle-delta+(delta+spring*dt)*decay,velocity:(velocity-omega*spring*dt)*decay};
}
