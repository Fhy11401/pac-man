import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,blocked} from '../src/core.js';
import {DemoController,DEMO_TIME_LIMIT} from '../src/demo.js';
import {canReachEntry,entryCollisionWalls,ENTRY_BREAK_SECONDS} from '../src/entry-state.js';
import {START,ENEMY_START,ENTRY_GATE,SHARDS,RULES,isInSafeRoom,distance,wallInset} from '../src/world.js';

const still={x:0,z:0},north={x:0,z:-1,heading:0},widths=[1.3,1.5,1.9,2.4],radii=[.12,.15,.19];

test('the first room permits movement while the timer, enemy and collection remain asleep',()=>{
  const game=createGame(),enemy={...game.enemy},delay=game.enemyDelay;
  for(let frame=0;frame<30;frame++)tick(game,{x:-1,z:0},1/60);
  assert.ok(distance(game.player,START)>.5);assert.ok(isInSafeRoom(game.player));
  for(let frame=0;frame<120;frame++)tick(game,still,1/60);
  assert.equal(game.entryOpened,false);assert.equal(game.elapsed,0);assert.equal(game.collected.size,0);
  assert.deepEqual(game.enemy,enemy);assert.equal(game.enemyDelay,delay);assert.equal(game.lives,RULES.lives);
  assert.equal(blocked(game.player),false);
});

test('closed boards physically stop a walk at every body size and corridor width',()=>{
  for(const width of widths)for(const radius of radii){
    const game=createGame({corridorWidth:width,playerRadius:radius});game.player={...ENTRY_GATE.inside};
    for(let frame=0;frame<90;frame++)tick(game,north,1/60);
    assert.equal(game.entryOpened,false);assert.equal(game.entryBreakTime,0);
    assert.ok(Math.abs(game.player.z-(ENTRY_GATE.z+.03+radius))<3e-6);
    assert.equal(game.elapsed,0);assert.ok(isInSafeRoom(game.player));assert.equal(entryCollisionWalls(game).length,1);
  }
});

test('E cannot open boards remotely, from outside, or through an opaque wall',()=>{
  for(const point of [START,ENTRY_GATE.outside,{x:ENTRY_GATE.x-.48,z:ENTRY_GATE.inside.z}]){
    const game=createGame();game.player={...point};assert.equal(canReachEntry(game),false);
    const events=tick(game,{...still,interact:true},1/60);
    assert.equal(game.entryOpened,false);assert.ok(!events.includes('boards-break'));
  }
});

test('a nearby E press breaks once, releases the obstacle and begins the existing pursuit delay',()=>{
  const game=createGame();game.player={...ENTRY_GATE.inside};const enemy={...game.enemy};let breaks=0;
  for(let frame=0;frame<60;frame++)breaks+=tick(game,{...still,interact:true},1/60).filter(event=>event==='boards-break').length;
  assert.equal(breaks,1);assert.equal(game.entryOpened,true);assert.equal(entryCollisionWalls(game).length,0);
  assert.equal(game.entryBreakTime,ENTRY_BREAK_SECONDS);assert.ok(Math.abs(game.elapsed-1)<1e-8);
  assert.ok(Math.abs(game.enemyDelay-(RULES.enemyDelay-1))<1e-8);assert.deepEqual(game.enemy,enemy);
});

test('sprinting sideways or backwards into the boards cannot imitate a forward charge',()=>{
  for(const input of [{x:0,z:-1,run:true,heading:Math.PI},{x:0,z:-1,run:true,heading:-Math.PI/2},{x:1,z:0,run:true,heading:0}]){
    const game=createGame();game.player={x:ENTRY_GATE.x,z:ENTRY_GATE.z+.22};
    for(let frame=0;frame<90;frame++)tick(game,input,1/60);
    assert.equal(game.entryOpened,false);assert.equal(game.elapsed,0);
  }
});

