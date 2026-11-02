import {securityRoomFurniture} from './security-room-layout.js';
import {distance} from './world.js';

export const ITEMS=Object.freeze({
  stick:{name:'曲球棍 / Hockey Stick',description:'正当防卫 / Self-defense'},
  stethoscope:{name:'听诊器 / Stethoscope',description:'隔墙有耳 / Walls Have Ears'},
});
export const STUN_SECONDS=5,GET_UP_SECONDS=.8,STRIKE_RANGE=.85;
export function createRoomItems(random=Math.random){
  const rooms=securityRoomFurniture().map(({room})=>room.id);
  for(let i=rooms.length-1;i>0;i--){const j=Math.floor(Math.max(0,Math.min(.999999,random()))*(i+1));[rooms[i],rooms[j]]=[rooms[j],rooms[i]];}
  return ['stick','stethoscope'].slice(0,rooms.length).map((kind,i)=>({id:`room-item-${i}`,roomId:rooms[i],kind}));
}
// Match the visible item on the existing desk; all positions remain in map cells.
export function roomItemPoint(item,width){
  const entry=securityRoomFurniture(width).find(p=>p.room.id===item.roomId);
  return entry?{x:entry.desk.x,z:entry.desk.z}:null;
}
export function canUseStick(game,sight,passive=false){
  const b=game.blackout;
  if(game.phase!=='playing'||b?.inventory!=='stick'||b.knockdown)return false;
  if(!passive&&(b.hidden||b.bedTransition||b.monitor||b.monitorConnecting||b.phoneOpen||b.introLighting))return false;
  const d=distance(game.player,game.enemy);
  if(d>(passive?1.2:STRIKE_RANGE)||!sight(game,game.player,game.enemy))return false;
  return passive||d<.01||(-Math.sin(b.heading)*(game.enemy.x-game.player.x)-Math.cos(b.heading)*(game.enemy.z-game.player.z))/d>.15;
}
export function useStick(game,sight,passive=false){
  if(!canUseStick(game,sight,passive))return false;
  const b=game.blackout;
  b.monitor=false;b.monitorConnecting=0;b.phoneOpen=false;
  b.inventory=null;b.knockdown={elapsed:0,heading:b.enemyHeading};b.enemySpeedScale*=.9;
  b.strikeAt=game.elapsed;b.lastItemEvent=passive?'自动防卫 / AUTO DEFENSE':'命中 / HIT';
  b.enemyMode='search';b.searchRemaining=4;b.enemyTarget=null;b.investigationKind=null;
  b.enemyRoomSearch=null;b.knownBed=null;b.knownLocker=null;b.phoneTasks=[];
  game.enemyNext=null;game.enemyVelocity={x:0,z:0};
  for(const door of Object.values(b.roomDoors)){door.bashing=false;}
  game.events.push('item-strike');return true;
}
export function stepKnockdown(game,dt){
  const b=game.blackout;
  if(!b.knockdown)return false;
  b.knockdown.elapsed+=dt;game.enemyVelocity={x:0,z:0};
  for(const door of Object.values(b.roomDoors))door.bashing=false;
  if(b.knockdown.elapsed>=STUN_SECONDS+GET_UP_SECONDS-1e-8){b.knockdown=null;b.senseClock=0;game.events.push('enemy-recovered');}
  return true;
}
export function exchangeRoomItem(game,id){
  const b=game.blackout,item=b.roomItems.find(p=>p.id===id);
  if(!item?.kind)return false;
  const next=item.kind;item.kind=b.inventory;b.inventory=next;
  b.lastItemEvent=ITEMS[next].name;game.events.push('item-pickup');return true;
}
export function knockdownPose(elapsed){
  const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const down=ease(elapsed/.28)*(1-ease((elapsed-STUN_SECONDS)/GET_UP_SECONDS));
  return {angle:-Math.PI*.47*down,lift:.24*down,fold:down};
}
