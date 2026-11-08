import {BLACKOUT_LAYOUT,BLACKOUT_RULES} from './blackout-layout.js';
import {CELL_SIZE} from './world.js';

export const ROOM_BED_SIZE=Object.freeze({width:1.20,length:2.00});
export const ROOM_BED_STRUCTURE=Object.freeze({underside:.40,railHeight:.12,deckTop:.54,mattressTop:.735,eyeHeight:.23});
export const ROOM_DESK_SIZE=Object.freeze({width:.92,depth:.30});

// Physical footprints are shared by rendering, capsule collision and room AI.
// The beds lie between the two column centres, leaving both side aisles clear.
export function securityRoomFurniture(width=BLACKOUT_RULES.corridorWidth){
  if(!Number.isFinite(width)||width<=0||width>CELL_SIZE)throw new RangeError('Invalid room width');
  return(BLACKOUT_LAYOUT.rooms??[]).map(room=>{
    const bounds=room.bounds,north=room.door.inside.z>=(bounds.minZ+bounds.maxZ)/2;
    const back=north?bounds.minZ-width/(2*CELL_SIZE):bounds.maxZ+width/(2*CELL_SIZE);
    const bed={id:`${room.id}-bed`,type:'furniture',x:bounds.minX+.5,z:back+(north?1:-1)*(ROOM_BED_SIZE.length/2+.025)/CELL_SIZE,halfX:ROOM_BED_SIZE.width/(2*CELL_SIZE),halfZ:ROOM_BED_SIZE.length/(2*CELL_SIZE),angle:north?0:Math.PI};
    const phone=BLACKOUT_LAYOUT.phones.find(item=>item.room===room.room),wall=phone.wall;
    const desk={id:`${room.id}-desk`,type:'furniture',x:phone.x+wall.x*(width-ROOM_DESK_SIZE.depth)/(2*CELL_SIZE),z:phone.z+wall.z*(width-ROOM_DESK_SIZE.depth)/(2*CELL_SIZE),halfX:(wall.x?ROOM_DESK_SIZE.depth:ROOM_DESK_SIZE.width)/(2*CELL_SIZE),halfZ:(wall.z?ROOM_DESK_SIZE.depth:ROOM_DESK_SIZE.width)/(2*CELL_SIZE),angle:Math.atan2(-wall.x,-wall.z)};
    return{room,phone,bed,desk};
  });
}

export function roomCollisionWalls(width=BLACKOUT_RULES.corridorWidth){return securityRoomFurniture(width).flatMap(({bed,desk})=>[bed,desk].map(({angle,...wall})=>wall));}
