import {MAP,isOpen,wallInset,distance,transitionWalls} from './world.js';
import {DEFAULT_TUNING} from './tuning.js';

// Intersect the whole segment with the actual expanded wall footprint, including narrow corners.
export function hasMazeSight(a,b,width=DEFAULT_TUNING.corridorWidth){
  const half=.5+wallInset(width),dx=b.x-a.x,dz=b.z-a.z;
  const minX=Math.max(0,Math.ceil(Math.min(a.x,b.x)-half)),maxX=Math.min(MAP[0].length-1,Math.floor(Math.max(a.x,b.x)+half));
  const minZ=Math.max(0,Math.ceil(Math.min(a.z,b.z)-half)),maxZ=Math.min(MAP.length-1,Math.floor(Math.max(a.z,b.z)+half));
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
    if(isOpen(x,z))continue;
    let enter=0,leave=1;
    for(const [origin,delta,center] of [[a.x,dx,x],[a.z,dz,z]]){
      if(Math.abs(delta)<1e-12){if(origin<center-half||origin>center+half){leave=-1;break;}continue;}
      const t1=(center-half-origin)/delta,t2=(center+half-origin)/delta;
      enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
    }
    if(enter<=leave)return false;
  }
  for(const wall of transitionWalls(width)){
    let enter=0,leave=1;
    for(const [origin,delta,center,halfSize] of [[a.x,dx,wall.x,wall.halfX],[a.z,dz,wall.z,wall.halfZ]]){
      if(Math.abs(delta)<1e-12){if(origin<center-halfSize||origin>center+halfSize){leave=-1;break;}continue;}
      const t1=(center-halfSize-origin)/delta,t2=(center+halfSize-origin)/delta;
      enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
    }
    if(enter<=leave)return false;
  }
  return true;
}
export function dangerGlowOpacity(player,enemy,width){
  const d=distance(player,enemy);return d<2.7&&hasMazeSight(player,enemy,width)?(1-d/2.7)*.4:0;
}
