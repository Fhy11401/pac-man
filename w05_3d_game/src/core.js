import { MAP,START, ENEMY_START, EXIT, SHARDS, RULES, distance, cell, isOpen, pathTo,wallInset } from './world.js';
import {MOVEMENT_KEYS} from './tuning.js';
import {movementVelocity,slideMove,steerVelocity} from './movement.js';
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
export function createGame(tuning={}) {
  return { tuning: Object.fromEntries(MOVEMENT_KEYS.map(key=>[key,tuning[key]??RULES[key]])), player: { ...START }, enemy: { ...ENEMY_START }, enemyNext: null,
    collected: new Set(), lives: RULES.lives, phase: 'playing',
    elapsed: 0, respawn: 0, caught: 0, deaths: 0, events: [], enemyDelay: RULES.enemyDelay,
    moveSpeed: 0, sprinting: false, moveHeading:null, motionVelocity:{x:0,z:0},playerVelocity: { x: 0, z: 0 }, enemyVelocity: { x: 0, z: 0 } };
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
  return false;
}
function movePlayer(game, input, dt) {
  const length = Math.hypot(input.x, input.z);
  if(length>.001)game.motionVelocity=steerVelocity(game.motionVelocity,game.moveHeading,input.heading,game.tuning.turnFollow);
  game.moveHeading=Number.isFinite(input.heading)?input.heading:null;
  game.sprinting = Boolean(input.run && length > .001);
  const velocity=movementVelocity(game.motionVelocity,input,game.tuning,dt);
  const before = { ...game.player };
  const result=slideMove(before,{x:velocity.x*dt,z:velocity.z*dt},game.tuning.playerRadius,game.tuning.corridorWidth);
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
      const path = pathTo(game.enemy, game.player);
      game.enemyNext = path[1] ?? { ...game.player };
    }
    const d = distance(game.enemy, game.enemyNext);
    if (d < .00001) { game.enemyNext = null; break; }
    const amount = Math.min(d, remaining);
    const next = { x: game.enemy.x + (game.enemyNext.x - game.enemy.x) / d * amount,
      z: game.enemy.z + (game.enemyNext.z - game.enemy.z) / d * amount };
    if (blocked(next, RULES.enemyRadius,game.tuning.corridorWidth)) { game.enemyNext = null; break; }
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
}
export function tick(game, input, dt) {
  game.events = [];
  if (!Number.isFinite(dt) || dt <= 0 || game.phase === 'won' || game.phase === 'lost') return game.events;
  // Substeps keep collisions stable across refresh rates and long frames.
  let remaining = Math.min(dt, .1);
  let movedX=0,movedZ=0,movedTime=0;
  while (remaining > .000001) {
    const step = Math.min(1 / 120, remaining); remaining -= step;
    if (game.phase === 'caught') {
      game.caught -= step;
      if(game.caught<=0){
        if(game.lives===0){game.phase='lost';game.events.push('lost');break;}
        game.player={...START};game.enemy={...ENEMY_START};game.enemyNext=null;game.enemyDelay=1.2;
        game.phase='respawn';game.respawn=RULES.respawnSeconds;game.events.push('relocate');
      }
      continue;
    }
    if (game.phase === 'respawn') {
      game.respawn -= step;
      if (game.respawn <= 0) { game.phase = 'playing'; game.events.push('respawn'); }
      continue;
    }
    game.elapsed += step;
    const travel=movePlayer(game, input, step);
    movedX+=travel.at(-1).x-travel[0].x;movedZ+=travel.at(-1).z-travel[0].z;movedTime+=step;
    collectAlongTravel(game,travel);
    moveEnemy(game, step);
    if (distance(game.player, game.enemy) < game.tuning.playerRadius + RULES.enemyRadius) { loseLife(game); break; }
    if (game.collected.size === SHARDS.length && distance(game.player, EXIT) < RULES.exitRadius) {
      game.phase = 'won'; game.events.push('won'); break;
    }
  }
  if(game.phase==='playing'&&movedTime>0)game.playerVelocity={x:movedX/movedTime,z:movedZ/movedTime};
  return game.events;
}
