import {isOpen,wallInset,allTransitionWalls} from './world.js';
const EPS=1e-9;

// Circle against the faces and rounded corners of a wall. Returns the first inward contact.
function sweepWall(p,d,x,z,halfX,halfZ,radius){
  const lowX=x-halfX,highX=x+halfX,lowZ=z-halfZ,highZ=z+halfZ;
  let hit=null;
  const consider=(time,nx,nz)=>{
    const skinTime=2e-6/Math.max(EPS,Math.hypot(d.x,d.z));
    if(time< -skinTime||time>1+EPS||d.x*nx+d.z*nz>=-EPS)return;
    if(!hit||time<hit.time)hit={time:Math.max(0,Math.min(1,time)),nx,nz};
  };
  if(Math.abs(d.x)>EPS)for(const [edge,nx] of [[lowX-radius,-1],[highX+radius,1]]){
    const t=(edge-p.x)/d.x,atZ=p.z+t*d.z;
    if(atZ>=lowZ-EPS&&atZ<=highZ+EPS)consider(t,nx,0);
  }
  if(Math.abs(d.z)>EPS)for(const [edge,nz] of [[lowZ-radius,-1],[highZ+radius,1]]){
    const t=(edge-p.z)/d.z,atX=p.x+t*d.x;
    if(atX>=lowX-EPS&&atX<=highX+EPS)consider(t,0,nz);
  }
  const a=d.x*d.x+d.z*d.z;
  if(a>EPS*EPS)for(const [cx,sx] of [[lowX,-1],[highX,1]])for(const [cz,sz] of [[lowZ,-1],[highZ,1]]){
    const ox=p.x-cx,oz=p.z-cz,b=2*(ox*d.x+oz*d.z),c=ox*ox+oz*oz-radius*radius,disc=b*b-4*a*c;
    if(disc<0)continue;
    const t=(-b-Math.sqrt(disc))/(2*a),nx=(ox+t*d.x)/radius,nz=(oz+t*d.z)/radius;
    if(nx*sx>=-EPS&&nz*sz>=-EPS)consider(t,nx,nz);
  }
  return hit;
}

// Reach contact, then use the remaining movement along the wall tangent.
// This has no X/Z priority, snapping to a centre line or extra movement energy.
export function slideMove(start,delta,radius,width){
  let p={...start},remaining={...delta};const path=[{...start}],contacts=[];
  const half=.5+wallInset(width),skin=1e-6;
  for(let iteration=0;iteration<5&&Math.hypot(remaining.x,remaining.z)>EPS;iteration++){
    let first=null;
    const minX=Math.floor(Math.min(p.x,p.x+remaining.x))-1,maxX=Math.ceil(Math.max(p.x,p.x+remaining.x))+1;
    const minZ=Math.floor(Math.min(p.z,p.z+remaining.z))-1,maxZ=Math.ceil(Math.max(p.z,p.z+remaining.z))+1;
    const reach=half+radius+skin,lowX=Math.min(p.x,p.x+remaining.x),highX=Math.max(p.x,p.x+remaining.x),lowZ=Math.min(p.z,p.z+remaining.z),highZ=Math.max(p.z,p.z+remaining.z);
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      if(isOpen(x,z)||highX<x-reach||lowX>x+reach||highZ<z-reach||lowZ>z+reach)continue;
      const hit=sweepWall(p,remaining,x,z,half,half,radius+skin);
      if(hit&&(!first||hit.time<first.time))first=hit;
    }
    const padding=radius+skin;
    for(const wall of allTransitionWalls){
      if(highX<wall.x-wall.halfX-padding||lowX>wall.x+wall.halfX+padding||highZ<wall.z-wall.halfZ-padding||lowZ>wall.z+wall.halfZ+padding)continue;
      const hit=sweepWall(p,remaining,wall.x,wall.z,wall.halfX,wall.halfZ,padding);
      if(hit&&(!first||hit.time<first.time))first=hit;
    }
    if(!first){p={x:p.x+remaining.x,z:p.z+remaining.z};path.push(p);break;}
    p={x:p.x+remaining.x*first.time,z:p.z+remaining.z*first.time};path.push(p);contacts.push(first);
    remaining={x:remaining.x*(1-first.time),z:remaining.z*(1-first.time)};
    const inward=remaining.x*first.nx+remaining.z*first.nz;
    if(inward<0){remaining.x-=inward*first.nx;remaining.z-=inward*first.nz;}
  }
  return {position:p,path,contacts};
}

// Keyboard acceleration stays in the player's frame of reference when looking around.
// The swept collision solver still receives world-space velocity and checks the entire path.
export function steerVelocity(velocity,previousHeading,heading,amount=1){
  if(!Number.isFinite(previousHeading)||!Number.isFinite(heading))return velocity;
  const delta=Math.atan2(Math.sin(heading-previousHeading),Math.cos(heading-previousHeading))*Math.max(0,Math.min(1,amount));
  const c=Math.cos(delta),s=Math.sin(delta);
  return {x:velocity.x*c+velocity.z*s,z:velocity.z*c-velocity.x*s};
}

export function movementVelocity(current,input,tuning,dt){
  const length=Math.hypot(input.x,input.z),divisor=Math.max(1,length),run=Boolean(input.run&&length>.001);
  const maxSpeed=run?tuning.sprintSpeed:tuning.playerSpeed;
  const target=length>.001?{x:input.x/divisor*maxSpeed,z:input.z/divisor*maxSpeed}:{x:0,z:0};
  const speed=Math.hypot(current.x,current.z),wanted=Math.hypot(target.x,target.z),ramp=run?tuning.sprintStart:tuning.walkStart;
  if(tuning.movementInertia===0){
    const next=length>.001?Math.min(maxSpeed,speed+maxSpeed/Math.max(.001,ramp)*dt):0;
    return {x:input.x/divisor*next,z:input.z/divisor*next};
  }
  const turning=speed>.001&&wanted>.001&&(current.x*target.x+current.z*target.z)/(speed*wanted)<.999;
  const slowing=wanted<speed-.001;
  const rate=turning||slowing?Math.max(tuning.sprintSpeed,tuning.playerSpeed)/tuning.movementInertia:maxSpeed/Math.max(.001,ramp);
  const dx=target.x-current.x,dz=target.z-current.z,difference=Math.hypot(dx,dz),blend=difference>EPS?Math.min(1,rate*dt/difference):1;
  return {x:current.x+dx*blend,z:current.z+dz*blend};
}
