import { MAP,START, ENEMY_START, EXIT, SHARDS, RULES, ENTRY_GATE, isInSafeRoom, distance, cell, isOpen, pathTo,wallInset,transitionWalls } from './world.js';
import {MOVEMENT_KEYS} from './tuning.js';
import {movementVelocity,slideMove,steerVelocity} from './movement.js';
import {hasMazeSight} from './visibility.js';
import {entryCollisionWalls,stepEntry} from './entry-state.js';
import {BLACKOUT_RULES} from './blackout-layout.js';
import {createBlackoutState,beginBlackoutStep,finishBlackoutStep,blackoutPlayerWalls,blackoutShouldCatch,blackoutSight,blackoutWon,blackoutCaught,resetBlackoutAfterDeath} from './blackout-state.js';
export {getBlackoutInteraction,blackoutSight} from './blackout-state.js';
const mapWidth=MAP[0].length,shardByCell=new Int16Array(mapWidth*MAP.length).fill(-1);
SHARDS.forEach((p,index)=>shardByCell[p.z*mapWidth+p.x]=index);

function collectAlongTravel(game,travel){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const point of travel){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);}
  // Only cells touched by this small movement can contain a new pickup.
  for(let z=Math.max(0,Math.floor(minZ+.5));z<=Math.min(MAP.length-1,Math.floor(maxZ+.5));z++)for(let x=Math.max(0,Math.floor(minX+.5));x<=Math.min(mapWidth-1,Math.floor(maxX+.5));x++){
    const index=shardByCell[z*mapWidth+x];if(index<0||game.collected.has(index))continue;
    for(let leg=1;leg<travel.length;leg++)if(crossesPickupCell(travel[leg-1],travel[leg],SHARDS[index])){
      game.collected.add(index);game.events.push('collect');if(game.collected.size===SHARDS.length)game.events.push('unlock');break;
    }
  }
}

