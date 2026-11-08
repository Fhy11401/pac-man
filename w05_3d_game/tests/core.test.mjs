import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame as createInitialGame, tick, blocked } from '../src/core.js';
import {proximityMix} from '../src/audio.js';
import {stableFrameDt} from '../src/presentation.js';
import { DemoController, DEMO_CAMERA } from '../src/demo.js';
import { SHARDS, START, ENEMY_START, EXIT, ENTRY_GATE, distance, pathTo, RULES, wallInset, neighbors, edgeIsOpen, isInSafeRoom } from '../src/world.js';

function createGame(tuning){const game=createInitialGame(tuning);game.entryOpened=true;return game;}

const runBudget = Math.max(180, SHARDS.length * 2.5);
function straightFixture(minSteps = 5) {
  for (const origin of [START, ...SHARDS].filter(p=>!isInSafeRoom(p))) for (const next of neighbors(origin)) {
    const direction = {x: next.x-origin.x, z: next.z-origin.z};
    let end = origin, steps = 0;
    while (edgeIsOpen(end, {x:end.x+direction.x,z:end.z+direction.z})) {
      end = {x:end.x+direction.x,z:end.z+direction.z}; steps++;
    }
    if (steps >= minSteps) return {origin, direction, steps};
  }
  throw new Error('The map needs a straight corridor for full-speed movement checks');
}
function walkRoute(game, route) {
  game.enemyDelay = 10000;
  for (const target of route.slice(1)) {
    for (let frame=0; frame<240 && distance(game.player,target)>.015 && game.phase==='playing'; frame++) {
      const d=distance(game.player,target), scale=Math.min(1,d/(RULES.sprintSpeed/60));
      tick(game,{x:(target.x-game.player.x)/d*scale,z:(target.z-game.player.z)/d*scale,run:true},1/60);
      assert.equal(blocked(game.player),false);
    }
    if(game.phase==='won')return;
    assert.ok(distance(game.player,target)<.03,'normal movement must reach the next route node');
  }
}

for (const fps of [15, 30, 60, 144]) {
  test(`Demo wins through normal rules at ${fps} FPS`, () => {
    const game = createGame(), bot = new DemoController();
    for (let t = 0; t < runBudget && !['won', 'lost'].includes(game.phase); t += 1 / fps) {
      tick(game, bot.input(game, 1 / fps), 1 / fps);
      assert.equal(blocked(game.player), false, 'player must stay outside walls');
      assert.equal(blocked(game.enemy, .18), false, 'enemy must stay outside walls');
    }
    assert.equal(game.phase, 'won'); assert.equal(game.collected.size, SHARDS.length);
    assert.ok(game.lives > 0); assert.ok(game.elapsed > SHARDS.length/(RULES.sprintSpeed*2) && game.elapsed < runBudget);
    assert.ok(distance(game.player, EXIT) < RULES.exitRadius);
  });
}
test('Three contacts consume three lives, preserve collected progress, then lose', () => {
  const game = createGame(), bot = new DemoController();
  for (let i = 0; i < 1000 && game.collected.size === 0; i++) tick(game, bot.input(game, 1 / 60), 1 / 60);
  assert.ok(game.collected.size > 0);
  const preserved = [...game.collected];
  for (const lives of [2, 1, 0]) {
    let frames = 0;
    while (game.lives > lives && frames++ < 25000) tick(game, { x: 0, z: 0 }, 1 / 60);
    assert.equal(game.lives, lives); assert.deepEqual([...game.collected], preserved);
    if (lives > 0) {
      assert.equal(game.phase, 'caught');
      while(game.phase==='caught')tick(game,{x:0,z:0},1/60);
      assert.equal(game.phase,'respawn');assert.deepEqual(game.player, START);assert.deepEqual(game.enemy, ENEMY_START);
      const before = { ...game.player }; tick(game, { x: 1, z: 0 }, .1); assert.deepEqual(game.player, before);
      while (game.phase === 'respawn') tick(game, { x: 0, z: 0 }, 1 / 60);
      walkRoute(game,pathTo(START,ENTRY_GATE.outside));game.enemyDelay=0;
    }
  }
  while(game.phase==='caught')tick(game,{x:0,z:0},1/60);
  assert.equal(game.phase, 'lost');
});
test('Reaching the doorway exit before clearing every shard cannot win', () => {
  const game = createGame();
  walkRoute(game,pathTo(START,EXIT));
  assert.ok(game.collected.size > 0 && game.collected.size < SHARDS.length);
  assert.ok(distance(game.player, EXIT)<.1);assert.equal(game.phase,'playing');
  const exitShard=SHARDS.findIndex(p=>p.x===EXIT.x&&p.z===EXIT.z);
  if(exitShard>=0)assert.ok(game.collected.has(exitShard),'the exit marker must not erase its crystal');
});

