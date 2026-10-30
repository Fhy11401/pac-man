import {DEFAULT_TUNING,MOVEMENT_KEYS} from './tuning.js';
// Positions use cell units. Rendering alone converts them into metres.
export const MAP = [
  '###############',
  '#P....#.......#',
  '#.##..#.###.#.#',
  '#.....#...#.#.#',
  '#.###.###.#.#.#',
  '#...#.....#...#',
  '###.#.###.###.#',
  '#...#...#.....#',
  '#.#####.#.###.#',
  '#.......#...#.#',
  '#.###.#####.#.#',
  '#...#.......#.#',
  '#.#.###.###.#.#',
  '#E..........G.#',
  '###############',
];
export const START = { x: 1, z: 1 };
export const ENEMY_START = { x: 12, z: 13 };
// The trigger is at the entrance door, separate from the respawn position.
export const EXIT = { x: .86, z: 1 };
export const CELL_SIZE=2.4;
export const wallInset=(width=DEFAULT_TUNING.corridorWidth)=>(CELL_SIZE-width)/(2*CELL_SIZE);
// Continuous pickup trails turn navigating the maze into the collection loop.
export const SHARDS = MAP.flatMap((row, z) => [...row].flatMap((tile, x) =>
  tile !== '#' && !(x === START.x && z === START.z) ? [{ x, z }] : []));
export const RULES = Object.freeze({
  ...Object.fromEntries(MOVEMENT_KEYS.map(key=>[key,DEFAULT_TUNING[key]])),
  enemyRadius: .18, collectRadius: .43, lives: 3,
  caughtSeconds: 1.1, respawnSeconds: 1.4, exitRadius: .08, enemyDelay: 3.2,
});
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const key = p => `${p.x},${p.z}`;
export const cell = p => ({ x: Math.round(p.x), z: Math.round(p.z) });
export const isOpen = (x, z) => MAP[z]?.[x] !== undefined && MAP[z][x] !== '#';
export function neighbors(p) {
  return [{ x: p.x + 1, z: p.z }, { x: p.x, z: p.z + 1 },
    { x: p.x - 1, z: p.z }, { x: p.x, z: p.z - 1 }].filter(n => isOpen(n.x, n.z));
}

// The topology never changes: cache plain BFS trees before gameplay.
const routeTrees = new Map();
export function routesFrom(from, cost) {
  const start=cell(from), startKey=key(start);
  if(!cost&&routeTrees.has(startKey))return routeTrees.get(startKey);
  const queue=[start],distances=new Map([[startKey,0]]),prev=new Map();
  while(queue.length){
    let at=0;if(cost)for(let i=1;i<queue.length;i++)if(distances.get(key(queue[i]))<distances.get(key(queue[at])))at=i;
    const current=queue.splice(at,1)[0];
    for(const n of neighbors(current)){
      const k=key(n),next=distances.get(key(current))+(cost?cost(n):1);
      if(next<(distances.get(k)??Infinity)){
        distances.set(k,next);prev.set(k,current);
        if(!queue.some(q=>key(q)===k))queue.push(n);
      }
    }
  }
  const result={get(to){
    const goal=cell(to);if(!distances.has(key(goal)))return [];
    const path=[goal];while(key(path[0])!==startKey)path.unshift(prev.get(key(path[0])));return path;
  }};
  if(!cost)routeTrees.set(startKey,result);return result;
}
export function pathTo(from,to,cost){
  if(!isOpen(cell(from).x,cell(from).z)||!isOpen(cell(to).x,cell(to).z))return [];
  return routesFrom(from,cost).get(to);
}
for(const p of [START,...SHARDS])routesFrom(p);

export function assertWorld() {
  if (MAP.some(row => row.length !== MAP[0].length)) throw new Error('地图行长不一致');
  if (MAP[0].includes('.') || MAP.at(-1).includes('.') || MAP.some(row => row[0] !== '#' || row.at(-1) !== '#')) throw new Error('地图边界不封闭');
  for (const p of [...SHARDS, EXIT, ENEMY_START]) {
    if (!pathTo(START, p).length) throw new Error(`地图目标不可达：${key(p)}`);
  }
  if (new Set(SHARDS.map(key)).size !== SHARDS.length) throw new Error('收集物重复');
}
assertWorld();
