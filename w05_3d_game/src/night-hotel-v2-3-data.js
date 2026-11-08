import {DEFAULT_MAP_DOCUMENT} from './default-map-data.js';

// Compatibility views of the canonical document; markers never replace its tiles.
const point=p=>({x:p.x,z:p.z});
const edgeKey=(a,b)=>[`${a.x},${a.z}`,`${b.x},${b.z}`].sort().join('|');
const tiles=DEFAULT_MAP_DOCUMENT.tiles;
const map=tiles.map(row=>[...row]);
map[DEFAULT_MAP_DOCUMENT.start.z][DEFAULT_MAP_DOCUMENT.start.x]='S';
map[DEFAULT_MAP_DOCUMENT.enemy.z][DEFAULT_MAP_DOCUMENT.enemy.x]='E';
export const V23_MAP=Object.freeze(map.map(row=>row.join('')));

const open=p=>tiles[p.z]?.[p.x]!==undefined&&tiles[p.z][p.x]!=='#';
const barriers=DEFAULT_MAP_DOCUMENT.barriers;
const blocked=new Set(barriers.map(({a,b})=>edgeKey(a,b)));
const pairs=tiles.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x:x+1,z},{x,z:z+1}].filter(open).map(b=>({a:{x,z},b}))));
const permitted=pairs.find(({a,b})=>!blocked.has(edgeKey(a,b)));
const groups=barriers.map(({a,b},index)=>Object.freeze({
  id:`NW-${String(index+1).padStart(2,'0')}`,type:'narrow_wall',orientation:a.x!==b.x?'vertical':'horizontal',
  transitions:Object.freeze([Object.freeze({a:Object.freeze(point(a)),b:Object.freeze(point(b))})]),
}));
export const V23_BLOCKED_TRANSITIONS=Object.freeze({
  coordinate_convention:'Coarse cells are zero-based (x,z); fine cells are (2*x,2*z) and edge midpoints are (a.x+b.x,a.z+b.z).',
  narrow_walls:Object.freeze(groups),additional_solid_blocked_transitions:Object.freeze([]),
  explicitly_open_transition:permitted?Object.freeze({id:'OPEN-01',a:Object.freeze(point(permitted.a)),b:Object.freeze(point(permitted.b)),fine_midpoint:Object.freeze({x:permitted.a.x+permitted.b.x,z:permitted.a.z+permitted.b.z}),fine_midpoint_token:'.',status:'open'}):null,
  counts:Object.freeze({open_transitions:pairs.length-blocked.size,blocked_transitions:blocked.size,adjacent_walkable_cell_pairs:pairs.length}),
});

function fineTopology(){
  const fine=Array.from({length:DEFAULT_MAP_DOCUMENT.height*2-1},()=>Array(DEFAULT_MAP_DOCUMENT.width*2-1).fill('#'));
  for(let z=0;z<V23_MAP.length;z++)for(let x=0;x<V23_MAP[z].length;x++)if(V23_MAP[z][x]!=='#')fine[z*2][x*2]=V23_MAP[z][x];
  for(const {a,b} of pairs)fine[a.z+b.z][a.x+b.x]=blocked.has(edgeKey(a,b))?(a.x!==b.x?'|':'-'):'.';
  return Object.freeze(fine.map(row=>row.join('')));
}
export const V23_FINE_TOPOLOGY=fineTopology();