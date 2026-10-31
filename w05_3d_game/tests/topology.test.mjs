import test from 'node:test';
import assert from 'node:assert/strict';
import { V23_MAP, V23_FINE_TOPOLOGY, V23_BLOCKED_TRANSITIONS } from '../src/night-hotel-v2-3-data.js';
import { edgeIsOpen, pathTo, START, ENEMY_START, EXIT, SHARDS, coarseStats, FINE_STATS, NARROW_WALLS, SOLID_WALLS, RULES } from '../src/world.js';
import { createGame, tick } from '../src/core.js';
import { slideMove } from '../src/movement.js';

// These are implementation acceptance criteria kept with the formal test; runtime data
// comes directly from the shipped V2.3 module.
const EXPECTED = Object.freeze({
  coarseWidth: 32, coarseHeight: 27, walkable: 325, shards: 225, adjacentPairs: 360, blocked: 8, openEdges: 352,
  coarseComponents: 1, degreeOne: 0, isolated: 0, bridges: 0, cycleRank: 28, startDegree: 2, enemyDegree: 3,
  fineWidth: 63, fineHeight: 53, fineVertices: 677, fineEdges: 704, fineComponents: 1,
  fineDegreeOne: 0, fineIsolated: 0, fineBridges: 0, fineCycleRank: 28,
  start: { x: 15, z: 10 }, enemy: { x: 28, z: 3 }, exit: { x: 2, z: 25 },
});
const pointKey = ({ x, z }) => `${x},${z}`;
const edgeKey = (a, b) => [pointKey(a), pointKey(b)].sort().join('|');
const openFine = token => token !== '#' && token !== '|' && token !== '-';
const coarseAt = ({ x, z }) => V23_MAP[z]?.[x];
const fineAt = ({ x, z }) => V23_FINE_TOPOLOGY[z]?.[x];
const midpoint = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
const adjacentPairs = [];
for (let z = 0; z < V23_MAP.length; z++) for (let x = 0; x < V23_MAP[0].length; x++) {
  if (coarseAt({ x, z }) === '#') continue;
  for (const [dx, dz] of [[1, 0], [0, 1]]) { const b = { x: x + dx, z: z + dz }; if (coarseAt(b) !== '#') adjacentPairs.push([{ x, z }, b]); }
}
const blockedEdges = new Set([
  ...V23_BLOCKED_TRANSITIONS.narrow_walls.flatMap(group => group.transitions.map(({ a, b }) => edgeKey(a, b))),
  ...V23_BLOCKED_TRANSITIONS.additional_solid_blocked_transitions.map(({ a, b }) => edgeKey(a, b)),
]);
const coarseEdges = adjacentPairs.filter(([a, b]) => !blockedEdges.has(edgeKey(a, b)));
function graphMetrics(vertices, edges) {
  const graph = new Map(vertices.map(vertex => [pointKey(vertex), new Set()]));
  for (const [a, b] of edges) { graph.get(pointKey(a))?.add(pointKey(b)); graph.get(pointKey(b))?.add(pointKey(a)); }
  const components = [], unseen = new Set(graph.keys());
  while (unseen.size) { const start = unseen.values().next().value, queue = [start], component = []; unseen.delete(start); while (queue.length) { const current = queue.shift(); component.push(current); for (const next of graph.get(current)) if (unseen.delete(next)) queue.push(next); } components.push(component); }
  const degrees = [...graph].map(([key, neighbors]) => ({ key, degree: neighbors.size })); let bridges = 0;
  for (const [a, b] of edges) { const ak = pointKey(a), bk = pointKey(b), seen = new Set([ak]), queue = [ak]; while (queue.length) { const current = queue.shift(); for (const next of graph.get(current)) { if ((current === ak && next === bk) || (current === bk && next === ak) || seen.has(next)) continue; seen.add(next); queue.push(next); } } if (!seen.has(bk)) bridges++; }
  return { nodes: graph.size, edges: edges.length, components: components.length, degreeOne: degrees.filter(item => item.degree === 1), isolated: degrees.filter(item => item.degree === 0), bridges, cycleRank: edges.length - graph.size + components.length, graph };
}
const coarseVertices = [];
for (let z = 0; z < V23_MAP.length; z++) for (let x = 0; x < V23_MAP[0].length; x++) if (coarseAt({ x, z }) !== '#') coarseVertices.push({ x, z });
const coarseGraph = graphMetrics(coarseVertices, coarseEdges);
const fineVertices = [];
for (let z = 0; z < V23_FINE_TOPOLOGY.length; z++) for (let x = 0; x < V23_FINE_TOPOLOGY[0].length; x++) if (openFine(fineAt({ x, z }))) fineVertices.push({ x, z });
const fineEdges = [];
for (const a of fineVertices) for (const [dx, dz] of [[1, 0], [0, 1]]) { const b = { x: a.x + dx, z: a.z + dz }; if (openFine(fineAt(b))) fineEdges.push([a, b]); }
const ADDITIONS = Object.freeze([
  ['BLUE-01', [[7, 2], [8, 2], [8, 3]], [[[3, 1], [4, 1]], [[4, 1], [4, 2]]]],
  ['BLUE-02', [[30, 21], [30, 22], [30, 23], [30, 24], [30, 25], [29, 26], [28, 26], [28, 27]], [[[15, 10], [15, 11]], [[15, 11], [15, 12]], [[15, 12], [15, 13]], [[14, 13], [15, 13]], [[14, 13], [14, 14]]]],
  ['BLUE-03', [[43, 18], [44, 18], [44, 19]], [[[21, 9], [22, 9]], [[22, 9], [22, 10]]]],
  ['BLUE-04', [[2, 45], [2, 44], [3, 44]], [[[1, 22], [1, 23]], [[1, 22], [2, 22]]]],
  ['SUPPLEMENT-01', [[32, 17], [32, 18], [31, 18]], [[[16, 8], [16, 9]], [[15, 9], [16, 9]]]],
]);

