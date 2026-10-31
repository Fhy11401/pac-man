import { DEFAULT_TUNING, MOVEMENT_KEYS } from './tuning.js';
import { V23_MAP, V23_FINE_TOPOLOGY, V23_BLOCKED_TRANSITIONS } from './night-hotel-v2-3-data.js';

// Night Hotel V2.3: all runtime coordinates are zero-based (x,z), accessed as MAP[z][x].
export const MAP = V23_MAP;
export const FINE_TOPOLOGY = V23_FINE_TOPOLOGY;
export const START = Object.freeze({ x: 15, z: 10 });
export const ENEMY_START = Object.freeze({ x: 28, z: 3 });
// V2.3 labels S as the player spawn / return position. The approved lobby door is
// placed at the requested reachable return cell; E remains enemy-only.
export const EXIT = Object.freeze({ x: 2, z: 25 });
export const CELL_SIZE = 2.4;
export const wallInset = (width = DEFAULT_TUNING.corridorWidth) => (CELL_SIZE - width) / (2 * CELL_SIZE);

const fineToken = (x, z) => FINE_TOPOLOGY[z]?.[x] ?? '#';
const midpoint = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
export const isOpen = (x, z) => MAP[z]?.[x] !== undefined && MAP[z][x] !== '#';
export const transitionToken = (a, b) => fineToken(midpoint(a, b).x, midpoint(a, b).z);
export const isTransitionOpen = (a, b) => isOpen(a.x, a.z) && isOpen(b.x, b.z) && !'|-#'.includes(transitionToken(a, b));
export const transitionKey = (a, b) => {
  const first = a.z < b.z || (a.z === b.z && a.x <= b.x) ? a : b;
  const second = first === a ? b : a;
  return `${first.x},${first.z}|${second.x},${second.z}`;
};

const narrowWalls = V23_BLOCKED_TRANSITIONS.narrow_walls.flatMap(group => group.transitions.map(t => ({ ...t, id: group.id, type: group.type })));
const solidWalls = V23_BLOCKED_TRANSITIONS.additional_solid_blocked_transitions;
export const BLOCKED_TRANSITIONS = Object.freeze([...narrowWalls, ...solidWalls]);
export const NARROW_WALLS = Object.freeze(narrowWalls);
export const SOLID_WALLS = Object.freeze(solidWalls);
export const isBlockedTransition = (a, b) => !isTransitionOpen(a, b);

export const neighbors = p => [{ x: p.x + 1, z: p.z }, { x: p.x, z: p.z + 1 }, { x: p.x - 1, z: p.z }, { x: p.x, z: p.z - 1 }]
  .filter(n => isTransitionOpen(p, n));

export const SHARDS = MAP.flatMap((row, z) => [...row].flatMap((tile, x) => tile === '*' ? [{ x, z }] : []));
export const RULES = Object.freeze({
  ...Object.fromEntries(MOVEMENT_KEYS.map(key => [key, DEFAULT_TUNING[key]])),
  enemyRadius: .18, collectRadius: .43, lives: 3,
  caughtSeconds: 1.1, respawnSeconds: 1.4, exitRadius: .08, enemyDelay: 3.2,
});
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const key = p => `${p.x},${p.z}`;
export const cell = p => ({ x: Math.round(p.x), z: Math.round(p.z) });

const routeTrees = new Map();
export function routesFrom(from, cost) {
  const start = cell(from), startKey = key(start);
  if (!cost && routeTrees.has(startKey)) return routeTrees.get(startKey);
  const queue = [start], distances = new Map([[startKey, 0]]), prev = new Map();
  while (queue.length) {
    let at = 0;
    if (cost) for (let i = 1; i < queue.length; i++) if (distances.get(key(queue[i])) < distances.get(key(queue[at]))) at = i;
    const current = queue.splice(at, 1)[0];
    for (const n of neighbors(current)) {
      const k = key(n), next = distances.get(key(current)) + (cost ? cost(n) : 1);
      if (next < (distances.get(k) ?? Infinity)) {
        distances.set(k, next); prev.set(k, current);
        if (!queue.some(q => key(q) === k)) queue.push(n);
      }
    }
  }
  const result = { get(to) {
    const goal = cell(to); if (!distances.has(key(goal))) return [];
    const path = [goal]; while (key(path[0]) !== startKey) path.unshift(prev.get(key(path[0]))); return path;
  }};
  if (!cost) routeTrees.set(startKey, result);
  return result;
}
export function pathTo(from, to, cost) {
  const a = cell(from), b = cell(to);
  if (!isOpen(a.x, a.z) || !isOpen(b.x, b.z)) return [];
  return routesFrom(a, cost).get(b);
}

