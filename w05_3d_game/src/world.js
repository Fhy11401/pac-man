import {DEFAULT_TUNING,MOVEMENT_KEYS} from './tuning.js';
import {createDefaultMapDocument,validateMapDocument} from './map-document.js';
import {loadRuntimeMapDefinition} from './map-draft.js';

const selected=loadRuntimeMapDefinition();
export const IS_MAP_DRAFT=selected.isDraft,MAP_DRAFT_ERROR=selected.error;
// A rejected preview keeps imports usable only to display its error. main.js
// refuses to construct a renderer or start play whenever MAP_DRAFT_ERROR is set.
export const MAP_DOCUMENT=Object.freeze(selected.definition??createDefaultMapDocument());
const runtimeMap=MAP_DOCUMENT.tiles.map(row=>[...row]);
runtimeMap[MAP_DOCUMENT.start.z][MAP_DOCUMENT.start.x]='S';runtimeMap[MAP_DOCUMENT.enemy.z][MAP_DOCUMENT.enemy.x]='E';
const pairToken=(a,b)=>[`${a.x},${a.z}`,`${b.x},${b.z}`].sort().join('|');
function buildFineMap(map,barriers){
  const walls=new Set(barriers.map(({a,b})=>pairToken(a,b))),fine=Array.from({length:map.length*2-1},()=>Array(map[0].length*2-1).fill('#'));
  for(let z=0;z<map.length;z++)for(let x=0;x<map[z].length;x++)if(map[z][x]!=='#'){
    fine[z*2][x*2]=map[z][x];
    for(const b of [{x:x+1,z},{x,z:z+1}])if(map[b.z]?.[b.x]!==undefined&&map[b.z][b.x]!=='#')fine[z+b.z][x+b.x]=walls.has(pairToken({x,z},b))?(b.x!==x?'|':'-'):'.';
  }
  return fine.map(row=>row.join(''));
}

// Smooth map experiment. Simulation coordinates remain coarse cells.
export const MAP=Object.freeze(runtimeMap.map(row=>row.join(''))),FINE_TOPOLOGY=Object.freeze(buildFineMap(MAP,MAP_DOCUMENT.barriers));
export const MAP_WIDTH=MAP[0].length,MAP_HEIGHT=MAP.length;
export const MAP_CENTER=Object.freeze({x:(MAP_WIDTH-1)/2,z:(MAP_HEIGHT-1)/2});
export const START=Object.freeze({...MAP_DOCUMENT.start}),ENEMY_START=Object.freeze({...MAP_DOCUMENT.enemy}),EXIT=Object.freeze({...MAP_DOCUMENT.exit});
export const SAFE_ROOM=Object.freeze({...MAP_DOCUMENT.safeRoom});
export const ENTRY_GATE=Object.freeze({...MAP_DOCUMENT.entryGate,inside:Object.freeze({...MAP_DOCUMENT.entryGate.inside}),outside:Object.freeze({...MAP_DOCUMENT.entryGate.outside})});
export const CELL_SIZE=2.4;
export const wallInset=(width=DEFAULT_TUNING.corridorWidth)=>(CELL_SIZE-width)/(2*CELL_SIZE);
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const key=p=>`${p.x},${p.z}`;
export const cell=p=>({x:Math.round(p.x),z:Math.round(p.z)});
export const isOpen=(x,z)=>Number.isInteger(x)&&Number.isInteger(z)&&MAP[z]?.[x]!==undefined&&MAP[z][x]!=='#';
export function isInSafeRoom(p){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||p.x<SAFE_ROOM.minX-.5||p.x>SAFE_ROOM.maxX+.5||p.z<=ENTRY_GATE.z||p.z>SAFE_ROOM.maxZ+.5)return false;
  // Include the outer half-cell boundaries without classifying adjacent wall cells as safe.
  const x=Math.min(Math.round(p.x),SAFE_ROOM.maxX),z=Math.min(Math.round(p.z),SAFE_ROOM.maxZ);
  return isOpen(x,z)&&((x===ENTRY_GATE.inside.x&&z===ENTRY_GATE.inside.z)||(x>=SAFE_ROOM.minX&&z>=SAFE_ROOM.minZ));
}

const gridPoint=p=>Boolean(p)&&Number.isInteger(p.x)&&Number.isInteger(p.z);
const adjacent=(a,b)=>gridPoint(a)&&gridPoint(b)&&Math.abs(a.x-b.x)+Math.abs(a.z-b.z)===1;
export const transitionToken=(a,b)=>adjacent(a,b)?FINE_TOPOLOGY[a.z+b.z]?.[a.x+b.x]??'#':'#';
export const isTransitionOpen=(a,b)=>adjacent(a,b)&&isOpen(a.x,a.z)&&isOpen(b.x,b.z)&&!['#','|','-'].includes(transitionToken(a,b));
export const edgeIsOpen=isTransitionOpen;
export const isBlockedTransition=(a,b)=>!isTransitionOpen(a,b);
export function transitionKey(a,b){
  if(!adjacent(a,b))return null;
  const first=a.z<b.z||(a.z===b.z&&a.x<=b.x)?a:b,second=first===a?b:a;
  return `${key(first)}|${key(second)}`;
}
export const neighbors=p=>gridPoint(p)?[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}].filter(n=>isTransitionOpen(p,n)):[];
const towardEntry=neighbors(START).sort((a,b)=>distance(a,ENTRY_GATE.inside)-distance(b,ENTRY_GATE.inside))[0];
export const START_YAW=towardEntry?Math.atan2(START.x-towardEntry.x,START.z-towardEntry.z):0;