test('V2.3 coarse map dimensions, occupancy, shards, and markers are canonical', () => {
  assert.equal(V23_MAP.length, EXPECTED.coarseHeight); assert.ok(V23_MAP.every(row => row.length === EXPECTED.coarseWidth)); assert.equal(coarseVertices.length, EXPECTED.walkable);
  assert.equal(V23_MAP.flatMap(row => [...row]).filter(token => token === '*').length, EXPECTED.shards);
  assert.deepEqual(V23_MAP.flatMap((row, z) => [...row].flatMap((token, x) => token === 'S' ? [{ x, z }] : [])), [EXPECTED.start]);
  assert.deepEqual(V23_MAP.flatMap((row, z) => [...row].flatMap((token, x) => token === 'E' ? [{ x, z }] : [])), [EXPECTED.enemy]);
  assert.equal(coarseAt(EXPECTED.enemy), 'E');
});

test('all accepted blockers are present and NW-05 remains explicitly open', () => {
  assert.equal(adjacentPairs.length, EXPECTED.adjacentPairs); assert.equal(blockedEdges.size, EXPECTED.blocked); assert.equal(coarseEdges.length, EXPECTED.openEdges);
  for (const group of V23_BLOCKED_TRANSITIONS.narrow_walls) for (const transition of group.transitions) assert.equal(fineAt(midpoint(transition.a, transition.b)), group.orientation === 'horizontal' ? '-' : '|', group.id);
  for (const transition of V23_BLOCKED_TRANSITIONS.additional_solid_blocked_transitions) assert.equal(fineAt(transition.fine_midpoint), '#', transition.id);
  const open = V23_BLOCKED_TRANSITIONS.explicitly_open_transition; assert.equal(fineAt(open.fine_midpoint), open.fine_midpoint_token); assert.equal(blockedEdges.has(edgeKey(open.a, open.b)), false);
});

test('coarse graph has the canonical connectivity and cycle metrics', () => {
  assert.equal(coarseGraph.nodes, EXPECTED.walkable); assert.equal(coarseGraph.edges, EXPECTED.openEdges); assert.equal(coarseGraph.components, EXPECTED.coarseComponents); assert.equal(coarseGraph.degreeOne.length, EXPECTED.degreeOne); assert.equal(coarseGraph.isolated.length, EXPECTED.isolated); assert.equal(coarseGraph.bridges, EXPECTED.bridges); assert.equal(coarseGraph.cycleRank, EXPECTED.cycleRank);
  assert.equal(coarseGraph.graph.get(pointKey(EXPECTED.start)).size, EXPECTED.startDegree); assert.equal(coarseGraph.graph.get(pointKey(EXPECTED.enemy)).size, EXPECTED.enemyDegree);
});