test('collecting the final crystal at the doorway permits the return exit only after collection',()=>{
  assert.deepEqual(EXIT,ENTRY_GATE.outside);
  const exitShard=SHARDS.findIndex(p=>p.x===EXIT.x&&p.z===EXIT.z);assert.ok(exitShard>=0);
  const game=createGame();game.collected=new Set(SHARDS.map((_,i)=>i).filter(i=>i!==exitShard));game.enemyDelay=10000;
  tick(game,{x:0,z:0},.1);assert.equal(game.phase,'playing');assert.equal(game.collected.size,SHARDS.length-1);
  walkRoute(game,pathTo(START,EXIT));assert.equal(game.phase,'won');assert.equal(game.collected.size,SHARDS.length);
  assert.ok(game.collected.has(exitShard));assert.ok(distance(game.player,EXIT)<=RULES.exitRadius);
});
test('Restart creates an independent clean game', () => {
  const old = createGame(); old.collected.add(1); old.lives = 1; old.phase = 'lost';
  const fresh = createGame(); assert.equal(fresh.lives, 3); assert.equal(fresh.collected.size, 0);
  assert.deepEqual(fresh.player, START); assert.deepEqual(fresh.enemy, ENEMY_START); assert.equal(fresh.elapsed, 0);
});
test('Diagonal input has no speed advantage and walls block motion', () => {
  const {origin,direction,steps}=straightFixture(),g=createGame();g.player={...origin};g.enemyDelay=10000;
  tick(g, { x: 1, z: 1 }, .1);
  assert.ok(distance(g.player, origin) <= RULES.playerSpeed*.1+.000001);
  for (let i = 0; i < 1500; i++) tick(g, direction, 1 / 60);
  const travel=(g.player.x-origin.x)*direction.x+(g.player.z-origin.z)*direction.z;
  assert.ok(travel<=steps+.5-RULES.playerRadius+.001);assert.equal(blocked(g.player), false);
});
test('Identical manual and demo input produce identical simulation state', () => {
  const a = createGame(), b = createGame(), bot = new DemoController();
  for (let i = 0; i < runBudget*60 && a.phase !== 'won'; i++) {
    const input = bot.input(a, 1 / 60);
    tick(a, input, 1 / 60); tick(b, input, 1 / 60);
    assert.deepEqual(a, b);
  }
  assert.equal(a.phase, 'won');
});

