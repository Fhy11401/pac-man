import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,getBlackoutInteraction,blackoutSight} from '../src/core.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {securityRoomFurniture} from '../src/security-room-layout.js';
import {ITEMS,createRoomItems,roomItemPoint,canUseStick,useStick,STUN_SECONDS,GET_UP_SECONDS,knockdownPose} from '../src/room-items.js';
import {resetBlackoutAfterDeath,finishBlackoutStep} from '../src/blackout-state.js';
import {createItemModel,applyKnockdown} from '../src/room-item-view.js';
import * as THREE from '../vendor/three.module.js';
import {readFileSync} from 'node:fs';

const still={x:0,z:0,heading:0};
function game(random=()=>.99){const g=createGame({}, {mode:'blackout',random});g.enemyDelay=10000;return g;}
function step(g,seconds){for(let t=0;t<seconds-1e-8;t+=1/60)tick(g,still,Math.min(1/60,seconds-t));}
function combat(){const g=game();g.player={x:18,z:10};g.enemy={x:18,z:9.4};g.blackout.inventory='stick';return g;}

test('each new shift places exactly one of each bilingual item on two distinct room desks',()=>{
  const a=game(()=>0),b=game(()=>.99);
  assert.equal(new Set(a.blackout.roomItems.map(i=>i.roomId)).size,2);
  assert.deepEqual(a.blackout.roomItems.map(i=>i.kind),['stick','stethoscope']);
  assert.notEqual(a.blackout.roomItems[0].roomId,b.blackout.roomItems[0].roomId);
  for(const item of a.blackout.roomItems){const desk=securityRoomFurniture(a.tuning.corridorWidth).find(p=>p.room.id===item.roomId).desk;assert.deepEqual(roomItemPoint(item,a.tuning.corridorWidth),{x:desk.x,z:desk.z});assert.match(ITEMS[item.kind].name,/[\u4e00-\u9fff]+ \/ [A-Za-z]/);}
  a.blackout.roomItems[0].kind=null;assert.equal(b.blackout.roomItems[0].kind,'stick');
});

test('real E interactions pick up both desk items and exchange the held item back onto that desk',()=>{
  const g=game();
  for(const [index,item] of g.blackout.roomItems.entries()){
    const entry=securityRoomFurniture(g.tuning.corridorWidth).find(p=>p.room.id===item.roomId),wall=entry.phone.wall;
    const point=roomItemPoint(item,g.tuning.corridorWidth);g.player={x:point.x-wall.x*.48,z:point.z-wall.z*.48};
    const heading=Math.atan2(wall.x*-1,wall.z*-1);g.blackout.heading=heading;
    const interaction=getBlackoutInteraction(g,heading);assert.equal(interaction?.kind,'item',JSON.stringify(interaction));assert.equal(interaction.id,item.id);
    const next=item.kind;tick(g,{...still,heading,action:'interact'},1/60);
    assert.equal(g.blackout.inventory,next);assert.equal(item.kind,index?'stick':null);
    if(index){tick(g,{...still,heading,action:'interact'},1/60);assert.equal(g.blackout.inventory,'stick');assert.equal(item.kind,'stethoscope');}
  }
  const item=g.blackout.roomItems.find(i=>i.kind);g.player={x:1,z:1};assert.notEqual(getBlackoutInteraction(g)?.id,item.id,'cannot collect remotely');
});

test('active swing requires facing, range and line of sight; invalid uses do not spend it',()=>{
  const g=combat();assert.equal(canUseStick(g,blackoutSight),true);
  tick(g,{...still,heading:Math.PI,action:'use-item'},1/60);assert.equal(g.blackout.inventory,'stick');
  g.enemy={x:18,z:8};tick(g,{...still,action:'use-item'},1/60);assert.equal(g.blackout.inventory,'stick');
  const room=L.rooms[0];g.player={...room.door.outside};g.enemy={...room.door.inside};g.blackout.heading=-Math.PI/2;
  assert.equal(useStick(g,blackoutSight,true),false,'even passive defense cannot pass a closed door');
  g.player={x:18,z:10};g.enemy={x:18,z:9.4};
  assert(tick(g,{...still,action:'use-item'},1/60).includes('item-strike'));assert.equal(g.blackout.inventory,null);assert.equal(g.blackout.enemySpeedScale,.9);
});

