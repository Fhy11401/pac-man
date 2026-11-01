import {ENTRY_GATE,RULES,distance,gateWall,isInSafeRoom} from './world.js';
import {hasMazeSight} from './visibility.js';

export const ENTRY_BREAK_SECONDS=.8;
const emptyWalls=Object.freeze([]),wallsByWidth=new Map();
const outward={x:ENTRY_GATE.outside.x-ENTRY_GATE.inside.x,z:ENTRY_GATE.outside.z-ENTRY_GATE.inside.z};
export function entryCollisionWalls(game){
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
