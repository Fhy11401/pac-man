const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export class CameraPan{
 constructor(yaw=0){this.home=yaw;this.yaw=yaw;this.velocity=0;this.direction=1;}
 reset(){this.yaw=this.home;this.velocity=0;this.direction=1;}
 step(dt,{targetYaw=null,blocked=()=>false}={}){
  dt=Math.min(.05,Math.max(0,dt));if(!dt)return this.yaw;
  const desired=targetYaw===null?this.direction*.28:Math.max(-1.5,Math.min(1.5,wrap(targetYaw-this.yaw)*4.5));
  this.velocity+=(desired-this.velocity)*(1-Math.exp(-dt*12));
  const next=this.yaw+this.velocity*dt;
  if(Math.abs(next-this.yaw)>1e-8&&blocked(next)){
   this.direction=-Math.sign(this.velocity||this.direction);this.velocity=-this.velocity*.35;
   const rebound=this.yaw+this.velocity*dt;if(!blocked(rebound))this.yaw=rebound;
  }else this.yaw=next;
  return this.yaw;
 }
}