test('W and Shift break the actual door plane across the full usable width without a position jump',()=>{
  for(const width of widths)for(const radius of radii)for(const side of [-1,0,1]){
    const game=createGame({corridorWidth:width,playerRadius:radius}),edge=.5-wallInset(width)-radius-.002;
    game.player={x:ENTRY_GATE.x+side*edge,z:ENTRY_GATE.inside.z};let breaks=0;
    for(let frame=0;frame<90&&isInSafeRoom(game.player);frame++){
      const before={...game.player},events=tick(game,{...north,run:true},1/60);
      breaks+=events.filter(event=>event==='boards-break').length;
      assert.ok(distance(before,game.player)<=RULES.sprintSpeed/60+1e-8,'breaking boards must not relocate the player');
      assert.equal(blocked(game.player,radius,width),false);
      if(!game.entryOpened){assert.ok(game.player.z>ENTRY_GATE.z);assert.equal(game.elapsed,0);}
    }
    assert.equal(breaks,1);assert.equal(game.entryOpened,true);assert.equal(isInSafeRoom(game.player),false);
  }
});

test('the attendant waits outside and cannot damage a player who has returned to the safe room',()=>{
  const game=createGame();game.entryOpened=true;game.entryBreakTime=.8;game.enemyDelay=0;game.collected.add(0);
  for(let frame=0;frame<3600;frame++){
    tick(game,still,1/60);assert.equal(isInSafeRoom(game.enemy),false);assert.equal(blocked(game.enemy,RULES.enemyRadius),false);
    assert.equal(game.phase,'playing');assert.equal(game.lives,3);
  }
  assert.ok(distance(game.enemy,ENTRY_GATE.outside)<1e-5);assert.ok(game.elapsed>59);assert.ok(game.collected.has(0));
  game.player={x:ENTRY_GATE.x,z:ENTRY_GATE.z+.01};game.enemy={x:ENTRY_GATE.x,z:ENTRY_GATE.z-.2};game.enemyNext={...ENTRY_GATE.inside};
  assert.ok(distance(game.player,game.enemy)<RULES.playerRadius+RULES.enemyRadius);
  tick(game,still,1/60);assert.equal(game.phase,'playing');assert.equal(game.lives,3);assert.equal(isInSafeRoom(game.enemy),false);
});

test('a death returns to the room with an open door and progress; a fresh game closes it',()=>{
  const game=createGame();game.entryOpened=true;game.entryBreakTime=.8;game.collected=new Set([0,1,2]);
  game.player={...ENTRY_GATE.outside};game.enemy={...game.player};game.enemyDelay=0;
  tick(game,still,1/60);assert.equal(game.phase,'caught');const preserved=[...game.collected];
  while(game.phase==='caught')tick(game,still,1/60);
  assert.deepEqual(game.player,START);assert.deepEqual(game.enemy,ENEMY_START);assert.equal(game.phase,'respawn');
  assert.equal(game.entryOpened,true);assert.equal(game.entryBreakTime,.8);assert.deepEqual([...game.collected],preserved);
  while(game.phase==='respawn')tick(game,still,1/60);
  game.enemyDelay=10000;
  for(let frame=0;frame<240&&isInSafeRoom(game.player);frame++)assert.ok(!tick(game,north,1/60).includes('boards-break'));
  assert.equal(isInSafeRoom(game.player),false);
  const fresh=createGame();assert.equal(fresh.entryOpened,false);assert.equal(fresh.entryBreakTime,0);assert.equal(fresh.collected.size,0);
});

test('the demo walks to the boards, breaks them through normal input and can still finish the maze',()=>{
  for(const fps of [15,30,60,144]){
    const game=createGame(),bot=new DemoController();let breaks=0;
    for(let frame=0;frame<fps*8&&isInSafeRoom(game.player);frame++){
      const before={...game.player},events=tick(game,bot.input(game,1/fps),1/fps);
      assert.ok(distance(before,game.player)<=RULES.sprintSpeed/fps+1e-8);
      breaks+=events.filter(event=>event==='boards-break').length;
    }
    assert.equal(breaks,1);assert.ok(game.entryOpened);assert.equal(isInSafeRoom(game.player),false);
    if(fps===60){
      for(let frame=0;frame<fps*DEMO_TIME_LIMIT&&!['won','lost'].includes(game.phase);frame++)tick(game,bot.input(game,1/fps),1/fps);
      assert.equal(game.phase,'won');assert.equal(game.collected.size,SHARDS.length);assert.ok(game.lives>0);
    }
  }
});
