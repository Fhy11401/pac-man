import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP,MAP_WIDTH,MAP_HEIGHT,MAP_CENTER,FINE_TOPOLOGY,FINE_STATS,START,START_YAW,ENEMY_START,EXIT,SHARDS,SAFE_ROOM,ENTRY_GATE,isInSafeRoom,gateWall,RULES,CELL_SIZE,BLOCKED_TRANSITIONS,NARROW_WALLS,SOLID_WALLS,NAV_EDGES,isOpen,neighbors,edgeIsOpen,transitionToken,transitionKey,transitionWallRect,transitionWalls,routesFrom,pathTo,routeCacheInfo,coarseStats,key,distance,wallInset} from '../src/world.js';
import {createDefaultMapDocument} from '../src/map-document.js';
import {slideMove,movementVelocity} from '../src/movement.js';
import {hasMazeSight,dangerGlowOpacity} from '../src/visibility.js';
import {DEFAULT_TUNING,MOVEMENT_KEYS} from '../src/tuning.js';
import {analyzeMap} from '../src/map-analysis.js';
import {straightCorridor} from './helpers/map-fixtures.js';

const startupCache=routeCacheInfo(),widths=[1.3,1.5,1.9,2.4];
const open=MAP.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x,z}]));
const pairs=open.flatMap(a=>[{x:a.x+1,z:a.z},{x:a.x,z:a.z+1}].filter(b=>isOpen(b.x,b.z)).map(b=>[a,b]));
const near=(a,b,tolerance=2e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const bundled=JSON.parse(readFileSync(new URL('../DEFAULT_MAP.json',import.meta.url),'utf8'));
// Runtime markers overlay display tiles; the underlying collectible remains in the document and SHARDS.
const runtimeTiles=MAP.map((row,z)=>[...row].map((tile,x)=>tile==='S'||tile==='E'?bundled.tiles[z][x]:tile).join(''));
const definition={tiles:runtimeTiles,start:START,enemy:ENEMY_START,exit:EXIT,barriers:BLOCKED_TRANSITIONS,safeRoom:SAFE_ROOM,entryGate:ENTRY_GATE};
const bundledAnalysis=analyzeMap(bundled),expectedEdges=bundledAnalysis.stats.cells-bundledAnalysis.stats.components+bundledAnalysis.stats.cycles;

test('runtime topology preserves the complete bundled default document',()=>{
  assert.deepEqual(createDefaultMapDocument(),bundled);
  assert.deepEqual(BLOCKED_TRANSITIONS,[],'only the dynamic entry boards remain in the default map');
  assert.deepEqual(runtimeTiles,bundled.tiles);
  assert.equal(MAP[START.z][START.x],'S');assert.equal(MAP[ENEMY_START.z][ENEMY_START.x],'E');
  assert.equal(MAP_WIDTH,bundled.width);assert.equal(MAP_HEIGHT,bundled.height);assert.deepEqual(MAP_CENTER,{x:(bundled.width-1)/2,z:(bundled.height-1)/2});
  assert.equal(open.length,bundledAnalysis.stats.cells);assert.equal(SHARDS.length,bundledAnalysis.stats.shards);assert.equal(new Set(SHARDS.map(key)).size,SHARDS.length);
  assert.deepEqual(START,bundled.start);assert.deepEqual(ENEMY_START,bundled.enemy);assert.deepEqual(EXIT,bundled.exit);
  assert.equal(pairs.length,expectedEdges+bundled.barriers.length);assert.equal(NAV_EDGES,expectedEdges);assert.equal(NARROW_WALLS.length+SOLID_WALLS.length,bundled.barriers.length);
  assert.deepEqual(coarseStats(),{nodes:open.length,adjacentPairs:pairs.length,edges:expectedEdges,components:1,reachable:open.length,degreeOne:bundledAnalysis.deadEnds.length,isolated:0,cycleRank:bundledAnalysis.stats.cycles});
  assert.deepEqual(FINE_STATS,{vertices:open.length+expectedEdges,edges:expectedEdges*2,cycleRank:bundledAnalysis.stats.cycles});
  const expected=new Set(bundled.barriers.map(t=>transitionKey(t.a,t.b))),actual=new Set(pairs.filter(([a,b])=>!edgeIsOpen(a,b)).map(([a,b])=>transitionKey(a,b)));
  assert.deepEqual(actual,expected);assert.equal(actual.size,bundled.barriers.length);
  assert.equal(edgeIsOpen(ENTRY_GATE.inside,ENTRY_GATE.outside),true);
});

test('all default crystal targets and the exit are reachable using only approved edges',()=>{
  const paths=routesFrom(START);
  for(const target of [...SHARDS,EXIT,ENEMY_START,...open]){
    const path=paths.get(target);assert.ok(path.length,`unreachable ${key(target)}`);assert.deepEqual(path[0],START);assert.deepEqual(path.at(-1),target);
    for(let i=1;i<path.length;i++)assert.ok(edgeIsOpen(path[i-1],path[i]));
  }
  // Callers may edit a returned plan without corrupting a cached predecessor tree.
  const path=paths.get(EXIT);path[1].x=-99;assert.ok(paths.get(EXIT).every(p=>isOpen(p.x,p.z)));
});

test('default cells, markers, barriers and analysis retain the approved map without inherited layout edits',()=>{
  assert.deepEqual(SAFE_ROOM,bundled.safeRoom);assert.deepEqual(ENTRY_GATE,bundled.entryGate);
  assert.deepEqual(BLOCKED_TRANSITIONS.map(({a,b})=>({a,b})),bundled.barriers);
  const analysis=analyzeMap(definition);
  assert.deepEqual(analysis.stats,bundledAnalysis.stats);assert.deepEqual(analysis.deadEnds,bundledAnalysis.deadEnds);
  assert.deepEqual(analysis.shortTurns,bundledAnalysis.shortTurns);assert.deepEqual(analysis.warnings,bundledAnalysis.warnings);
  assert.deepEqual(analysis.unreachable,[]);
  const expectedShards=bundled.tiles.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='*'?[{x,z}]:[]));
  assert.deepEqual(SHARDS,expectedShards);
  for(const marker of [ENEMY_START,EXIT])if(bundled.tiles[marker.z][marker.x]==='*')assert.ok(SHARDS.some(p=>key(p)===key(marker)),'a marker cannot erase its underlying crystal');
  for(let z=0;z<MAP_HEIGHT;z++)for(let x=0;x<MAP_WIDTH;x++)assert.equal(FINE_TOPOLOGY[z*2][x*2],MAP[z][x]);
});

