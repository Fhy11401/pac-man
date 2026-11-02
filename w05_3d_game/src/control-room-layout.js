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
  const roomDepth=(alongX?SAFE_ROOM.maxZ-SAFE_ROOM.minZ:SAFE_ROOM.maxX-SAFE_ROOM.minX)*CELL_SIZE+width;
  const chairX=0,chairZ=2.15,noteX=-deskWidth/2+.16,noteZ=roomDepth/2;
  return{anchor,angle,deskWidth,depth,deskScale,chairX,chairZ,noteX,noteZ,notePoint:point(noteX,noteZ),walls:[obstacle('security-desk',0,.43*deskScale,deskWidth,.86*deskScale),obstacle('security-chair',chairX,chairZ,.62,.62),obstacle('property-table',noteX,noteZ,.68,.60)]};
}

// Every television faces the same seated operator. Dimensions are world metres.
export function controlMonitorLayout(layout,ceilingHeight=2.7){
  const spacing=layout.deskWidth/3,screenWidth=spacing-.19,screenHeight=Math.min(screenWidth*9/16,(ceilingHeight-1.465)/2.5);
  const channels=[1,2,3,4,0,5,6,7,8];
  return channels.map((channel,i)=>{const x=(i%3-1)*spacing,z=.36+Math.abs(x)*.28;
    const y=1.08+Math.floor(i/3)*(screenHeight+.12);
    return{channel,x,z,y,pitch:Math.atan2(y-1.25,Math.hypot(layout.chairX-x,layout.chairZ-z)),yaw:Math.atan2(layout.chairX-x,layout.chairZ-z),width:screenWidth,height:screenHeight};});
}

export function controlRoomNotePoint(width){return controlRoomLayout(width).notePoint;}
