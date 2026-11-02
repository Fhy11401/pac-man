import {ITEMS,createRoomItems,roomItemPoint,exchangeRoomItem,useStick,stepKnockdown} from './room-items.js';
import {POWER_SECTORS,circuitProgress,isAreaPowered} from './power-grid.js';
import {BLACKOUT_LAYOUT as L,BLACKOUT_RULES as R} from './blackout-layout.js';
import {ENTRY_GATE,SAFE_ROOM,RULES,START_YAW,cell,key,neighbors,distance,isOpen,isInSafeRoom,pathTo,gateWall} from './world.js';
import {hasMazeSight} from './visibility.js';
import {slideMove} from './movement.js';
import {entryCollisionWalls,roomDoorWall,roomFurnitureWalls} from './entry-state.js';
import {getBedHideSpots,bedTransitionPose,BED_HIDE_SECONDS} from './bed-layout.js';

const EPS=1e-6,DOOR_SECONDS=.45;
export const MONITOR_CONNECT_SECONDS=R.monitorConnectSeconds;
export const ROOM_DOOR_TIMING=Object.freeze({quickThreshold:R.roomDoorTapThreshold,quickDelay:R.roomDoorQuickDelay,quietHold:R.roomDoorHoldSeconds,animation:R.roomDoorSeconds,enemyWait:R.roomDoorBashSeconds,bashInterval:R.roomDoorBashInterval});
const copy=p=>({x:p.x,z:p.z});
const facing=(heading,from,to,cosine)=>{
  const d=distance(from,to);
  return d<EPS||!Number.isFinite(heading)||(-Math.sin(heading)*(to.x-from.x)-Math.cos(heading)*(to.z-from.z))/d>=cosine;
};
function crossesWall(a,b,wall){
  let enter=0,leave=1;
  for(const [axis,half] of [['x',wall.halfX],['z',wall.halfZ]]){
    const delta=b[axis]-a[axis],low=wall[axis]-half,high=wall[axis]+half;
    if(Math.abs(delta)<EPS){if(a[axis]<low||a[axis]>high)return false;continue;}
    const t0=(low-a[axis])/delta,t1=(high-a[axis])/delta;
    enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));
    if(enter>leave)return false;
  }
  return true;
}
export function blackoutSight(game,a,b,ignoreDoor=null){
  if(!hasMazeSight(a,b,game.tuning.corridorWidth))return false;
  return !game.blackout||!entryCollisionWalls(game).some(wall=>(wall.type!=='furniture'||wall.blocksSight)&&wall.id!==ignoreDoor&&crossesWall(a,b,wall));
}
const navigationCache=new Map();
function furnitureBlocks(a,b,width){
  const furniture=roomFurnitureWalls(width),radius=RULES.enemyRadius;
  if(!furniture.some(wall=>crossesWall(a,b,{...wall,halfX:wall.halfX+radius,halfZ:wall.halfZ+radius})))return false;
  return distance(slideMove(a,{x:b.x-a.x,z:b.z-a.z},radius,width,furniture).position,b)>EPS;
}
export function blackoutPath(game,from,to){
  const width=game.tuning.corridorWidth,start=cell(from),goal=cell(to),token=`${width}/${key(start)}/${key(goal)}`;
  if(navigationCache.has(token))return navigationCache.get(token);
  let points=pathTo(start,goal);
  if(points.slice(1).some((p,i)=>furnitureBlocks(points[i],p,width))){
    const queue=[start],previous=new Map([[key(start),null]]);
    for(let head=0;head<queue.length&&!previous.has(key(goal));head++)for(const n of neighbors(queue[head])){
      if(previous.has(key(n))||furnitureBlocks(queue[head],n,width))continue;
      previous.set(key(n),queue[head]);queue.push(n);
    }
    points=[];
    if(previous.has(key(goal)))for(let p=goal;p;p=previous.get(key(p)))points.push(copy(p));
    points.reverse();
  }
  if(navigationCache.size>=192)navigationCache.delete(navigationCache.keys().next().value);
  navigationCache.set(token,points);return points;
}
function route(game,from,to){
  const points=blackoutPath(game,from,to);
  for(const wall of entryCollisionWalls(game))if(wall.type!=='furniture')for(let i=1;i<points.length;i++)if(crossesWall(points[i-1],points[i],wall))return [];
  return points;
}
function acousticDistance(game,from,to,range){
  if(distance(from,to)>range)return Infinity;
  if(blackoutSight(game,from,to))return distance(from,to);
  const points=pathTo(from,to);if(!points.length)return Infinity;
  let turns=0,attenuation=0;
  for(const wall of entryCollisionWalls(game))if(wall.type!=='furniture'&&points.slice(1).some((p,i)=>crossesWall(points[i],p,wall))){
    if(wall.type!=='room-door')return Infinity;
    attenuation+=2.2;
  }
  for(let i=2;i<points.length;i++)if(points[i].x-points[i-1].x!==points[i-1].x-points[i-2].x||points[i].z-points[i-1].z!==points[i-1].z-points[i-2].z)turns++;
  return distance(from,points[0])+points.length-1+distance(to,points.at(-1))+turns*.65+attenuation;
}
function noise(game,point,range,kind){
  const b=game.blackout;
  b.sounds.push({id:++b.soundSerial,point:copy(point),range,kind,remaining:.3});
}
function setTarget(game,point,mode){
  const b=game.blackout;
  // Finish the already selected corridor edge before planning a new target.
  // Repeated footsteps must not pull an off-centre enemy back to the previous cell.
  b.enemyTarget=copy(point);b.enemyMode=mode;if(mode!=='investigate')b.investigationKind=null;
}
export function createBlackoutState(random=Math.random){
  return {
    inventory:null,roomItems:createRoomItems(random),knockdown:null,enemySpeedScale:1,strikeAt:-Infinity,
    powerOn:false,circuits:Object.fromEntries(POWER_SECTORS.map(p=>[p.id,0])),activeRepair:null,lastRestored:null,repairProgress:0,repairing:false,doorClosed:true,doorProgress:1,
    nightVision:false,flashlight:false,battery:R.batterySeconds,hidden:null,bedHide:null,bedTransition:null,bedSerial:0,knownBed:null,phoneOpen:false,monitorConnecting:0,monitor:false,
    phones:L.phones.map(()=>({remaining:0,cooldown:0,pulse:0})),batteries:new Set(),
    roomDoors:Object.fromEntries((L.rooms??[]).map(room=>[room.id,{closed:true,progress:1,hold:0,mode:null,wait:0,enemyWait:0,releaseGrace:0,bashing:false,bashTime:0,bashProgress:0,bashPulse:0,bashBeat:0}])),activeRoomDoor:null,
    enemyMode:'patrol',investigationKind:null,enemyHeading:-Math.PI/2,enemyTarget:copy(L.patrol[0]),
    lastKnown:null,lastHeard:null,lastLight:null,knownLocker:null,searchRemaining:0,patrolIndex:0,
    hasLeftRoom:false,heading:START_YAW,senseClock:0,stepClock:0,repairClock:0,
    sounds:[],soundSerial:0,lastSoundId:0,enemyRoomSearch:null,phoneTasks:[],phoneSerial:0,lastBashDoorId:null,
  };
}
function inControlRoom(p){
  return isInSafeRoom(p)&&p.x>=SAFE_ROOM.minX-.5&&p.x<=SAFE_ROOM.maxX+.5&&p.z>=SAFE_ROOM.minZ-.5;
}
function canReach(game,point,heading,range=.72){
  return distance(game.player,point)<=range&&blackoutSight(game,game.player,point)&&facing(heading,game.player,point,.05);
}
function fixturePoint(fixture){return{x:fixture.x+(fixture.wall?.x??0)*.28,z:fixture.z+(fixture.wall?.z??0)*.28};}
function reachableRoomDoor(game,room,heading){
  return distance(game.player,room.door)<=.8&&facing(heading,game.player,room.door,.05)&&blackoutSight(game,game.player,room.door,room.id);
}
const bedSpotCache=new Map();
function bedSpots(game){
  const width=game.tuning.corridorWidth;
  if(!bedSpotCache.has(width)){
    if(bedSpotCache.size>=16)bedSpotCache.delete(bedSpotCache.keys().next().value);
    bedSpotCache.set(width,getBedHideSpots(width));
  }
  return bedSpotCache.get(width);
}
function roomAt(point){
  return (L.rooms??[]).find(({bounds:b})=>point.x>=b.minX-.45&&point.x<=b.maxX+.45&&point.z>=b.minZ-.45&&point.z<=b.maxZ+.45);
}
function reachableBed(game,spot,heading){
  if(roomAt(game.player)?.id!==spot.roomId||!canReach(game,spot.target,heading,.9))return false;
  if(!spot.approaches.some(p=>distance(game.player,p)<=.32))return false;
  const walls=entryCollisionWalls(game).filter(wall=>wall.id!==spot.bedId);
  const end=slideMove(game.player,{x:spot.target.x-game.player.x,z:spot.target.z-game.player.z},game.tuning.playerRadius,game.tuning.corridorWidth,walls).position;
  return distance(end,spot.target)<EPS;
}
function bedConcealed(game){return Boolean(game.blackout.bedHide&&!game.blackout.bedTransition);}
export function blackoutPlayerWalls(game){
  const walls=entryCollisionWalls(game),bed=game.blackout?.bedHide;
  // Only an explicit crawl can pass beneath this bed. Enemy bodies and ordinary
  // walking continue to use the complete, unchanged furniture collider.
  return bed?walls.filter(wall=>wall.id!==bed.bedId):walls;
}
function bedApproach(game,spot){
  return spot.approaches.reduce((best,p)=>{
    const path=blackoutPath(game,game.enemy,p),cost=path.length?path.length+distance(game.enemy,path[0])+distance(path.at(-1),p):Infinity;
    return !best||cost<best.cost?{point:p,cost}:best;
  },null)?.point;
}
function trackKnownBed(game,spot){
  const b=game.blackout,point=bedApproach(game,spot);
  if(!point)return;
  b.knownBed=spot.id;b.phoneTasks=[];
  b.enemyRoomSearch={roomId:spot.roomId,reason:'witness',phase:'approach',points:[],index:0,lookRemaining:0};
  b.lastKnown=copy(spot.target);setTarget(game,point,'chase');
}
function operateBed(game,id){
  const b=game.blackout;
  if(b.bedTransition)return;
  if(b.bedHide){
    b.bedTransition={id:`${b.bedHide.id}:${++b.bedSerial}`,from:copy(game.player),to:copy(b.bedHide.exitPoint),progress:0,entering:false};
    game.events.push('unhide');return;
  }
  const spot=bedSpots(game).find(p=>p.id===id);
  if(!spot||!reachableBed(game,spot,b.heading))return;
  const witnessed=blackoutCanSeePlayer(game)||(distance(game.player,game.enemy)<game.tuning.playerRadius+RULES.enemyRadius&&blackoutSight(game,game.player,game.enemy));
  cancelRoomHold(game);b.flashlight=false;
  b.bedHide={id:spot.id,roomId:spot.roomId,bedId:spot.bedId,target:copy(spot.target),exitPoint:copy(game.player),eyeHeight:spot.eyeHeight};
  b.hidden=spot.id;b.bedTransition={id:`${spot.id}:${++b.bedSerial}`,from:copy(game.player),to:copy(spot.target),progress:0,entering:true};
  game.events.push('hide');
  if(witnessed)trackKnownBed(game,spot);
}
function updateBedTransition(game,dt){
  const b=game.blackout,t=b.bedTransition;if(!t)return;
  t.progress=Math.min(1,t.progress+dt/BED_HIDE_SECONDS);
  game.player=bedTransitionPose(t.from,t.to,t.progress,t.entering).position;
  if(t.progress>=1-EPS){
    game.player=copy(t.to);b.bedTransition=null;
    if(!t.entering){b.hidden=null;b.bedHide=null;}
  }
}
function startRoomSearchTask(game,room,reason,point=room.door.inside){
  game.blackout.investigationKind=reason==='phone'?'phone':null;
  game.blackout.enemyRoomSearch={roomId:room.id,reason,phase:'approach',points:[],index:0,lookRemaining:0};
  setTarget(game,point,reason==='witness'?'chase':'investigate');
}
function startNextPhoneTask(game){
  const b=game.blackout,task=b.phoneTasks.shift();if(!task)return false;
  const room=L.rooms.find(r=>r.id===task.roomId);if(!room)return false;
  b.lastHeard={point:copy(task.point),kind:'phone',id:task.id};startRoomSearchTask(game,room,'phone');
  b.enemyRoomSearch.clueId=task.id;return true;
}
function hearPhoneCall(game,index){
  const b=game.blackout,phone=L.phones[index],room=L.rooms.find(r=>r.room===phone?.room);
  if(!room||b.enemyMode==='investigate'&&b.investigationKind==='repair'||b.enemyMode==='chase'||b.enemyMode==='locker'||b.knownBed||blackoutCanSeePlayer(game))return;
  // A dial is one hotel-wide clue, not a recurring audio pulse. Finish the
  // current room inspection before handling the other room's pending call.
  if(b.enemyRoomSearch?.roomId===room.id&&b.enemyRoomSearch.reason==='phone'||b.phoneTasks.some(t=>t.roomId===room.id))return;
  b.phoneTasks.push({id:++b.phoneSerial,roomId:room.id,point:copy(phone)});
  if(b.enemyRoomSearch?.reason!=='phone')startNextPhoneTask(game);
}
export function getBlackoutInteraction(game,heading=game.blackout?.heading){
  const b=game.blackout;if(!b||game.phase!=='playing')return null;
  if(b.monitor||b.monitorConnecting>0)return{id:'console',kind:'monitor',label:b.monitor?'关闭监控':'放下手机',point:copy(game.player)};
  if(b.phoneOpen)return null;
  if(b.bedHide)return{id:b.hidden,kind:'bed',label:b.bedTransition?'正在移动…':'离开床底',point:copy(b.bedHide.exitPoint),...(b.bedTransition?{progress:b.bedTransition.progress}:{})};
  if(b.hidden)return{id:b.hidden,kind:'locker',label:'离开储物柜',point:copy(game.player)};
  const choices=[];
  for(const item of b.roomItems)if(item.kind){
    const point=roomItemPoint(item,game.tuning.corridorWidth);
    if(point&&canReach(game,point,heading,.72))choices.push({id:item.id,kind:'item',label:`${b.inventory?'交换 / Swap':'拾取 / Pick up'} · ${ITEMS[item.kind].name}`,note:ITEMS[item.kind].description,point});
  }
  for(const spot of bedSpots(game))if(reachableBed(game,spot,heading))choices.push({id:spot.id,kind:'bed',label:'躲到床底',point:copy(spot.target)});
  // The door's own collider must not hide its handle on either side.
  if(distance(game.player,ENTRY_GATE)<=.76&&hasMazeSight(game.player,ENTRY_GATE,game.tuning.corridorWidth)&&facing(heading,game.player,ENTRY_GATE,.05)){
    choices.push({id:'door',kind:'door',label:b.doorClosed?'打开机械门':'关闭机械门',point:copy(ENTRY_GATE)});
  }
  for(const [fixture,kind,label] of [...POWER_SECTORS.map(p=>[p,'power',`${p.number} · ${p.label} · ${circuitProgress(b,p)>=1?'供电已恢复':'按住 E 维修'}`]),[L.console,'monitor','打开监控'],...L.lockers.map(p=>[p,'locker','进入储物柜'])]){
    const point=fixturePoint(fixture);
    if(canReach(game,point,heading))choices.push({id:fixture.id,kind,label,point,...(kind==='power'?{progress:circuitProgress(b,fixture),complete:circuitProgress(b,fixture)>=1}:{})});
  }
  for(const battery of L.batteries)if(!b.batteries.has(battery.id)&&canReach(game,battery,heading)){
    choices.push({id:battery.id,kind:'battery',label:b.battery>=R.batterySeconds-EPS?'夜视电池已满 · 无需补充':`补充夜视电池（+${R.batteryPickup} 秒）`,point:copy(battery)});
  }
  for(const room of L.rooms??[])if(reachableRoomDoor(game,room,heading)){
    const state=b.roomDoors[room.id],verb=state.closed?'开门':'关门';
    choices.push({id:room.id,kind:'room-door',point:copy(room.door),label:state.mode==='hold'&&state.hold>=ROOM_DOOR_TIMING.quickThreshold?`按住以静音${verb} · 松开取消`:`${room.room} 客房 · 短按快速${verb} / 长按静音${verb}`,progress:state.mode==='hold'?Math.min(1,state.hold/ROOM_DOOR_TIMING.quietHold):0});
  }
  return choices.sort((a,c)=>distance(game.player,a.point)-distance(game.player,c.point))[0]??null;
}
export function blackoutCanSeePlayer(game){
  const b=game.blackout;if(!b||b.hidden&&(!b.bedHide||bedConcealed(game)))return false;
  const d=distance(game.enemy,game.player);
  if(d>R.sightRange||!blackoutSight(game,game.enemy,game.player)||!facing(b.enemyHeading+Math.PI,game.enemy,game.player,.42))return false;
  const lit=isAreaPowered(b,game.player);
  const beam=b.flashlight&&d<=R.flashlightRange&&facing(b.heading,game.player,game.enemy,Math.cos(Math.PI/6));
  return lit||beam;
}
function visibleFlashlightClue(game){
  const b=game.blackout;
  if(isAreaPowered(b,game.player)||!b.flashlight||b.hidden||b.monitor)return null;
  const direction={x:-Math.sin(b.heading),z:-Math.cos(b.heading)},pointAt=t=>({x:game.player.x+direction.x*t,z:game.player.z+direction.z*t});
  let previous=0,best=null,bestDistance=Infinity;
  // Five ground/light-hit samples per perception update. The first obstruction
  // truncates the beam, including the dynamic door; four refinements locate its lit face.
  for(const fraction of [.09,.19,.34,.6,1]){
    let extent=R.flashlightRange*fraction,point=pointAt(extent),stopped=!blackoutSight(game,game.player,point);
    if(stopped){
      let low=previous,high=extent;
      for(let i=0;i<4;i++){const middle=(low+high)/2;if(blackoutSight(game,game.player,pointAt(middle)))low=middle;else high=middle;}
      extent=Math.max(0,low-.015);point=pointAt(extent);
    }
    const d=distance(game.enemy,point);
    if(extent>.08&&d<=R.sightRange&&d<bestDistance&&facing(b.enemyHeading+Math.PI,game.enemy,point,.42)&&blackoutSight(game,game.enemy,point)){
      best=point;bestDistance=d;
    }
    if(stopped)break;
    previous=extent;
  }
  if(!best)return null;
  // A wall highlight is observable, but an enemy body cannot occupy the wall.
  // Approach from its open cell with the same swept collision geometry as movement.
  const centre=cell(best),approach=slideMove(centre,{x:best.x-centre.x,z:best.z-centre.z},RULES.enemyRadius,game.tuning.corridorWidth,entryCollisionWalls(game)).position;
  return{point:best,approach};
}
function doorOccupied(game,wall=gateWall(game.tuning.corridorWidth)){
  return [[game.player,game.tuning.playerRadius],[game.enemy,RULES.enemyRadius]].some(([p,r])=>{
    const x=Math.max(wall.x-wall.halfX,Math.min(wall.x+wall.halfX,p.x)),z=Math.max(wall.z-wall.halfZ,Math.min(wall.z+wall.halfZ,p.z));
    return Math.hypot(p.x-x,p.z-z)<r+.025;
  });
}
function cancelRoomHold(game){
  const b=game.blackout,state=b.roomDoors[b.activeRoomDoor];
  if(state?.mode==='hold'){state.mode=null;state.hold=0;state.releaseGrace=0;}
  b.activeRoomDoor=null;
}
function commitRoomDoor(game,room,quiet=false,enemy=false){
  const state=game.blackout.roomDoors[room.id],closed=enemy?false:!state.closed;
  if(closed&&doorOccupied(game,roomDoorWall(room,game.tuning.corridorWidth))){
    state.mode=null;state.hold=0;game.events.push('room-door-blocked');return false;
  }
  state.closed=closed;state.mode=null;state.hold=0;state.wait=0;state.bashing=false;
  if(closed){state.enemyWait=0;state.bashTime=0;state.bashProgress=0;state.bashBeat=0;state.bashPulse=0;}
  game.blackout.lastDoorEvent={id:room.id,quiet,enemy,closed};
  if(enemy)game.events.push('room-door');else if(quiet)game.events.push('room-door-quiet');
  return true;
}
function roomDoorAction(game,action,interaction){
  const b=game.blackout;
  if(action==='door-press'){
    cancelRoomHold(game);
    if(interaction?.kind!=='room-door')return;
    const state=b.roomDoors[interaction.id];
    if(state.mode==='quick'||(state.progress>EPS&&state.progress<1-EPS))return;
    b.activeRoomDoor=interaction.id;state.mode='hold';state.hold=0;state.releaseGrace=.25;
  }else if(action==='door-release'){
    const id=b.activeRoomDoor,room=(L.rooms??[]).find(r=>r.id===id),state=b.roomDoors[id];b.activeRoomDoor=null;
    if(!room||state?.mode!=='hold')return;
    if(state.hold<ROOM_DOOR_TIMING.quickThreshold&&reachableRoomDoor(game,room,b.heading)){
      state.mode='quick';state.wait=ROOM_DOOR_TIMING.quickDelay;state.hold=0;
      b.lastDoorEvent={id:room.id,quiet:false,enemy:false,closed:!state.closed};game.events.push('room-door');noise(game,game.player,8,'door');
    }else{state.mode=null;state.hold=0;}
  }
}
function updateRoomDoors(game,input,dt){
  const b=game.blackout;
  for(const room of L.rooms??[]){
    const state=b.roomDoors[room.id];
    state.bashPulse=Math.max(0,state.bashPulse-dt/.18);
    if(state.mode==='hold'){
      if(!reachableRoomDoor(game,room,b.heading)||b.phoneOpen||b.monitor||b.monitorConnecting>0)cancelRoomHold(game);
      else if(!input.interact){
        // A browser can deliver keydown+keyup before the next rendered frame.
        // Keep the edge until its queued release arrives, without counting it as held.
        state.releaseGrace-=dt;if(state.releaseGrace<=EPS)cancelRoomHold(game);
      }else{
        state.releaseGrace=.25;
        state.hold+=dt;
        if(state.hold>=ROOM_DOOR_TIMING.quietHold-EPS){commitRoomDoor(game,room,true);b.activeRoomDoor=null;}
      }
    }else if(state.mode==='quick'){
      state.wait=Math.max(0,state.wait-dt);if(state.wait<=EPS)commitRoomDoor(game,room);
    }
    if(state.closed&&state.progress<1&&doorOccupied(game,roomDoorWall(room,game.tuning.corridorWidth))){state.closed=false;game.events.push('room-door-blocked');}
    state.progress=Math.max(0,Math.min(1,state.progress+(state.closed?1:-1)*dt/ROOM_DOOR_TIMING.animation));
  }
}
function operateDoor(game){
  const b=game.blackout;
  if(!b.doorClosed&&doorOccupied(game)){game.events.push('door-blocked');return;}
  b.doorClosed=!b.doorClosed;game.events.push('door');noise(game,game.player,4,'door');
}
function operateLocker(game,id){
  const b=game.blackout;
  if(b.hidden){b.hidden=null;game.events.push('unhide');noise(game,game.player,1.5,'locker');return;}
  const witnessed=blackoutCanSeePlayer(game)||(distance(game.player,game.enemy)<game.tuning.playerRadius+RULES.enemyRadius&&blackoutSight(game,game.player,game.enemy));
  b.hidden=id;b.monitor=false;b.flashlight=false;
  game.events.push('hide');noise(game,game.player,1.5,'locker');
  if(witnessed){b.knownLocker=id;b.lastKnown=copy(game.player);setTarget(game,game.player,'locker');}
}
export function closeBlackoutMonitor(game){
  const b=game.blackout;if(!b||!b.monitor&&!b.monitorConnecting)return false;
  cancelRoomHold(game);b.monitor=false;b.monitorConnecting=0;b.phoneOpen=false;return true;
}
function operateMonitor(game){
  const b=game.blackout;
  if(closeBlackoutMonitor(game)){game.events.push('monitor');return;}
  b.phoneOpen=false;b.monitorConnecting=MONITOR_CONNECT_SECONDS;b.flashlight=false;b.nightVision=false;game.events.push('monitor-connect');
}
function handleAction(game,action,interaction){
  const b=game.blackout;if(!action)return;
  if(action==='office-door'){if(isInSafeRoom(game.player)&&!b.hidden&&!b.monitor&&!b.monitorConnecting)operateDoor(game);return;}
  if(action==='phone'){
    cancelRoomHold(game);b.phoneOpen=!b.phoneOpen;b.monitor=false;b.monitorConnecting=0;game.events.push('phone');return;
  }
  if(action==='phone-a'||action==='phone-b'){
    const index=action==='phone-a'?0:1,phone=b.phones[index];
    if(phone&&phone.cooldown<=0){phone.remaining=R.phoneSeconds;phone.cooldown=R.phoneCooldown;phone.pulse=0;game.events.push(action);hearPhoneCall(game,index);}
    return;
  }
  if(action==='monitor'){
    cancelRoomHold(game);operateMonitor(game);return;
  }
  if(b.monitor||b.monitorConnecting>0){if(action==='interact')operateMonitor(game);return;}
  if(action==='flashlight'||action==='nightvision'){
    if(b.hidden&&action==='flashlight')return;
    if(action==='flashlight'){b.flashlight=!b.flashlight;b.nightVision=false;}
    else{b.nightVision=!b.nightVision&&b.battery>0;b.flashlight=false;}
    game.events.push(action);return;
  }
  if(b.phoneOpen)return;
  if(action==='use-item'){useStick(game,blackoutSight);return;}
  if(action==='door-press'||action==='door-release'){roomDoorAction(game,action,interaction);return;}
  if(action!=='interact'||!interaction)return;
  if(interaction.kind==='item')exchangeRoomItem(game,interaction.id);
  if(interaction.kind==='door')operateDoor(game);
  if(interaction.kind==='locker')operateLocker(game,interaction.id);
  if(interaction.kind==='bed')operateBed(game,interaction.id);
  if(interaction.kind==='monitor')operateMonitor(game);
  if(interaction.kind==='battery'&&b.battery<R.batterySeconds-EPS&&!b.batteries.has(interaction.id)){
    b.battery=Math.min(R.batterySeconds,b.battery+R.batteryPickup);b.batteries.add(interaction.id);game.events.push('battery');
  }
}
export function beginBlackoutStep(game,input,dt){
  const b=game.blackout;
  if(Number.isFinite(input.heading))b.heading=input.heading;
  const interaction=getBlackoutInteraction(game,b.heading);
  handleAction(game,input.action,interaction);
  updateBedTransition(game,dt);
  if(b.monitorConnecting>0){
    b.monitorConnecting=Math.max(0,b.monitorConnecting-dt);
    if(b.monitorConnecting<=EPS){b.monitorConnecting=0;b.monitor=true;game.events.push('monitor');}
  }
  if(b.doorClosed&&b.doorProgress<1&&doorOccupied(game)){b.doorClosed=false;game.events.push('door-blocked');}
  b.doorProgress=Math.max(0,Math.min(1,b.doorProgress+(b.doorClosed?1:-1)*dt/DOOR_SECONDS));
  game.entryOpened=b.doorProgress<=EPS;
  updateRoomDoors(game,input,dt);
  for(let i=0;i<b.phones.length;i++){
    const phone=b.phones[i];phone.cooldown=Math.max(0,phone.cooldown-dt);
    if(phone.remaining>0){
      phone.pulse=Math.max(0,phone.pulse-dt);
      phone.remaining=Math.max(0,phone.remaining-dt);
    }
  }
  const panel=POWER_SECTORS.find(p=>p.id===interaction?.id);
  const repairing=Boolean(panel&&circuitProgress(b,panel)<1&&!b.powerOn&&!b.hidden&&!b.phoneOpen&&!b.monitor&&!b.monitorConnecting&&input.interact&&interaction?.kind==='power');
  if(repairing){
    if(!b.repairing||b.activeRepair!==panel.id){game.events.push('repair');b.repairClock=0;}
    b.activeRepair=panel.id;b.circuits[panel.id]=Math.min(1,b.circuits[panel.id]+dt/R.repairSeconds);b.repairClock-=dt;
    if(b.repairClock<=0){noise(game,panel,0,'repair');b.repairClock=.55;}
    if(b.circuits[panel.id]>=1-EPS){b.circuits[panel.id]=1;b.lastRestored=panel.id;game.events.push('sector-on');}
    b.repairProgress=POWER_SECTORS.reduce((sum,p)=>sum+b.circuits[p.id],0)/POWER_SECTORS.length;
    if(POWER_SECTORS.every(p=>b.circuits[p.id]>=1)){b.powerOn=true;game.events.push('power-on');}
  }
  b.repairing=repairing&&!b.powerOn&&circuitProgress(b,panel)<1;
  if(b.nightVision){
    b.battery=Math.max(0,b.battery-dt);
    if(b.battery<=0){b.nightVision=false;game.events.push('battery-empty');}
  }
  if(b.hidden||b.phoneOpen||b.monitor||b.monitorConnecting>0){
    game.motionVelocity={x:0,z:0};game.moveSpeed=0;game.sprinting=false;
    return {...input,x:0,z:0,run:false};
  }
  return input;
}
function perceive(game,dt){
  const b=game.blackout;
  b.senseClock-=dt;if(b.senseClock>0)return;
  b.senseClock=.1;
  const visible=blackoutCanSeePlayer(game);
  if(visible){
    b.knownLocker=null;b.phoneTasks=[];
    if(b.bedHide){
      if(b.knownBed!==b.bedHide.id)trackKnownBed(game,bedSpots(game).find(spot=>spot.id===b.bedHide.id));
    }else{
      b.knownBed=null;b.lastKnown=copy(game.player);
      const room=roomAt(game.player);
      if(room)startRoomSearchTask(game,room,'witness',game.player);else b.enemyRoomSearch=null;
      setTarget(game,game.player,'chase');
    }
  }
  let heard=null,score=-Infinity;
  for(const sound of b.sounds){
    if(sound.id<=b.lastSoundId)continue;
    if(sound.kind==='repair'){heard=sound;score=Infinity;continue;}
    const heardDistance=acousticDistance(game,game.enemy,sound.point,sound.range);
    if(heardDistance<=sound.range&&sound.range-heardDistance>score){heard=sound;score=sound.range-heardDistance;}
  }
  b.lastSoundId=b.soundSerial;
  if(!visible&&b.enemyMode!=='locker'){
    if(b.knownBed||b.enemyRoomSearch?.reason==='witness')return;
    if(heard?.kind==='repair'&&b.enemyMode!=='chase'){
      b.enemyRoomSearch=null;b.phoneTasks=[];b.investigationKind='repair';b.lastHeard={point:copy(heard.point),kind:heard.kind};setTarget(game,heard.point,'investigate');return;
    }
    if(b.enemyRoomSearch)return;
    if(b.enemyMode==='chase'){
      if(heard?.kind==='footstep'){b.lastHeard={point:copy(heard.point),kind:heard.kind};setTarget(game,heard.point,'chase');}
      return;
    }
    const light=visibleFlashlightClue(game);
    if(light){
      const moved=!b.lastLight||distance(light.point,b.lastLight.point)>.4;
      b.lastLight=light;b.investigationKind='light';
      if(b.enemyMode!=='search'||moved)setTarget(game,light.approach,'investigate');
    }else if(heard){
      b.investigationKind=heard.kind;b.lastHeard={point:copy(heard.point),kind:heard.kind};setTarget(game,heard.point,'investigate');
    }
  }
}
function beginRoomInspection(game,mission){
  const b=game.blackout,room=L.rooms.find(r=>r.id===mission.roomId),bounds=room.bounds,points=[];
  for(let z=bounds.minZ;z<=bounds.maxZ;z++)for(let x=bounds.minX;x<=bounds.maxX;x++)if(isOpen(x,z))points.push({x,z});
  const centre={x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2};
  points.sort((a,c)=>Math.atan2(a.z-centre.z,a.x-centre.x)-Math.atan2(c.z-centre.z,c.x-centre.x));
  const near=points.reduce((best,p,i)=>distance(p,game.enemy)<distance(points[best],game.enemy)?i:best,0);
  const circuit=[...points.slice(near+1),...points.slice(0,near+1)];
  mission.phase='search';mission.points=Array.from({length:R.roomSearchPasses},()=>circuit).flat();mission.index=0;mission.lookRemaining=R.roomSearchLookSeconds;
  b.enemyMode='investigate';b.knownBed=null;game.enemyNext=null;
  setTarget(game,mission.points[0]??room.door.inside,'investigate');
}
function reachedTarget(game){
  const b=game.blackout;
  const mission=b.enemyRoomSearch;
  if(mission){
    const room=L.rooms.find(r=>r.id===mission.roomId);
    if(mission.phase==='leave'){
      b.enemyRoomSearch=null;game.enemyNext=null;
      if(!startNextPhoneTask(game))setTarget(game,L.patrol[b.patrolIndex],'patrol');
    }else if(mission.phase==='approach'){
      if(b.knownBed&&b.hidden===b.knownBed){
        const spot=bedSpots(game).find(s=>s.id===b.knownBed);
        b.enemyHeading=Math.atan2(spot.target.x-game.enemy.x,spot.target.z-game.enemy.z);return;
      }
      beginRoomInspection(game,mission);
    }else{
      mission.index++;
      if(mission.index>=mission.points.length){mission.phase='leave';mission.lookRemaining=0;setTarget(game,room.door.outside,'investigate');}
      else{mission.lookRemaining=R.roomSearchLookSeconds;setTarget(game,mission.points[mission.index],'investigate');}
      game.enemyNext=null;
    }
    return;
  }
  if(b.enemyMode==='patrol'){
    b.patrolIndex=(b.patrolIndex+1)%L.patrol.length;setTarget(game,L.patrol[b.patrolIndex],'patrol');
  }else if(b.enemyMode!=='locker'||b.hidden!==b.knownLocker){
    // An observed hiding place remains a clue, not permanent knowledge of its occupant.
    // Inspecting an empty cabinet must return the enemy to a bounded search.
    b.knownLocker=null;
    b.enemyMode='search';b.investigationKind=null;b.enemyTarget=null;b.searchRemaining=R.searchSeconds;game.enemyNext=null;
  }
}
function moveBlackoutEnemy(game,dt){
  const b=game.blackout,before=copy(game.enemy);
  for(const state of Object.values(b.roomDoors))state.bashing=false;
  if(game.enemyDelay>0){game.enemyDelay=Math.max(0,game.enemyDelay-dt);game.enemyVelocity={x:0,z:0};return;}
  if(b.enemyRoomSearch?.phase==='search'&&b.enemyRoomSearch.lookRemaining>0){
    b.enemyRoomSearch.lookRemaining=Math.max(0,b.enemyRoomSearch.lookRemaining-dt);b.enemyHeading+=dt*2;
    game.enemyVelocity={x:0,z:0};return;
  }
  if(b.enemyMode==='search'){
    b.searchRemaining-=dt;b.enemyHeading+=dt*.9;
    if(b.searchRemaining<=0)setTarget(game,L.patrol[b.patrolIndex],'patrol');
    game.enemyVelocity={x:0,z:0};return;
  }
  const target=b.enemyTarget;if(!target){game.enemyVelocity={x:0,z:0};return;}
  let effectiveTarget=target,points=blackoutPath(game,game.enemy,target),obstruction=null;
  const walls=entryCollisionWalls(game).filter(wall=>wall.type!=='furniture');
  for(let i=1;i<points.length&&!obstruction;i++)for(const wall of walls)if(crossesWall(points[i-1],points[i],wall)){
    obstruction=wall;effectiveTarget=points[i-1];break;
  }
  if(obstruction){
    // A remembered location behind a door leads to the near side of that door,
    // never to an unobserved live player position.
    if(game.enemyNext&&!blackoutSight(game,game.enemy,game.enemyNext))game.enemyNext=null;
    points=route(game,game.enemy,effectiveTarget);
  }
  if(distance(game.enemy,effectiveTarget)<.035){
    const room=obstruction?.type==='room-door'&&(L.rooms??[]).find(r=>r.id===obstruction.id);
    if(room&&b.enemyMode!=='patrol'){
      const state=b.roomDoors[room.id];b.enemyHeading=Math.atan2(room.door.x-game.enemy.x,room.door.z-game.enemy.z);
      if(state.closed){
        state.bashing=true;state.bashTime=Math.min(ROOM_DOOR_TIMING.enemyWait,state.bashTime+dt);state.enemyWait=state.bashTime;
        state.bashProgress=state.bashTime/ROOM_DOOR_TIMING.enemyWait;state.bashBeat-=dt;
        if(state.bashBeat<=EPS&&state.bashTime<ROOM_DOOR_TIMING.enemyWait-EPS){state.bashBeat+=ROOM_DOOR_TIMING.bashInterval;state.bashPulse=1;b.lastBashDoorId=room.id;game.events.push('room-door-bash');}
        if(state.bashTime>=ROOM_DOOR_TIMING.enemyWait-EPS)commitRoomDoor(game,room,false,true);
      }
    }else if(!obstruction||!b.enemyRoomSearch)reachedTarget(game);
    game.enemyVelocity={x:0,z:0};return;
  }
  const speed=b.powerOn?game.tuning.escapeEnemySpeed:(b.enemyMode==='chase'||b.enemyMode==='locker'||b.enemyMode==='investigate'&&['repair','phone'].includes(b.investigationKind)&&(!b.enemyRoomSearch||b.enemyRoomSearch.phase==='approach')?game.tuning.enemySpeed:game.tuning.enemyPatrolSpeed);
  let remaining=speed*b.enemySpeedScale*dt;
  while(remaining>EPS){
    if(!game.enemyNext){
      points=route(game,game.enemy,effectiveTarget);
      if(points.length>1)game.enemyNext=distance(game.enemy,points[0])>EPS?points[0]:points[1];
      else if(points.length&&blackoutSight(game,game.enemy,effectiveTarget))game.enemyNext=copy(effectiveTarget);
      else break;
    }
    if(!blackoutSight(game,game.enemy,game.enemyNext)){game.enemyNext=null;break;}
    const d=distance(game.enemy,game.enemyNext);
    if(d<EPS){game.enemyNext=null;break;}
    const amount=Math.min(d,remaining),delta={x:(game.enemyNext.x-game.enemy.x)/d*amount,z:(game.enemyNext.z-game.enemy.z)/d*amount};
    const move=slideMove(game.enemy,delta,RULES.enemyRadius,game.tuning.corridorWidth,entryCollisionWalls(game));
    game.enemy=move.position;remaining-=amount;
    if(move.contacts.length){game.enemyNext=null;break;}
    if(amount>=d-EPS)game.enemyNext=null;
  }
  game.enemyVelocity={x:(game.enemy.x-before.x)/dt,z:(game.enemy.z-before.z)/dt};
  if(distance(game.enemy,before)>EPS)b.enemyHeading=Math.atan2(game.enemyVelocity.x,game.enemyVelocity.z);
}
export function finishBlackoutStep(game,dt){
  const b=game.blackout;
  if(!isInSafeRoom(game.player))b.hasLeftRoom=true;
  b.stepClock-=dt;
  if(!b.hidden&&!b.phoneOpen&&!b.monitor&&!b.monitorConnecting&&game.sprinting&&Math.hypot(game.playerVelocity.x,game.playerVelocity.z)>.1&&b.stepClock<=0){
    noise(game,game.player,R.hearingRun,'footstep');b.stepClock=.3;
  }
  if(!stepKnockdown(game,dt)){perceive(game,dt);moveBlackoutEnemy(game,dt);}
  b.sounds=b.sounds.filter(sound=>(sound.remaining-=dt)>0);
}
export function blackoutShouldCatch(game){
  const b=game.blackout;if(b.knockdown)return false;
  if(b.bedHide&&b.knownBed===b.hidden&&b.enemyTarget&&distance(game.enemy,b.enemyTarget)<.22&&distance(game.enemy,b.bedHide.target)<.9&&blackoutSight(game,game.enemy,b.bedHide.target))return true;
  const exposed=!b.hidden||b.knownLocker===b.hidden||(b.bedHide&&!bedConcealed(game));
  return exposed&&distance(game.player,game.enemy)<game.tuning.playerRadius+RULES.enemyRadius&&blackoutSight(game,game.player,game.enemy);
}
export function blackoutWon(game){
  const b=game.blackout;
  return b.powerOn&&b.hasLeftRoom&&inControlRoom(game.player)&&b.doorClosed&&b.doorProgress>=1-EPS&&!isInSafeRoom(game.enemy);
}
export function blackoutCaught(game){
  const b=game.blackout;cancelRoomHold(game);b.hidden=null;b.bedHide=null;b.bedTransition=null;b.phoneOpen=false;b.monitorConnecting=0;b.monitor=false;b.flashlight=false;b.nightVision=false;b.repairing=false;
  b.knownBed=null;b.enemyRoomSearch=null;b.phoneTasks=[];
  for(const state of Object.values(b.roomDoors))state.bashing=false;
}
export function resetBlackoutAfterDeath(game){
  const b=game.blackout;
  blackoutCaught(game);b.knockdown=null;b.doorClosed=true;b.doorProgress=1;b.hasLeftRoom=false;b.knownLocker=null;
  b.lastKnown=null;b.lastHeard=null;b.lastLight=null;b.enemyMode='patrol';b.patrolIndex=0;b.enemyTarget=copy(L.patrol[0]);b.enemyHeading=-Math.PI/2;
  b.sounds=[];b.lastSoundId=b.soundSerial;b.senseClock=0;b.stepClock=0;b.heading=START_YAW;
  for(const phone of b.phones)phone.remaining=0;
  for(const state of Object.values(b.roomDoors)){state.mode=null;state.hold=0;state.wait=0;state.enemyWait=0;state.releaseGrace=0;state.bashing=false;state.bashTime=0;state.bashProgress=0;state.bashPulse=0;state.bashBeat=0;}
  game.entryOpened=false;
}