test('the empty safe room has one north entry, a closed perimeter and no permanent entry blocker',()=>{
  assert.deepEqual(SAFE_ROOM,{minX:15,maxX:16,minZ:15,maxZ:16});assert.equal(START_YAW,0);
  assert.deepEqual(ENTRY_GATE,{x:16,z:13.5,inside:{x:16,z:14},outside:{x:16,z:13}});
  const safe=open.filter(isInSafeRoom),exits=safe.flatMap(a=>neighbors(a).filter(b=>!isInSafeRoom(b)).map(b=>[a,b]));
  assert.equal(safe.length,5);assert.deepEqual(exits,[[ENTRY_GATE.inside,ENTRY_GATE.outside]]);
  assert.ok(safe.every(p=>MAP[p.z][p.x]!=='*'));
  for(const p of [{x:15,z:14},{x:14,z:15},{x:14,z:16},{x:17,z:15},{x:17,z:16},{x:15,z:17},{x:16,z:17}])assert.equal(isOpen(p.x,p.z),false);
  assert.equal(edgeIsOpen(ENTRY_GATE.inside,ENTRY_GATE.outside),true);
  assert.ok(BLOCKED_TRANSITIONS.every(t=>transitionKey(t.a,t.b)!==transitionKey(ENTRY_GATE.inside,ENTRY_GATE.outside)));
  // The protected room contributes one loop independently of the main maze.
  const maze=open.filter(p=>!isInSafeRoom(p)),edges=maze.reduce((sum,p)=>sum+neighbors(p).filter(n=>!isInSafeRoom(n)).length,0)/2;
  assert.equal(edges-maze.length+1,bundledAnalysis.stats.cycles-1);
});

test('safe-area boundaries exclude the hall and walls; dynamic gate bounds track corridor width',()=>{
  for(const p of [START,{x:15,z:15},{x:16,z:13.50001},{x:14.5,z:15},{x:16.5,z:16.5}])assert.equal(isInSafeRoom(p),true,`safe ${key(p)}`);
  for(const p of [{x:16,z:13.5},{x:16,z:13.49},{x:15,z:14},{x:14,z:14},{x:15.49,z:14.49},{x:14.49,z:15},{x:16.51,z:15},{x:16,z:16.51},{x:NaN,z:15}])assert.equal(isInSafeRoom(p),false,`unsafe ${key(p)}`);
  assert.equal(isInSafeRoom(null),false);
  for(const width of widths){const wall=gateWall(width);near(wall.x,ENTRY_GATE.x);near(wall.z,ENTRY_GATE.z);near(wall.halfZ,.03);near(wall.halfX,.5+wallInset(width));}
  for(const width of [0,NaN,CELL_SIZE+.01])assert.throws(()=>gateWall(width),RangeError);
});