for (const fps of [15, 30, 60, 144]) {
  test('Sprint speed, acceleration and short release inertia at ' + fps + ' FPS', () => {
    const walk = createGame(), run = createGame(),{origin,direction,steps}=straightFixture();
    for(const g of [walk,run]){g.player={...origin};g.enemyDelay=10000;}
    for (let i = 0; i < fps; i++) {
      tick(walk, direction, 1 / fps);
      tick(run, { ...direction, run: true }, 1 / fps);
    }
    assert.ok(distance(run.player, origin) > distance(walk.player, origin) * 1.5);
    assert.ok(Math.abs(Math.hypot(run.playerVelocity.x,run.playerVelocity.z) - RULES.sprintSpeed) < .00001);
    assert.ok(Math.abs(Math.hypot(walk.playerVelocity.x,walk.playerVelocity.z) - RULES.playerSpeed) < .00001);
    assert.ok(RULES.playerSpeed < RULES.enemySpeed && RULES.enemySpeed < RULES.sprintSpeed);
    const stopped = { ...run.player };
    tick(run, { x: 0, z: 0, run: true }, 1 / fps);
    assert.ok(distance(run.player,stopped)>0);assert.equal(run.sprinting, false);
    for(let i=0;i<Math.ceil(RULES.movementInertia*fps)+1;i++)tick(run,{x:0,z:0},1/fps);
    assert.equal(run.moveSpeed,0);assert.ok(distance(run.player,stopped)<=RULES.sprintSpeed*RULES.movementInertia);
    const settled={...run.player};tick(run,{x:0,z:0},1/fps);assert.deepEqual(run.player,settled);
    const diagonal = createGame(), straight = createGame();
    for(const g of [diagonal,straight])g.player={...origin};
    tick(diagonal, { x: 1, z: 1, run: true }, .1);
    tick(straight, { ...direction, run: true }, .1);
    assert.ok(Math.abs(distance(diagonal.player, origin) - distance(straight.player, origin)) < .00001);
    for (let i = 0; i < fps * 5; i++) tick(run, { ...direction, run: true }, 1 / fps);
    assert.equal(blocked(run.player), false);
    assert.ok((run.player.x-origin.x)*direction.x+(run.player.z-origin.z)*direction.z <= steps+.5-RULES.playerRadius+.001);
  });
}

test('Final escape pursuit is faster and matches player sprint', () => {
  const normal=createGame(),escape=createGame(),{origin,direction}=straightFixture();
  for(const g of [normal,escape]){g.player={x:origin.x+direction.x*4,z:origin.z+direction.z*4};g.enemy={...origin};g.enemyDelay=0;}
  escape.collected=new Set(SHARDS.map((_,i)=>i));
  tick(normal,{x:0,z:0},.1);tick(escape,{x:0,z:0},.1);
  assert.ok(Math.abs(distance(escape.enemy,origin)-RULES.escapeEnemySpeed*.1)<.00001);
  assert.ok(distance(escape.enemy,origin)>distance(normal.enemy,origin));assert.ok(RULES.escapeEnemySpeed===RULES.sprintSpeed);
});
test('Pickup trails are collected from the side of a clear corridor',()=>{
  const game=createGame(),index=SHARDS.findIndex(p=>!blocked({x:p.x,z:p.z+.5-wallInset()-RULES.playerRadius-.001})),shard=SHARDS[index];
  assert.ok(index>=0);game.player={x:shard.x,z:shard.z+.5-wallInset()-RULES.playerRadius-.001};tick(game,{x:0,z:0},1/60);
  assert.equal(blocked(game.player),false);assert.ok(game.collected.has(index));
});

test('Dying after collection cannot automatically win at the respawn point',()=>{
  const game=createGame();game.player={...ENTRY_GATE.outside};game.collected=new Set(SHARDS.map((_,i)=>i));game.enemy={...game.player};game.enemyDelay=0;
  tick(game,{x:0,z:0},1/60);assert.equal(game.phase,'caught');assert.equal(game.lives,2);
  while(game.phase==='caught')tick(game,{x:0,z:0},1/60);
  while(game.phase==='respawn')tick(game,{x:0,z:0},1/60);
  assert.deepEqual(game.player,START);assert.equal(isInSafeRoom(game.player),true);
  assert.equal(game.collected.size,SHARDS.length);assert.equal(game.entryOpened,true);
  for(let frame=0;frame<60;frame++)tick(game,{x:0,z:0},1/60);
  assert.equal(game.phase,'playing');assert.deepEqual(game.player,START);
  walkRoute(game,pathTo(START,EXIT));
  assert.equal(game.phase,'won');
});

