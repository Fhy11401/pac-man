import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PREVIEW_STORAGE_KEY} from '../src/map-draft.js';
// The editable legacy layout deliberately retains its eight partitions. This
// exercises imported-map runtime physics even when the default has no dividers.
const imported=JSON.parse(readFileSync(new URL('../assets/maps/maplab-before-editor.json',import.meta.url),'utf8'));
globalThis.window={location:{search:'?mapDraft=partition-fixture'},localStorage:{getItem:key=>key===PREVIEW_STORAGE_KEY?JSON.stringify([{id:'partition-fixture',createdAt:Date.now(),document:imported}]):null}};
const {createGame:createInitialGame,tick,blocked}=await import('../src/core.js');
const {DemoController}=await import('../src/demo.js');
const {MAP,START,START_YAW,EXIT,SHARDS,RULES,MAP_DRAFT_ERROR,transitionWalls,wallInset,neighbors,isOpen,isInSafeRoom,edgeIsOpen,distance}=await import('../src/world.js');
const {hasMazeSight}=await import('../src/visibility.js');
delete globalThis.window;
assert.equal(MAP_DRAFT_ERROR,null);assert.equal(transitionWalls().length,8);

const widths=[1.3,1.5,1.9,2.4],radii=[.12,.15,.19];
const near=(a,b,eps=3e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} differs from ${b}`);
const fillCollection=game=>{game.collected=new Set(SHARDS.map((_,index)=>index));};
function createGame(tuning){const game=createInitialGame(tuning);game.entryOpened=true;return game;}

test('live game collision, pickup and movement respect all partitions at every width',()=>{
  for(const width of widths)for(const radius of radii)for(const wall of transitionWalls(width))for(const [from,to] of [[wall.a,wall.b],[wall.b,wall.a]]){
    const game=createGame({corridorWidth:width,playerRadius:radius});game.player={...from};game.enemyDelay=10000;
    const direction={x:to.x-from.x,z:to.z-from.z};
    assert.equal(blocked(wall,radius,width),true);
    for(let frame=0;frame<90;frame++){
      tick(game,{...direction,run:true},1/60);
      assert.equal(blocked(game.player,radius,width),false);
    }
    const progress=(game.player.x-from.x)*direction.x+(game.player.z-from.z)*direction.z;
    near(progress,.5-.19-radius);
    near(game.motionVelocity.x*direction.x+game.motionVelocity.z*direction.z,0);
    const farShard=SHARDS.findIndex(p=>p.x===to.x&&p.z===to.z);
    if(farShard>=0)assert.equal(game.collected.has(farShard),false,'touching a wall cannot collect through it');
    assert.equal(game.phase,'playing');
  }
});

test('live blocked checks expand the partition endpoints when corridor width changes',()=>{
  const outsideWideEndpoint={x:15.5,z:8.64};
  assert.equal(blocked(outsideWideEndpoint,.12,2.4),false);
  assert.equal(blocked(outsideWideEndpoint,.12,1.3),true);
});

test('an enemy rejects a stale target across a partition and pursues by a legal route',()=>{
  for(const width of widths)for(const wall of transitionWalls(width)){
    const game=createGame({corridorWidth:width});game.player={...wall.b};game.enemy={...wall.a};game.enemyNext={...wall.b};game.enemyDelay=0;
    tick(game,{x:0,z:0},1/120);
    assert.deepEqual(game.enemy,wall.a);assert.equal(game.enemyNext,null);
    for(let frame=0;frame<6000&&game.phase==='playing';frame++){
      const before={...game.enemy};tick(game,{x:0,z:0},1/60);
      assert.equal(blocked(game.enemy,RULES.enemyRadius,width),false);
      assert.ok(distance(before,game.enemy)<=RULES.enemySpeed/60+1e-7);
      assert.equal(hasMazeSight(before,game.enemy,width),true);
    }
    assert.equal(game.phase,'caught','the enemy must find the detour, not remain stuck against the partition');
  }
});

test('off-centre pursuit rejoins the corridor before rounding an inside corner',()=>{
  let checked=0;
  for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[z].length;x++){
    if(!isOpen(x,z))continue;const corner={x,z};
    for(const incoming of neighbors(corner))for(const outgoing of neighbors(corner)){
      if(isInSafeRoom(corner)||isInSafeRoom(outgoing))continue;
      if((incoming.x-x)*(outgoing.x-x)+(incoming.z-z)*(outgoing.z-z)!==0)continue;
      if(isOpen(incoming.x+outgoing.x-x,incoming.z+outgoing.z-z))continue;
      const game=createGame();game.enemy={x:x+(incoming.x-x)*.29,z:z+(incoming.z-z)*.29};game.player={...outgoing};game.enemyDelay=0;
      if(blocked(game.enemy,RULES.enemyRadius))continue;
      for(let frame=0;frame<180&&game.phase==='playing';frame++){
        tick(game,{x:0,z:0},1/60);assert.equal(blocked(game.enemy,RULES.enemyRadius),false);
      }
      assert.equal(game.phase,'caught',`enemy stuck rounding ${x},${z}`);checked++;
    }
  }
  assert.ok(checked>20);
});

test('unreachable targets do not invoke a direct movement fallback through a wall',()=>{
  const game=createGame();game.player={x:0,z:0};game.enemyDelay=0;const before={...game.enemy};
  for(let frame=0;frame<60;frame++)tick(game,{x:0,z:0},1/60);
  assert.deepEqual(game.enemy,before);assert.equal(game.enemyNext,null);
});

test('exit arrival covers wall-side travel without triggering from adjacent cells',()=>{
  for(const width of widths)for(const radius of radii){
    const clearance=.5-wallInset(width)-radius,reach=Math.max(RULES.exitRadius,clearance+.04);
    assert.ok(reach>=.25&&reach<.5);
    const from=neighbors(EXIT).find(p=>p.x!==EXIT.x);assert.ok(from,'exit must have a horizontal approach');
    for(const side of [-1,1]){
      const game=createGame({corridorWidth:width,playerRadius:radius});game.player={x:from.x,z:from.z+side*(clearance-.002)};game.enemyDelay=10000;fillCollection(game);
      assert.equal(blocked(game.player,radius,width),false);
      tick(game,{x:0,z:0},1/60);assert.equal(game.phase,'playing');
      for(let frame=0;frame<120&&game.phase==='playing';frame++){
        tick(game,{x:Math.sign(EXIT.x-from.x),z:0},1/60);
        assert.equal(blocked(game.player,radius,width),false);
      }
      assert.equal(game.phase,'won');assert.ok(distance(game.player,EXIT)<=reach);
      assert.ok(Math.abs(game.player.x-EXIT.x)<.5);
    }
    const outside=createGame({corridorWidth:width,playerRadius:radius});outside.enemyDelay=10000;fillCollection(outside);
    outside.player={x:EXIT.x+reach+.002,z:EXIT.z};tick(outside,{x:0,z:0},1/60);assert.equal(outside.phase,'playing');
    outside.player={x:EXIT.x+reach-.002,z:EXIT.z};tick(outside,{x:0,z:0},1/60);assert.equal(outside.phase,'won');
  }
  const locked=createGame();locked.player={...EXIT};locked.enemyDelay=10000;
  tick(locked,{x:0,z:0},1/60);assert.equal(locked.phase,'playing');
});

test('spawn and demo respawn face a traversable edge from the reception desk',()=>{
  const front={x:START.x+Math.round(-Math.sin(START_YAW)),z:START.z+Math.round(-Math.cos(START_YAW))};
  assert.equal(edgeIsOpen(START,front),true);
  const game=createGame(),bot=new DemoController();assert.equal(bot.yaw,START_YAW);
  bot.yaw=0;bot.deaths=0;game.deaths=1;game.phase='respawn';bot.input(game,1/60);
  assert.equal(bot.yaw,START_YAW);near(bot.travel.x,front.x-START.x);near(bot.travel.z,front.z-START.z);
  game.phase='playing';game.enemyDelay=10000;tick(game,{x:front.x-START.x,z:front.z-START.z},.1);
  assert.ok(distance(game.player,START)>.05);assert.equal(blocked(game.player),false);
});