test('startup validates one spawn tree and further BFS trees are lazy and bounded',()=>{
  assert.deepEqual(startupCache,{trees:1,builtTrees:1,limit:64});
  for(const point of open)routesFrom(point);
  assert.equal(routeCacheInfo().trees,64);assert.ok(routeCacheInfo().builtTrees>=open.length);
  const result=routesFrom(ENEMY_START);assert.equal(routesFrom(ENEMY_START),result);
});

test('non-adjacent, diagonal, same-cell and fractional transition queries cannot open an edge',()=>{
  const invalid=[[{x:15,z:8},{x:16,z:9}],[START,START],[{x:15,z:9},{x:15,z:11}],[{x:15.5,z:9},{x:15.5,z:10}],[{x:NaN,z:9},START],[null,START]];
  for(const [a,b] of invalid){assert.equal(edgeIsOpen(a,b),false);assert.equal(transitionToken(a,b),'#');assert.equal(transitionKey(a,b),null);assert.throws(()=>transitionWallRect(a,b),RangeError);}
  assert.equal(isOpen(15.5,9),false);assert.deepEqual(routesFrom({x:0,z:0}).get(START),[]);
  const front={x:START.x+Math.round(-Math.sin(START_YAW)),z:START.z+Math.round(-Math.cos(START_YAW))};assert.ok(edgeIsOpen(START,front));
});

test('editable partition bounds stop swept movement in both directions at every supported width',()=>{
  const [a,b]=pairs.find(([a,b])=>edgeIsOpen(a,b));
  for(const width of widths)for(const radius of [.12,.15,.19])for(const [from,to] of [[a,b],[b,a]]){
    const dx=to.x-from.x,dz=to.z-from.z,result=slideMove(from,{x:dx*2.4,z:dz*2.4},radius,width,[transitionWallRect(a,b,width)]);
    const progress=(result.position.x-from.x)*dx+(result.position.z-from.z)*dz;
    near(progress,.5-.19-radius);assert.ok(result.contacts.length>0);assert.ok(result.contacts[0].nx*dx+result.contacts[0].nz*dz<-.99);
  }
});

test('every navigable center-to-center edge remains physically open and visible at narrow and wide settings',()=>{
  for(const width of widths)for(const [a,b] of pairs.filter(([a,b])=>edgeIsOpen(a,b)))for(const radius of [.12,.19]){
    for(const [from,to] of [[a,b],[b,a]]){
      const result=slideMove(from,{x:to.x-from.x,z:to.z-from.z},radius,width);
      assert.ok(distance(result.position,to)<2e-6,`blocked legal edge ${key(from)} to ${key(to)} at ${width}`);
      assert.equal(hasMazeSight(from,to,width),true,`occluded legal edge ${key(from)} to ${key(to)}`);
    }
  }
});

test('changing corridor width updates actual partition endpoint collision and sight',()=>{
  for(const width of widths)for(const wall of transitionWalls(width)){
    const cross=wall.a.x!==wall.b.x;near(cross?wall.halfX:wall.halfZ,.19);near(cross?wall.halfZ:wall.halfX,.5+wallInset(width));
    near(wall.x,(wall.a.x+wall.b.x)/2);near(wall.z,(wall.a.z+wall.b.z)/2);
  }
  assert.notEqual(transitionWalls(1.3),transitionWalls(2.4));assert.equal(transitionWalls(1.5),transitionWalls(1.5));
  const hall=straightCorridor(),a=hall.at(-.2,.4),b=hall.at(.2,.4);
  assert.equal(hasMazeSight(a,b,1.3),false);assert.equal(hasMazeSight(a,b,2.4),true);
  assert.ok(slideMove(hall.at(0),{x:0,z:.35},.12,1.3).position.z<hall.origin.z+.2);near(slideMove(hall.at(0),{x:0,z:.35},.12,2.4).position.z,hall.origin.z+.35);
  assert.throws(()=>transitionWalls(0),RangeError);assert.throws(()=>transitionWalls(NaN),RangeError);assert.throws(()=>transitionWalls(CELL_SIZE+.1),RangeError);
});