// No demo flag here. Every controller is subject to these exact rules.
export function createGame(tuning={},options={}) {
  const settings=options.mode==='blackout'?{corridorWidth:BLACKOUT_RULES.corridorWidth,...tuning}:tuning;
  const game={ tuning: Object.fromEntries(MOVEMENT_KEYS.map(key=>[key,settings[key]??RULES[key]])), player: { ...START }, enemy: { ...ENEMY_START }, enemyNext: null,
    collected: new Set(), lives: RULES.lives, phase: 'playing',
    elapsed: 0, respawn: 0, caught: 0, deaths: 0, events: [], enemyDelay: RULES.enemyDelay,entryOpened:false,entryBreakTime:0,
    moveSpeed: 0, sprinting: false, moveHeading:null, motionVelocity:{x:0,z:0},playerVelocity: { x: 0, z: 0 }, enemyVelocity: { x: 0, z: 0 } };
  if(options.mode==='blackout')game.blackout=createBlackoutState();
  return game;
}
export function blocked(p, radius = RULES.playerRadius,width=RULES.corridorWidth) {
  const c = cell(p);
  const half=.5+wallInset(width);
  for (let z = c.z - 1; z <= c.z + 1; z++) for (let x = c.x - 1; x <= c.x + 1; x++) {
    if (isOpen(x, z)) continue;
    const nearX = Math.max(x - half, Math.min(x + half, p.x));
    const nearZ = Math.max(z - half, Math.min(z + half, p.z));
    if ((p.x - nearX) ** 2 + (p.z - nearZ) ** 2 < radius ** 2) return true;
  }
  for(const wall of transitionWalls(width)){
    const nearX=Math.max(wall.x-wall.halfX,Math.min(wall.x+wall.halfX,p.x));
    const nearZ=Math.max(wall.z-wall.halfZ,Math.min(wall.z+wall.halfZ,p.z));
    if((p.x-nearX)**2+(p.z-nearZ)**2<radius**2)return true;
  }
  return false;
}
function movePlayer(game, input, dt) {
  const length = Math.hypot(input.x, input.z);
  if(length>.001)game.motionVelocity=steerVelocity(game.motionVelocity,game.moveHeading,input.heading,game.tuning.turnFollow);
  game.moveHeading=Number.isFinite(input.heading)?input.heading:null;
  game.sprinting = Boolean(input.run && length > .001);
  const velocity=movementVelocity(game.motionVelocity,input,game.tuning,dt);
  const before = { ...game.player };
  const result=slideMove(before,{x:velocity.x*dt,z:velocity.z*dt},game.tuning.playerRadius,game.tuning.corridorWidth,game.blackout?blackoutPlayerWalls(game):entryCollisionWalls(game));
  game.player=result.position;
  // Remove only the velocity into contacted walls; don't keep stored pressure against a wall.
  for(const hit of result.contacts){const inward=velocity.x*hit.nx+velocity.z*hit.nz;if(inward<0){velocity.x-=inward*hit.nx;velocity.z-=inward*hit.nz;}}
  game.motionVelocity=velocity;game.moveSpeed=Math.hypot(velocity.x,velocity.z);
  game.playerVelocity = { x: (game.player.x - before.x) / dt, z: (game.player.z - before.z) / dt };
  return result.path.length>1?result.path:[before,before];
}
// Each crystal owns its traversable tile across the whole corridor width.
// Sweep the actual collision-resolved legs, so fast movement and corners cannot skip a pickup.
export function crossesPickupCell(a,b,p){
  let enter=0,leave=1;
  for(const axis of ['x','z']){
    const d=b[axis]-a[axis],low=p[axis]-.5+1e-7,high=p[axis]+.5-1e-7;
    if(Math.abs(d)<1e-12){if(a[axis]<low||a[axis]>high)return false;continue;}
    let t0=(low-a[axis])/d,t1=(high-a[axis])/d;if(t0>t1)[t0,t1]=[t1,t0];
    enter=Math.max(enter,t0);leave=Math.min(leave,t1);if(enter>leave)return false;
  }
  return true;
}
function moveEnemy(game, dt) {
  // Replan only at cell centres, so an enemy never cuts through a wall corner.
  const before = { ...game.enemy };
  if (game.enemyDelay > 0) { game.enemyDelay -= dt; game.enemyVelocity = { x: 0, z: 0 }; return; }
  let remaining = (game.collected.size === SHARDS.length ? game.tuning.escapeEnemySpeed : game.tuning.enemySpeed) * dt;
  while (remaining > 0) {
    if (!game.enemyNext) {
      const target=isInSafeRoom(game.player)?ENTRY_GATE.outside:game.player,path=pathTo(game.enemy,target);
      if(path.length>1){
        // An off-centre final pursuit may need to rejoin its cell centre before
        // starting a new corridor edge. Never cut a partition or inside corner.
        game.enemyNext=distance(game.enemy,path[0])>.00001?path[0]:path[1];
      }else if(path.length===1&&hasMazeSight(game.enemy,target,game.tuning.corridorWidth))game.enemyNext={...target};
      else break;
    }
    if(isInSafeRoom(game.enemyNext)||!hasMazeSight(game.enemy,game.enemyNext,game.tuning.corridorWidth)){game.enemyNext=null;break;}
    const d = distance(game.enemy, game.enemyNext);
    if (d < .00001) { game.enemyNext = null; break; }
    const amount = Math.min(d, remaining);
    const next = { x: game.enemy.x + (game.enemyNext.x - game.enemy.x) / d * amount,
      z: game.enemy.z + (game.enemyNext.z - game.enemy.z) / d * amount };
    if (isInSafeRoom(next)||blocked(next, RULES.enemyRadius,game.tuning.corridorWidth)||!hasMazeSight(game.enemy,next,game.tuning.corridorWidth)) { game.enemyNext = null; break; }
    game.enemy = next; remaining -= amount;
    if (amount >= d - .00001) game.enemyNext = null;
  }
  game.enemyVelocity = { x: (game.enemy.x - before.x) / dt, z: (game.enemy.z - before.z) / dt };
}
function loseLife(game) {
  game.lives--; game.deaths++; game.events.push('hit');
  game.moveSpeed = 0; game.sprinting = false;
  game.motionVelocity={x:0,z:0};
  game.moveHeading=null;
  game.playerVelocity = { x: 0, z: 0 }; game.enemyVelocity = { x: 0, z: 0 };
  // Keep the actual contact position visible until the scare has faded to black.
  game.phase = 'caught'; game.caught = RULES.caughtSeconds;
  if(game.blackout)blackoutCaught(game);
}
function reachedExit(game){
  // A usable arrival area inside the exit cell. Wide-hall wall hugging must not
  // require steering the player's centre onto a tiny point in the floor.
  const sideClearance=.5-wallInset(game.tuning.corridorWidth)-game.tuning.playerRadius;
  const reach=Math.max(RULES.exitRadius,sideClearance+.04);
  return distance(game.player,EXIT)<=reach&&hasMazeSight(game.player,EXIT,game.tuning.corridorWidth);
}
export function tick(game, input, dt) {
  game.events = [];
  if (!Number.isFinite(dt) || dt <= 0 || game.phase === 'won' || game.phase === 'lost') return game.events;
  // Substeps keep collisions stable across refresh rates and long frames.
  let remaining = Math.min(dt, .1);
  let movedX=0,movedZ=0,movedTime=0;
  let firstStep=true;
  while (remaining > .000001) {
    const step = Math.min(1 / 120, remaining); remaining -= step;
    const controls=firstStep?input:{...input,action:undefined};firstStep=false;
    if (game.phase === 'caught') {
      game.caught -= step;
      if(game.caught<=0){
        if(game.lives===0){game.phase='lost';game.events.push('lost');break;}
        game.player={...START};game.enemy={...ENEMY_START};game.enemyNext=null;game.enemyDelay=1.2;
        if(game.blackout)resetBlackoutAfterDeath(game);
        game.phase='respawn';game.respawn=RULES.respawnSeconds;game.events.push('relocate');
      }
      continue;
    }
    if (game.phase === 'respawn') {
      game.respawn -= step;
      if (game.respawn <= 0) { game.phase = 'playing'; game.events.push('respawn'); }
      continue;
    }
    const movementInput=game.blackout?beginBlackoutStep(game,controls,step):controls;
    if(!game.blackout)stepEntry(game,controls,step);
    const travel=movePlayer(game,movementInput,step);
    movedX+=travel.at(-1).x-travel[0].x;movedZ+=travel.at(-1).z-travel[0].z;movedTime+=step;
    if(game.blackout){
      game.elapsed+=step;finishBlackoutStep(game,step);
      if(blackoutShouldCatch(game)){loseLife(game);break;}
      if(blackoutWon(game)){game.phase='won';game.events.push('won');break;}
      continue;
    }
    if(!game.entryOpened)continue;
    game.elapsed += step;
    collectAlongTravel(game,travel);
    moveEnemy(game, step);
    if (!isInSafeRoom(game.player)&&distance(game.player, game.enemy) < game.tuning.playerRadius + RULES.enemyRadius&&hasMazeSight(game.player,game.enemy,game.tuning.corridorWidth)) { loseLife(game); break; }
    if (game.collected.size === SHARDS.length && reachedExit(game)) {
      game.phase = 'won'; game.events.push('won'); break;
    }
  }
  if(game.phase==='playing'&&movedTime>0)game.playerVelocity={x:movedX/movedTime,z:movedZ/movedTime};
  return game.events;
}