export function coarseStats() {
  const nodes = MAP.flatMap((row, z) => [...row].map((tile, x) => tile === '#' ? null : { x, z }).filter(Boolean));
  const adjacent = nodes.flatMap(p => [{ x: p.x + 1, z: p.z }, { x: p.x, z: p.z + 1 }].filter(n => isOpen(n.x, n.z)));
  const edges = nodes.flatMap(p => neighbors(p).filter(n => p.x < n.x || p.z < n.z));
  const reachable = new Set(routesFrom(START).get ? nodes.filter(n => routesFrom(START).get(n).length).map(key) : []);
  const unseen = new Set(nodes.map(key)); let components = 0;
  while (unseen.size) { const start = unseen.values().next().value, queue = [start]; unseen.delete(start); components++;
    while (queue.length) { const current = queue.shift(), p = nodes.find(n => key(n) === current); for (const n of neighbors(p)) if (unseen.delete(key(n))) queue.push(key(n)); }
  }
  const degree = new Map(nodes.map(p => [key(p), neighbors(p).length]));
  return { nodes: nodes.length, adjacentPairs: adjacent.length, edges: edges.length, components, reachable: reachable.size, degreeOne: [...degree.values()].filter(v => v === 1).length, isolated: [...degree.values()].filter(v => v === 0).length, cycleRank: edges.length - nodes.length + components };
}

export function assertWorld() {
  if (MAP.length !== 27 || MAP.some(row => row.length !== 32)) throw new Error('V2.3 MAP must be 32x27');
  if (MAP[10][15] !== 'S' || MAP[3][28] !== 'E') throw new Error('V2.3 markers are misplaced');
  if (MAP.flatMap(row => [...row]).filter(c => c !== '#').length !== 325) throw new Error('V2.3 walkable count mismatch');
  if (SHARDS.length !== 225) throw new Error('V2.3 shard candidate count mismatch');
  for (const p of [...SHARDS, EXIT, ENEMY_START]) {
    if (!pathTo(START, p).length) throw new Error(`V2.3 map target unreachable: ${key(p)}`);
  }
  if (new Set(SHARDS.map(key)).size !== SHARDS.length) throw new Error('V2.3 shard candidates repeat');
}
assertWorld();
for (const p of [START, ENEMY_START, ...SHARDS]) routesFrom(p);
export const NAV_EDGES = coarseStats().edges;
export const FINE_WALKABLE_VERTICES = FINE_TOPOLOGY.flatMap((row, z) => [...row].map((token, x) => token !== '#' && token !== '|' && token !== '-' ? { x, z } : null).filter(Boolean));
export const FINE_TOPOLOGY_EDGES = FINE_WALKABLE_VERTICES.flatMap(p => [{ x: p.x + 1, z: p.z }, { x: p.x, z: p.z + 1 }].filter(n => FINE_TOPOLOGY[n.z]?.[n.x] && FINE_TOPOLOGY[n.z][n.x] !== '#' && FINE_TOPOLOGY[n.z][n.x] !== '|' && FINE_TOPOLOGY[n.z][n.x] !== '-')).length;
export const FINE_STATS = { vertices: FINE_WALKABLE_VERTICES.length, edges: FINE_TOPOLOGY_EDGES, cycleRank: FINE_TOPOLOGY_EDGES - FINE_WALKABLE_VERTICES.length + 1 };
// Collision rectangles match the normal wall body rendered at .38 cell thickness and
// the expanded wall span used by the surrounding wall cells.
const transitionHalfThickness = .38 / 2;
const transitionHalfSpan = .5 + wallInset();
export const transitionWallRect = (a, b) => a.x !== b.x ? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, halfX: transitionHalfThickness, halfZ: transitionHalfSpan } : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, halfX: transitionHalfSpan, halfZ: transitionHalfThickness };
export const allTransitionWalls = Object.freeze(BLOCKED_TRANSITIONS.map(t => ({ ...transitionWallRect(t.a, t.b), id: t.id, type: t.type, a: t.a, b: t.b })));
export const edgeIsOpen = isTransitionOpen;
export const TOPOLOGY_VERSION = 'Night Hotel V2.3';
