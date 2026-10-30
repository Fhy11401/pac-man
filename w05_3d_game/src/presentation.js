const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stableFrameDt(seconds){return !Number.isFinite(seconds)||seconds<=0?0:seconds>.09?1/60:seconds;}
// Keep the 3D canvas near full-HD workload on high-DPI/large displays; HTML HUD stays native resolution.
export function renderPixelRatio(width,height,dpr){return Math.min(dpr,1.6,Math.sqrt(2400000/(Math.max(1,width)*Math.max(1,height))));}
export const SCARE_TURN_SECONDS=.22;
export const QUICK_TURN_SECONDS=.32;
export function angularTurnRate(previous,yaw,dt){
  if(previous===null||!Number.isFinite(previous)||!Number.isFinite(yaw)||dt<=0)return 0;
  return Math.min(16,Math.abs(Math.atan2(Math.sin(yaw-previous),Math.cos(yaw-previous)))/dt);
}
// Add each frame's angle, so live mouse input is retained instead of snapping to a stored target.
export class QuickTurn {
  constructor(){this.cancel();}
  start(duration=QUICK_TURN_SECONDS){if(this.active)return false;this.duration=Number.isFinite(duration)&&duration>0?duration:QUICK_TURN_SECONDS;this.elapsed=0;this.angle=0;this.active=true;return true;}
  step(dt){
    if(!this.active||!Number.isFinite(dt)||dt<=0)return 0;
    this.elapsed=Math.min(this.duration,this.elapsed+dt);
    const t=this.elapsed/this.duration,angle=Math.PI*t*t*(3-2*t),delta=angle-this.angle;
    this.angle=angle;if(t>=1)this.active=false;return delta;
  }
  cancel(){this.active=false;this.elapsed=0;this.angle=0;}
}
export function captureScareLook(player,enemy,yaw,pitch){
  const dx=enemy.x-player.x,dz=enemy.z-player.z,d=Math.hypot(dx,dz);
  const target=d>.00001?Math.atan2(-dx,-dz):yaw;
  return {yaw,pitch,delta:Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw)),targetPitch:Math.atan2(-.06,Math.max(.1,d*2.4))};
}
export function scareLookPose(start,elapsed){
  const t=clamp(elapsed/SCARE_TURN_SECONDS,0,1),ease=t*t*(3-2*t);
  return {yaw:start.yaw+start.delta*ease,pitch:start.pitch+(start.targetPitch-start.pitch)*ease,showFace:t>=1};
}