const freezeTransition=t=>Object.freeze({...t,a:Object.freeze({...t.a}),b:Object.freeze({...t.b})});
export const NARROW_WALLS=Object.freeze(MAP_DOCUMENT.barriers.map((t,index)=>freezeTransition({...t,id:`edge-${index+1}`,type:'narrow_wall'})));
export const SOLID_WALLS=Object.freeze([]);
export const BLOCKED_TRANSITIONS=Object.freeze([...NARROW_WALLS,...SOLID_WALLS]);

// Width changes alter the span to meet the surrounding expanded regular walls.
// The cross-passage thickness remains .38 cells for every consumer.
export function transitionWallRect(a,b,width=DEFAULT_TUNING.corridorWidth){
  if(!adjacent(a,b))throw new RangeError('Transition walls require adjacent integer cells');
  if(!Number.isFinite(width)||width<=0||width>CELL_SIZE)throw new RangeError('Invalid corridor width');
  const halfSpan=.5+wallInset(width),halfThickness=.19;
  return{x:(a.x+b.x)/2,z:(a.z+b.z)/2,halfX:a.x!==b.x?halfThickness:halfSpan,halfZ:a.x!==b.x?halfSpan:halfThickness};
}
// Breakable entry boards are dynamic obstacles, separate from the editable permanent partitions.
export function gateWall(width=DEFAULT_TUNING.corridorWidth){
  return Object.freeze({...transitionWallRect(ENTRY_GATE.inside,ENTRY_GATE.outside,width),halfZ:.03,id:'entry-gate',type:'breakable'});
}
const wallsByWidth=new Map();
export function transitionWalls(width=DEFAULT_TUNING.corridorWidth){
  if(!Number.isFinite(width)||width<=0||width>CELL_SIZE)throw new RangeError('Invalid corridor width');
  if(!wallsByWidth.has(width)){
    const walls=Object.freeze(BLOCKED_TRANSITIONS.map(t=>Object.freeze({...transitionWallRect(t.a,t.b,width),id:t.id,type:t.type,a:t.a,b:t.b})));
    if(wallsByWidth.size>=16)wallsByWidth.delete(wallsByWidth.keys().next().value);
    wallsByWidth.set(width,walls);
  }
  return wallsByWidth.get(width);
}
// Compatibility snapshot; live physics, sight and rendering use transitionWalls(width).
export const allTransitionWalls=transitionWalls();
export const SHARDS=Object.freeze(MAP_DOCUMENT.tiles.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='*'?[Object.freeze({x,z})]:[])));
export const RULES=Object.freeze({
  ...Object.fromEntries(MOVEMENT_KEYS.map(name=>[name,DEFAULT_TUNING[name]])),
  enemyRadius:.18,collectRadius:.43,lives:3,caughtSeconds:1.1,respawnSeconds:1.4,exitRadius:.25,enemyDelay:3.2,
});

