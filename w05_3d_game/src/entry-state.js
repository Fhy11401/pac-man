import {ENTRY_GATE,RULES,CELL_SIZE,distance,gateWall,isInSafeRoom,isOpen,wallInset} from './world.js';
import {controlRoomLayout} from './control-room-layout.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {roomCollisionWalls} from './security-room-layout.js';
import {hallFurnitureWalls} from './hall-layout.js';
import {hasMazeSight} from './visibility.js';

export const ENTRY_BREAK_SECONDS=.8;
const emptyWalls=Object.freeze([]),wallsByWidth=new Map();
const blackoutWalls=new Map(),furnitureByWidth=new Map();
export function roomFurnitureWalls(width){
  if(!furnitureByWidth.has(width)){
    if(furnitureByWidth.size>=16)furnitureByWidth.delete(furnitureByWidth.keys().next().value);
    furnitureByWidth.set(width,Object.freeze([...controlRoomLayout(width).walls,...roomCollisionWalls(width),...hallFurnitureWalls(BLACKOUT_LAYOUT.halls??[],width,CELL_SIZE,isOpen)].map(Object.freeze)));
  }
  return furnitureByWidth.get(width);
}
export function roomDoorWall(room,width){
  const door=room.door,half=.5+wallInset(width);
  return Object.freeze({id:room.id,type:'room-door',x:door.x,z:door.z,halfX:door.axis==='x'?.03:half,halfZ:door.axis==='x'?half:.03});
}
const outward={x:ENTRY_GATE.outside.x-ENTRY_GATE.inside.x,z:ENTRY_GATE.outside.z-ENTRY_GATE.inside.z};
export function entryCollisionWalls(game){
  if(game.blackout){
    const rooms=(BLACKOUT_LAYOUT.rooms??[]).filter(room=>(game.blackout.roomDoors?.[room.id]?.progress??1)>1e-6),closed=game.blackout.doorProgress>1e-6;
    const width=game.tuning.corridorWidth,key=`${width}/${Number(closed)}/${rooms.map(room=>room.id).join(',')}`;
    if(!blackoutWalls.has(key)){
      if(blackoutWalls.size>=64)blackoutWalls.delete(blackoutWalls.keys().next().value);
      blackoutWalls.set(key,Object.freeze([...(closed?[gateWall(width)]:[]),...rooms.map(room=>roomDoorWall(room,width)),...roomFurnitureWalls(width)]));
    }
    return blackoutWalls.get(key);
  }
  if(game.entryOpened)return emptyWalls;
  const width=game.tuning.corridorWidth;
  if(!wallsByWidth.has(width)){
    if(wallsByWidth.size>=16)wallsByWidth.delete(wallsByWidth.keys().next().value);
    wallsByWidth.set(width,Object.freeze([gateWall(width)]));
  }
  return wallsByWidth.get(width);
}
export function canReachEntry(game){
  return !game.entryOpened&&isInSafeRoom(game.player)&&distance(game.player,ENTRY_GATE)<=.72&&
    hasMazeSight(game.player,ENTRY_GATE.inside,game.tuning.corridorWidth)&&hasMazeSight(game.player,ENTRY_GATE,game.tuning.corridorWidth);
}
export function stepEntry(game,input,dt){
  if(!game.entryOpened){
    const length=Math.hypot(input.x,input.z),planeDistance=(ENTRY_GATE.x-game.player.x)*outward.x+(ENTRY_GATE.z-game.player.z)*outward.z;
    const forward=!Number.isFinite(input.heading)||-Math.sin(input.heading)*input.x-Math.cos(input.heading)*input.z>length*.7;
    const charging=input.run&&forward&&length>.1&&input.x*outward.x+input.z*outward.z>length*.7&&
      planeDistance<=game.tuning.playerRadius+.03+.08;
    if(canReachEntry(game)&&(input.interact||charging)){
      game.entryOpened=true;game.entryBreakTime=0;game.enemyDelay=RULES.enemyDelay;game.events.push('boards-break');
    }
  }
  if(game.entryOpened)game.entryBreakTime=Math.min(ENTRY_BREAK_SECONDS,game.entryBreakTime+dt);
}
