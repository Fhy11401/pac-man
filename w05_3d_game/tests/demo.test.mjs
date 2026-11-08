import test from 'node:test';
import assert from 'node:assert/strict';
import { MouseStroke, roundCorners, DemoController, DEMO_CAMERA } from '../src/demo.js';
import { MOUSE_RADIANS_PER_PIXEL } from '../src/look-input.js';
import { createGame as createInitialGame, tick, blocked } from '../src/core.js';
import { SHARDS, START, neighbors, distance, RULES } from '../src/world.js';
import {straightCorridor,rightAngle,heading,projection} from './helpers/map-fixtures.js';
import {slideMove} from '../src/movement.js';

function createGame(){const game=createInitialGame();game.entryOpened=true;return game;}

test('a nearby passed waypoint cannot leave the demo stopped while looking down the remaining route',()=>{
  const hall=straightCorridor();
  for(const fps of [15,30,60,144]){
    const game=createGame(),bot=new DemoController();game.player=hall.at(.045);game.enemy={x:-100,z:-100};game.enemyDelay=10000;
    bot.deaths=game.deaths;bot.route=[hall.at(0),hall.at(.6),hall.at(1.6)];bot.yaw=-Math.PI/2;bot.travel={x:1,z:0};
    const start={...game.player};
    for(let frame=0;frame<Math.ceil(fps*.3);frame++){
      const before={...game.player};tick(game,bot.input(game,1/fps),1/fps);
      assert.ok(distance(before,game.player)<=RULES.sprintSpeed/fps+1e-8);assert.equal(blocked(game.player),false);
    }
    assert.ok(game.player.x-start.x>.2,`a passed point stalled the demo at ${fps} FPS`);
  }
});

test('a passed point before a rounded corner resumes motion without a camera snap',()=>{
  const turn=rightAngle();
  for(const fps of [15,30,60,144]){
    const game=createGame(),bot=new DemoController();game.player=turn.at(-.955,0);game.enemy={x:-100,z:-100};game.enemyDelay=10000;
    bot.deaths=game.deaths;bot.route=[turn.at(-1,0),turn.at(-.4,0),turn.at(-.1,.1),turn.at(0,.4),turn.at(0,1)];bot.yaw=heading(turn.incoming);bot.travel={...turn.incoming};
    const start={...game.player};
    for(let frame=0;frame<Math.ceil(fps*.3);frame++){
      const before={...game.player},yaw=bot.yaw;tick(game,bot.input(game,1/fps),1/fps);
      assert.ok(Math.abs(bot.yaw-yaw)<=DEMO_CAMERA.maxTurnSpeed/fps+1e-8);
      assert.ok(distance(before,game.player)<=RULES.sprintSpeed/fps+1e-8);assert.equal(blocked(game.player),false);
    }
    assert.ok(projection(game.player,start,turn.incoming)>.2);
  }
});

test('a nearby waypoint is retained when bypassing it would clip the inside wall corner',()=>{
  const turn=rightAngle(),game=createGame(),bot=new DemoController();game.player=turn.at(-.3,.15);game.enemy={x:-100,z:-100};game.enemyDelay=10000;
  const first=turn.at(0,0),next=turn.at(0,1.2),delta={x:next.x-game.player.x,z:next.z-game.player.z};
  assert.equal(blocked(game.player),false);
  const attempt=slideMove(game.player,delta,game.tuning.playerRadius,game.tuning.corridorWidth);
  assert.ok(distance(attempt.position,next)>.01,'this fixture must actually require the intermediate corner');
  bot.deaths=game.deaths;bot.route=[first,next];bot.yaw=heading(turn.outgoing);bot.travel={...turn.outgoing};
  bot.input(game,1/15);assert.deepEqual(bot.route[0],first);
});

test('Mouse-like quarter turns accelerate, brake, and settle without overshooting', () => {
  for (const fps of [15, 30, 60, 144]) for (const sign of [-1, 1]) {
    const stroke = new MouseStroke(), target = sign * Math.PI / 2, speeds = [];
    let yaw = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      const turn = -stroke.step(target - yaw, 1 / fps) * MOUSE_RADIANS_PER_PIXEL;
      assert.ok(turn * sign >= -1e-9, 'a steady target must not cause a reverse twitch');
      assert.ok(Math.abs(turn) <= DEMO_CAMERA.maxTurnSpeed / fps + 1e-9);
      yaw += turn; speeds.push(Math.abs(turn) * fps);
      assert.ok(Math.abs(yaw) <= Math.abs(target) + 1e-9);
    }
    assert.ok(speeds[0] < Math.max(...speeds) * .75, 'start gently rather than instantly spinning');
    assert.ok(speeds.at(-1) < .001, 'settle rather than hit a hard stop');
    assert.ok(Math.abs(target - yaw) < .001);
  }
});

test('Rounded turns throughout the map clear walls and remain within pickup reach', () => {
  let turns = 0;
  for (const corner of [START, ...SHARDS]) for (const a of neighbors(corner)) for (const b of neighbors(corner)) {
    if ((a.x - corner.x) * (b.x - corner.x) + (a.z - corner.z) * (b.z - corner.z) !== 0) continue;
    const route = [a, ...roundCorners(a, [corner, b])];
    let nearest = Infinity;
    for (let i = 1; i < route.length; i++) for (let sample = 0; sample <= 20; sample++) {
      const t = sample / 20, p = {x: route[i-1].x + (route[i].x-route[i-1].x)*t, z: route[i-1].z + (route[i].z-route[i-1].z)*t};
      assert.equal(blocked(p), false);
      nearest = Math.min(nearest, distance(p, corner));
    }
    assert.ok(nearest < RULES.collectRadius);
    turns++;
  }
  assert.ok(turns > 20);
});

test('Demo completes under changing frame intervals without movement or camera jumps', () => {
  for (const pattern of [[1/24,1/48,1/90], [1/144,1/60,1/30,1/75], [1/60,1/60,1/15,1/60]]) {
    const game = createGame(), bot = new DemoController();
    for (let frame = 0, time = 0; time < Math.max(180,SHARDS.length*2.5) && !['won','lost'].includes(game.phase); frame++) {
      const dt = pattern[frame % pattern.length], before = {...game.player}, yaw = bot.yaw, deaths = bot.deaths;
      const input = bot.input(game, dt), events = tick(game, input, dt);
      if (deaths === bot.deaths) assert.ok(Math.abs(bot.yaw-yaw) <= DEMO_CAMERA.maxTurnSpeed*dt+1e-8);
      if (!events.includes('relocate')) assert.ok(distance(before, game.player) <= RULES.sprintSpeed*dt+1e-8);
      assert.equal(blocked(game.player), false);
      time += dt;
    }
    assert.equal(game.phase, 'won', `frame pattern ${pattern}`);
    assert.equal(game.collected.size, SHARDS.length);
  }
});