const nodes=MAP.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x,z}]));
const graph=new Map(nodes.map(p=>[key(p),neighbors(p)]));
const routeTrees=new Map(),MAX_ROUTE_TREES=64;let builtTrees=0;
export const routeCacheInfo=()=>({trees:routeTrees.size,builtTrees,limit:MAX_ROUTE_TREES});
function pushHeap(heap,item){
  heap.push(item);let i=heap.length-1;
  while(i>0){const parent=(i-1)>>1;if(heap[parent].distance<=item.distance)break;heap[i]=heap[parent];i=parent;}heap[i]=item;
}
function popHeap(heap){
  const first=heap[0],last=heap.pop();if(!heap.length)return first;
  let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].distance<heap[child].distance)child++;if(heap[child].distance>=last.distance)break;heap[i]=heap[child];i=child;}heap[i]=last;return first;
}
export function routesFrom(from,cost){
  const start=cell(from),startKey=key(start);
  if(cost!==undefined&&typeof cost!=='function')throw new TypeError('Route cost must be a function');
  if(!cost&&routeTrees.has(startKey)){const cached=routeTrees.get(startKey);routeTrees.delete(startKey);routeTrees.set(startKey,cached);return cached;}
  const distances=new Map(),prev=new Map();
  if(isOpen(start.x,start.z)){
    distances.set(startKey,0);
    if(cost){
      const heap=[];pushHeap(heap,{point:start,distance:0});
      while(heap.length){
        const current=popHeap(heap),currentKey=key(current.point);if(current.distance!==distances.get(currentKey))continue;
        for(const n of graph.get(currentKey)){
          const step=cost(n);if(!Number.isFinite(step)||step<0)throw new RangeError('Route cost must be finite and nonnegative');
          const k=key(n),next=current.distance+step;if(next>=(distances.get(k)??Infinity))continue;
          distances.set(k,next);prev.set(k,current.point);pushHeap(heap,{point:n,distance:next});
        }
      }
    }else{
      // O(V+E) BFS without array shifts or eager per-shard startup trees.
      const queue=[start];for(let head=0;head<queue.length;head++){
        const current=queue[head],currentKey=key(current);
        for(const n of graph.get(currentKey)){const k=key(n);if(distances.has(k))continue;distances.set(k,distances.get(currentKey)+1);prev.set(k,current);queue.push(n);}
      }
    }
  }
  const result={get(to){
    const goal=cell(to);if(!distances.has(key(goal)))return[];
    const path=[];for(let p=goal;p;p=prev.get(key(p))){path.push({...p});if(key(p)===startKey)break;}return path.reverse();
  }};
  if(!cost&&distances.size){builtTrees++;if(routeTrees.size>=MAX_ROUTE_TREES)routeTrees.delete(routeTrees.keys().next().value);routeTrees.set(startKey,result);}
  return result;
}
export function pathTo(from,to,cost){
  const a=cell(from),b=cell(to);return isOpen(a.x,a.z)&&isOpen(b.x,b.z)?routesFrom(a,cost).get(b):[];
}
export function coarseStats(){
  const adjacentPairs=nodes.reduce((count,p)=>count+[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1}].filter(n=>isOpen(n.x,n.z)).length,0);
  const unseen=new Set(graph.keys());let components=0;
  while(unseen.size){const start=unseen.values().next().value,queue=[start];unseen.delete(start);components++;
    for(let head=0;head<queue.length;head++)for(const n of graph.get(queue[head]))if(unseen.delete(key(n)))queue.push(key(n));
  }
  const degrees=[...graph.values()].map(n=>n.length),edges=degrees.reduce((sum,n)=>sum+n,0)/2,paths=routesFrom(START);
  return{nodes:nodes.length,adjacentPairs,edges,components,reachable:nodes.filter(n=>paths.get(n).length).length,degreeOne:degrees.filter(n=>n===1).length,isolated:degrees.filter(n=>n===0).length,cycleRank:edges-nodes.length+components};
}
export const NAV_EDGES=[...graph.values()].reduce((sum,n)=>sum+n.length,0)/2;
const fineOpen=(x,z)=>{const token=FINE_TOPOLOGY[z]?.[x];return token!==undefined&&!['#','|','-'].includes(token);};
export const FINE_WALKABLE_VERTICES=Object.freeze(FINE_TOPOLOGY.flatMap((row,z)=>[...row].flatMap((_,x)=>fineOpen(x,z)?[Object.freeze({x,z})]:[])));
export const FINE_TOPOLOGY_EDGES=FINE_WALKABLE_VERTICES.reduce((sum,p)=>sum+Number(fineOpen(p.x+1,p.z))+Number(fineOpen(p.x,p.z+1)),0);
export const FINE_STATS=Object.freeze({vertices:FINE_WALKABLE_VERTICES.length,edges:FINE_TOPOLOGY_EDGES,cycleRank:FINE_TOPOLOGY_EDGES-FINE_WALKABLE_VERTICES.length+1});
export const TOPOLOGY_VERSION=IS_MAP_DRAFT?'Night Hotel local map preview':'Night Hotel map experiment';
export function assertWorld(){
  const validation=validateMapDocument(MAP_DOCUMENT);
  if(!validation.valid)throw new Error(validation.errors.map(error=>error.message).join(' '));
  if(!MAP_WIDTH||!MAP_HEIGHT||MAP.some(row=>row.length!==MAP_WIDTH))throw new Error('Map dimensions are inconsistent');
  if(MAP[START.z][START.x]!=='S'||MAP[ENEMY_START.z][ENEMY_START.x]!=='E')throw new Error('Map markers do not match team topology');
  if([...MAP[0],...MAP.at(-1)].some(tile=>tile!=='#')||MAP.some(row=>row[0]!=='#'||row.at(-1)!=='#'))throw new Error('Map boundary is not closed');
  const paths=routesFrom(START),blocked=new Set(BLOCKED_TRANSITIONS.map(t=>transitionKey(t.a,t.b)));
  for(const p of [...nodes,EXIT,ENEMY_START])if(!paths.get(p).length)throw new Error(`Map target unreachable: ${key(p)}`);
  for(const p of nodes)for(const n of [{x:p.x+1,z:p.z},{x:p.x,z:p.z+1}])if(isOpen(n.x,n.z)&&blocked.has(transitionKey(p,n))===isTransitionOpen(p,n))throw new Error('Transition metadata and fine topology disagree');
  if(new Set(SHARDS.map(key)).size!==SHARDS.length||blocked.size!==BLOCKED_TRANSITIONS.length)throw new Error('Duplicate map target or blocker');
}
assertWorld();
