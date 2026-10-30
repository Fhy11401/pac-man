const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stableFrameDt(seconds){return !Number.isFinite(seconds)||seconds<=0?0:seconds>.09?1/60:seconds;}
export const SCARE_TURN_SECONDS=.22;
export function captureScareLook(player,enemy,yaw,pitch){
  const dx=enemy.x-player.x,dz=enemy.z-player.z,d=Math.hypot(dx,dz);
  const target=d>.00001?Math.atan2(-dx,-dz):yaw;
  return {yaw,pitch,delta:Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw)),targetPitch:Math.atan2(-.06,Math.max(.1,d*2.4))};
}
export function scareLookPose(start,elapsed){
  const t=clamp(elapsed/SCARE_TURN_SECONDS,0,1),ease=t*t*(3-2*t);
  return {yaw:start.yaw+start.delta*ease,pitch:start.pitch+(start.targetPitch-start.pitch)*ease,showFace:t>=1};
}