test('passive defense happens before jumpscare and cannot be repeated after consumption',()=>{
  const g=combat();g.enemy={...g.player};g.blackout.heading=Math.PI;
  const events=tick(g,still,1/60);assert(events.includes('item-strike'));assert(!events.includes('hit'));assert.equal(g.lives,3);assert.equal(g.phase,'playing');
  step(g,4.95);assert.equal(g.lives,3);assert(g.blackout.knockdown);
  step(g,1);assert.equal(g.lives,2);assert.equal(g.phase,'caught');assert.equal(g.blackout.inventory,null);
});

test('automatic defense cancels CCTV and connection states without changing controls or granting a second item',()=>{
  for(const mode of ['monitor','monitorConnecting','phoneOpen']){
    const g=combat();g.enemy={...g.player};g.blackout[mode]=mode==='monitorConnecting'?1:true;
    assert.equal(canUseStick(g,blackoutSight),false);
    tick(g,still,1/60);assert.equal(g.phase,'playing');assert.equal(g.lives,3);assert.equal(g.blackout.inventory,null);
    assert.equal(g.blackout.monitor,false);assert.equal(g.blackout.monitorConnecting,0);assert.equal(g.blackout.phoneOpen,false);
  }
  const g=combat();g.blackout.inventory='stethoscope';g.enemy={...g.player};
  tick(g,{...still,action:'use-item'},1/60);assert.equal(g.phase,'caught','the listening item is not a defense weapon');assert.equal(g.blackout.enemySpeedScale,1);
});

test('enemy cannot move, see, bash or kill during five seconds down and the get-up animation',()=>{
  const g=combat();g.enemyDelay=0;assert(useStick(g,blackoutSight));const before={...g.enemy};
  step(g,STUN_SECONDS-.05);assert.deepEqual(g.enemy,before);assert(g.blackout.knockdown.elapsed<STUN_SECONDS);
  const pose=knockdownPose(g.blackout.knockdown.elapsed);assert(pose.angle<-1.4);
  step(g,.1);assert(g.blackout.knockdown);assert(knockdownPose(g.blackout.knockdown.elapsed).angle>pose.angle);
  step(g,GET_UP_SECONDS);assert.equal(g.blackout.knockdown,null);assert.equal(g.blackout.enemySpeedScale,.9);
  resetBlackoutAfterDeath(g);assert.equal(g.blackout.enemySpeedScale,.9);assert.equal(g.blackout.inventory,null);
  assert.equal(game().blackout.enemySpeedScale,1);
});

test('permanent slowdown covers patrol, chase, phone, repair and restored-power movement',()=>{
  for(const mode of ['patrol','chase','phone','repair','escape']){
    const a=game(),b=game();
    for(const g of [a,b]){g.enemyDelay=0;g.player={x:10,z:10};g.enemy={x:18,z:10};g.blackout.senseClock=100;g.blackout.enemyMode=['phone','repair'].includes(mode)?'investigate':mode==='escape'?'patrol':mode;g.blackout.investigationKind=mode;g.blackout.enemyTarget={x:18,z:7};g.blackout.powerOn=mode==='escape';}
    b.blackout.enemySpeedScale=.9;finishBlackoutStep(a,.1);finishBlackoutStep(b,.1);
    const da=Math.hypot(a.enemy.x-18,a.enemy.z-10),db=Math.hypot(b.enemy.x-18,b.enemy.z-10);assert(da>0);assert(Math.abs(db/da-.9)<1e-8,mode);
  }
});

test('item geometry stays desk-sized and fall/get-up pose has continuous endpoints',()=>{
  for(const kind of Object.keys(ITEMS)){const model=createItemModel(kind),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());assert(size.x<1.1&&size.z<.4&&size.y<.1);}
  assert(Math.abs(knockdownPose(0).angle)<1e-8);assert(Math.abs(knockdownPose(STUN_SECONDS+GET_UP_SECONDS).angle)<1e-8);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/keyv:'use-item',keyq:'nightvision'/);assert.match(main,/keym:'monitor'/);assert.match(html,/<dt>V<\/dt><dd>使用道具/);
});
