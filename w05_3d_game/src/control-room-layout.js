import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {SAFE_ROOM,CELL_SIZE} from './world.js';

export function controlRoomLayout(width){
  const site=BLACKOUT_LAYOUT.console,n=site.wall,alongX=Boolean(n.z);
  const span=((alongX?SAFE_ROOM.maxX-SAFE_ROOM.minX:SAFE_ROOM.maxZ-SAFE_ROOM.minZ)*CELL_SIZE)+width;
  const deskWidth=Math.min(3.2,span-.4),depth=.82,deskScale=.64;
  const anchor={x:site.x+n.x*width/(2*CELL_SIZE),z:site.z+n.z*width/(2*CELL_SIZE)};
  if(alongX)anchor.x=(SAFE_ROOM.minX+SAFE_ROOM.maxX)/2;else anchor.z=(SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2;
  const angle=Math.atan2(-n.x,-n.z),c=Math.cos(angle),s=Math.sin(angle);
  const point=(x,z)=>({x:anchor.x+(x*c+z*s)/CELL_SIZE,z:anchor.z+(-x*s+z*c)/CELL_SIZE});
  const obstacle=(id,x,z,w,d)=>({...point(x,z),id,type:'furniture',halfX:(Math.abs(c)*w+Math.abs(s)*d)/(2*CELL_SIZE),halfZ:(Math.abs(s)*w+Math.abs(c)*d)/(2*CELL_SIZE)});
  const chairX=0,chairZ=1.27;
  return{anchor,angle,deskWidth,depth,deskScale,chairX,chairZ,walls:[obstacle('security-desk',0,.43*deskScale,deskWidth,.86*deskScale),obstacle('security-chair',chairX,chairZ,.62,.62)]};
}
