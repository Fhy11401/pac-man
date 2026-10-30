import { START, ENEMY_START, EXIT, SHARDS, RULES, distance, cell, isOpen, pathTo } from './world.js';

// No demo flag here. Every controller is subject to these exact rules.
export function createGame() {
  return { player: { ...START }, enemy: { ...ENEMY_START }, enemyNext: null,
    collected: new Set(), lives: RULES.lives, phase: 'playing',
    elapsed: 0, respawn: 0, caught: 0, deaths: 0, events: [], enemyDelay: RULES.enemyDelay,
    moveSpeed: 0, sprinting: false, playerVelocity: { x: 0, z: 0 }, enemyVelocity: { x: 0, z: 0 } };
}
export function blocked(p, radius = RULES.playerRadius) {
  const c = cell(p);
  for (let z = c.z - 1; z <= c.z + 1; z++) for (let x = c.x - 1; x <= c.x + 1; x++) {
    if (isOpen(x, z)) continue;
    const nearX = Math.max(x - .5, Math.min(x + .5, p.x));
    const nearZ = Math.max(z - .5, Math.min(z + .5, p.z));
    if ((p.x - nearX) ** 2 + (p.z - nearZ) ** 2 < radius ** 2) return true;
  }
  return false;
}
function movePlayer(game, input, dt) {
  const length = Math.hypot(input.x, input.z);
  const divisor = Math.max(1, length);
  game.sprinting = Boolean(input.run && length > .001);
  const desiredSpeed = length > .001 ? (game.sprinting ? RULES.sprintSpeed : RULES.playerSpeed) : 0;
  // A short acceleration ramp, instant release, and no directional sliding.
  game.moveSpeed = desiredSpeed === 0 ? 0 : game.moveSpeed + Math.max(-RULES.acceleration * dt, Math.min(RULES.acceleration * dt, desiredSpeed - game.moveSpeed));
  const dx = input.x / divisor * game.moveSpeed * dt;
  const dz = input.z / divisor * game.moveSpeed * dt;
  const before = { ...game.player };
  const nextX = { x: game.player.x + dx, z: game.player.z };
  if (!blocked(nextX)) game.player.x = nextX.x;
  const nextZ = { x: game.player.x, z: game.player.z + dz };
  if (!blocked(nextZ)) game.player.z = nextZ.z;
  game.playerVelocity = { x: (game.player.x - before.x) / dt, z: (game.player.z - before.z) / dt };
}
function moveEnemy(game, dt) {
  // Replan only at cell centres, so an enemy never cuts through a wall corner.
  const before = { ...game.enemy };
  if (game.enemyDelay > 0) { game.enemyDelay -= dt; game.enemyVelocity = { x: 0, z: 0 }; return; }
  let remaining = (game.collected.size === SHARDS.length ? RULES.escapeEnemySpeed : RULES.enemySpeed) * dt;
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
    if (blocked(next, RULES.enemyRadius)) { game.enemyNext = null; break; }
    game.enemy = next; remaining -= amount;
    if (amount >= d - .00001) game.enemyNext = null;
  }
  game.enemyVelocity = { x: (game.enemy.x - before.x) / dt, z: (game.enemy.z - before.z) / dt };
}
function loseLife(game) {
  game.lives--; game.deaths++; game.events.push('hit');
  game.moveSpeed = 0; game.sprinting = false;
  game.playerVelocity = { x: 0, z: 0 }; game.enemyVelocity = { x: 0, z: 0 };
  // Keep the actual contact position visible until the scare has faded to black.
  game.phase = 'caught'; game.caught = RULES.caughtSeconds;
}
export function tick(game, input, dt) {
  game.events = [];
  if (!Number.isFinite(dt) || dt <= 0 || game.phase === 'won' || game.phase === 'lost') return game.events;
  // Substeps keep collisions stable across refresh rates and long frames.
  let remaining = Math.min(dt, .1);
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
    movePlayer(game, input, step);
    SHARDS.forEach((p, index) => {
      if (!game.collected.has(index) && distance(game.player, p) < RULES.collectRadius) {
        game.collected.add(index); game.events.push('collect');
        if (game.collected.size === SHARDS.length) game.events.push('unlock');
      }
    });
    moveEnemy(game, step);
    if (distance(game.player, game.enemy) < RULES.playerRadius + RULES.enemyRadius) { loseLife(game); break; }
    if (game.collected.size === SHARDS.length && distance(game.player, EXIT) < RULES.exitRadius) {
      game.phase = 'won'; game.events.push('won'); break;
    }
  }
  return game.events;
}