test('weighted routes match an independent shortest-path solution without bypassing blockers',()=>{
  const cost=p=>1+(p.x<14?5:0)+(p.z===13?3:0),distances=new Map([[key(START),0]]),unvisited=new Map(open.map(p=>[key(p),p]));
  while(unvisited.size){
    let best=null,value=Infinity;for(const [k,p] of unvisited){const d=distances.get(k)??Infinity;if(d<value){best=p;value=d;}}
    if(!best)break;unvisited.delete(key(best));for(const n of neighbors(best)){const k=key(n),next=value+cost(n);if(next<(distances.get(k)??Infinity))distances.set(k,next);}
  }
  const paths=routesFrom(START,cost);
  for(const target of [EXIT,ENEMY_START,...SHARDS.filter((_,i)=>i%11===0)]){
    const path=paths.get(target),total=path.slice(1).reduce((sum,p)=>sum+cost(p),0);near(total,distances.get(key(target)));
    for(let i=1;i<path.length;i++)assert.ok(edgeIsOpen(path[i-1],path[i]));
  }
  assert.throws(()=>routesFrom(START,()=>-1),RangeError);
});

test('map transplantation retains the v290 movement defaults and short acceleration',()=>{
  for(const name of MOVEMENT_KEYS)assert.equal(RULES[name],DEFAULT_TUNING[name]);
  assert.equal(RULES.playerSpeed,1.6);assert.equal(RULES.sprintSpeed,2.8);assert.equal(RULES.movementInertia,.06);
  const first=movementVelocity({x:0,z:0},{x:1,z:0,run:true},RULES,1/60);assert.ok(first.x>0&&first.x<RULES.sprintSpeed);
  const reversal=movementVelocity({x:1.6,z:0},{x:-1,z:0},RULES,1/240);assert.ok(reversal.x>0&&reversal.x<1.6);
});

const fixture=(points,extra={})=>{
  const tiles=Array.from({length:9},()=>Array(10).fill('#'));
  for(const p of points)tiles[p.z][p.x]='.';
  return{tiles:tiles.map(row=>row.join('')),start:points[0],barriers:[],...extra};
};
const line=(x,z,endX,endZ)=>Array.from({length:Math.abs(endX-x)+Math.abs(endZ-z)+1},(_,i)=>({x:x+Math.sign(endX-x)*i,z:z+Math.sign(endZ-z)*i}));

test('analysis distinguishes forced short bends, long bends and optional junction zigzags',()=>{
  const short=analyzeMap(fixture([...line(1,1,4,1),...line(4,1,4,3),...line(4,3,7,3)]));
  assert.equal(short.stats.corners,2);assert.equal(short.shortTurns.length,1);assert.equal(short.shortTurns[0].distance,2);
  assert.deepEqual(short.shortTurns[0].cells,[{x:4,z:1},{x:4,z:2},{x:4,z:3}]);
  const long=analyzeMap(fixture([...line(1,1,4,1),...line(4,1,4,5),...line(4,5,7,5)]));
  assert.deepEqual(long.shortTurns,[]);
  const junction=analyzeMap(fixture([...line(2,1,2,3),...line(1,3,4,3),...line(4,3,4,5)]));
  assert.deepEqual(junction.shortTurns,[]);assert.equal(junction.warnings.length,1);assert.equal(junction.warnings[0].distance,2);
  const interrupted=analyzeMap(fixture([...line(1,1,2,1),...line(2,1,2,4),{x:3,z:4},{x:3,z:2}]));
  assert.deepEqual(interrupted.shortTurns,[]);
  assert.ok(interrupted.warnings.some(w=>w.distance===3&&key(w.cells[0])==='2,1'&&key(w.cells.at(-1))==='2,4'));
});

test('analysis excludes actual open plazas and safe rooms while respecting barriers and disconnected islands',()=>{
  const square=[{x:1,z:1},{x:2,z:1},{x:1,z:2},{x:2,z:2}];
  const plaza=analyzeMap(fixture(square));assert.equal(plaza.stats.cycles,1);assert.equal(plaza.stats.corners,0);
  const divider={a:{x:1,z:1},b:{x:2,z:1}},partitioned=analyzeMap(fixture(square,{barriers:[divider]}));
  assert.equal(partitioned.stats.cycles,0);assert.equal(partitioned.shortTurns.length,1);
  const safe=analyzeMap(fixture(square,{barriers:[divider],safeRoom:{minX:1,maxX:2,minZ:1,maxZ:2}}));assert.equal(safe.stats.corners,0);
  const disconnected=analyzeMap(fixture([...line(1,1,3,1),...line(6,5,8,5)]));
  assert.equal(disconnected.stats.components,2);assert.equal(disconnected.unreachable.length,3);assert.equal(disconnected.deadEnds.length,4);
});