for(const fps of [15,30,60,144])test('Demo camera turns continuously without backward sliding at '+fps+' FPS',()=>{
  const game=createGame(),bot=new DemoController();let frames=0;
  while(game.phase!=='won'&&game.phase!=='lost'&&frames++<fps*runBudget){
    const before=bot.yaw,oldDeaths=bot.deaths,input=bot.input(game,1/fps);
    if(oldDeaths===game.deaths)assert.ok(Math.abs(bot.yaw-before)<=DEMO_CAMERA.maxTurnSpeed/fps+.000001);
    assert.ok(Math.hypot(input.x,input.z)<=1.000001);
    if(Math.hypot(input.x,input.z)>.01)assert.ok(-Math.sin(bot.yaw)*input.x-Math.cos(bot.yaw)*input.z>=-.05);
    tick(game,input,1/fps);
  }
  assert.equal(game.phase,'won');
});


test('Contact freezes the contact location; relocation only follows the complete scare',()=>{
  const game=createGame();game.player={...SHARDS.find(p=>distance(p,START)>2)};game.enemy={...game.player};game.enemyDelay=0;game.collected.add(0);
  tick(game,{x:0,z:0},1/60);const point={...game.player},elapsed=game.elapsed;
  assert.equal(game.phase,'caught');assert.notDeepEqual(point,START);assert.ok(game.events.includes('hit'));assert.ok(!game.events.includes('relocate'));
  for(let i=0;i<45;i++){tick(game,{x:1,z:1,run:true},1/60);assert.deepEqual(game.player,point);assert.equal(game.elapsed,elapsed);assert.equal(game.lives,2);}
  let relocated=false;while(game.phase==='caught'){const events=tick(game,{x:0,z:0},1/60);relocated||=events.includes('relocate');}
  assert.ok(relocated);assert.deepEqual(game.player,START);assert.equal(game.phase,'respawn');assert.ok(game.collected.has(0));
});
test('The final life also shows the scare before the loss screen',()=>{
  const g=createGame();g.player={...ENTRY_GATE.outside};g.lives=1;g.enemy={...g.player};g.enemyDelay=0;
  tick(g,{x:0,z:0},1/60);assert.equal(g.phase,'caught');assert.ok(!g.events.includes('lost'));
  while(g.phase==='caught')tick(g,{x:0,z:0},1/60);
  assert.equal(g.phase,'lost');assert.ok(g.events.includes('lost'));assert.ok(!g.events.includes('relocate'));
});
test('A complete run never warps position during movement or on contact',()=>{
  const g=createGame(),bot=new DemoController();let relocations=0;
  for(let i=0;i<runBudget*60&&!['won','lost'].includes(g.phase);i++){
    const before={...g.player},phase=g.phase,events=tick(g,bot.input(g,1/60),1/60);
    if(events.includes('relocate')){relocations++;assert.equal(phase,'caught');assert.equal(g.phase,'respawn');}
    else assert.ok(distance(before,g.player)<=RULES.sprintSpeed/60+.00001);
  }
  assert.equal(g.phase,'won');assert.equal(relocations,g.deaths);
});
test('A stalled frame cannot cause a large catch-up movement',()=>{
  assert.equal(stableFrameDt(1/15),1/15);assert.equal(stableFrameDt(1/144),1/144);
  for(const stall of [.12,.5,2,8]){const g=createGame();tick(g,{x:1,z:0,run:true},stableFrameDt(stall));assert.ok(distance(g.player,START)<.05);}
  assert.equal(stableFrameDt(NaN),0);
});
test('Enemy proximity increases heartbeat loudness and tempo; walls muffle footsteps',()=>{
  let gain=0,interval=Infinity,steps=0;
  for(const d of [12,9,7,5,3,1,.3]){const m=proximityMix(d);assert.ok(m.heartGain>=gain);assert.ok(m.heartInterval<=interval);assert.ok(m.footGain>=steps);gain=m.heartGain;interval=m.heartInterval;steps=m.footGain;}
  assert.equal(proximityMix(20).voiceGain,0);assert.equal(proximityMix(20).heartGain,0);
  assert.ok(proximityMix(3,true).footGain<proximityMix(3).footGain);assert.ok(proximityMix(3,true).footGain>.1);
});