test('BLUE additions and SUPPLEMENT-01 are present without reopening NW-03', () => {
  for (const [, fineCells, transitions] of ADDITIONS) { for (const [x, z] of fineCells) assert.equal(fineAt({ x, z }), '.'); for (const [a, b] of transitions) assert.equal(fineAt(midpoint({ x: a[0], z: a[1] }, { x: b[0], z: b[1] })), '.'); }
  assert.equal(coarseAt({ x: 16, z: 9 }), '.'); assert.equal(blockedEdges.has(edgeKey({ x: 15, z: 8 }, { x: 16, z: 8 })), true);
  assert.equal(blockedEdges.has(edgeKey({ x: 16, z: 8 }, { x: 16, z: 9 })), false); assert.equal(blockedEdges.has(edgeKey({ x: 15, z: 9 }, { x: 16, z: 9 })), false);
});

test('fine edge topology has canonical dimensions and graph metrics', () => {
  const fineGraph = graphMetrics(fineVertices, fineEdges);
  assert.equal(V23_FINE_TOPOLOGY.length, EXPECTED.fineHeight); assert.ok(V23_FINE_TOPOLOGY.every(row => row.length === EXPECTED.fineWidth)); assert.equal(fineGraph.nodes, EXPECTED.fineVertices); assert.equal(fineGraph.edges, EXPECTED.fineEdges); assert.equal(fineGraph.components, EXPECTED.fineComponents); assert.equal(fineGraph.degreeOne.length, EXPECTED.fineDegreeOne); assert.equal(fineGraph.isolated.length, EXPECTED.fineIsolated); assert.equal(fineGraph.bridges, EXPECTED.fineBridges); assert.equal(fineGraph.cycleRank, EXPECTED.fineCycleRank); assert.equal(fineAt({ x: 30, z: 20 }), 'S'); assert.equal(fineAt({ x: 56, z: 6 }), 'E');
});

test('runtime navigation and collision share all V2.3 edge blockers', () => {
  assert.equal(NARROW_WALLS.length, 7); assert.equal(SOLID_WALLS.length, 1); assert.equal(coarseStats().reachable, EXPECTED.walkable); assert.equal(FINE_STATS.vertices, EXPECTED.fineVertices); assert.equal(FINE_STATS.edges, EXPECTED.fineEdges);
  for (const group of V23_BLOCKED_TRANSITIONS.narrow_walls) for (const transition of group.transitions) assert.equal(edgeIsOpen(transition.a, transition.b), false);
  assert.equal(edgeIsOpen({ x: 5, z: 13 }, { x: 5, z: 14 }), true); assert.equal(edgeIsOpen({ x: 13, z: 13 }, { x: 14, z: 13 }), false);
  assert.ok(pathTo(START, ENEMY_START).length > 0); assert.ok(pathTo({ x: 16, z: 8 }, { x: 15, z: 9 }).length > 0); assert.deepEqual(EXIT, EXPECTED.exit); assert.ok(pathTo(START, EXIT).length > 0);
  const runtimeBlockedEdges = new Set(adjacentPairs.filter(([a, b]) => !edgeIsOpen(a, b)).map(([a, b]) => edgeKey(a, b)));
  assert.deepEqual(runtimeBlockedEdges, blockedEdges); assert.equal(coarseStats().edges, EXPECTED.openEdges);
  const returnGame = createGame(); returnGame.player = { ...EXIT }; returnGame.collected = new Set(SHARDS.map((_, index) => index)); returnGame.enemy = { x: 28, z: 3 }; returnGame.enemyDelay = 10; tick(returnGame, { x: 0, z: 0, run: false, heading: 0 }, 1 / 60); assert.equal(returnGame.phase, 'won');
  const blocked = slideMove({ x: 15, z: 1 }, { x: 1.2, z: 0 }, RULES.playerRadius, RULES.corridorWidth).position; const open = slideMove({ x: 5, z: 13 }, { x: 0, z: 1.2 }, RULES.playerRadius, RULES.corridorWidth).position; assert.ok(blocked.x < 15.5); assert.ok(open.z > 14);
});
