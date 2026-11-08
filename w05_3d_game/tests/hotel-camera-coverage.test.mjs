import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,MAP_CENTER,CELL_SIZE,MAP_DOCUMENT,ENTRY_GATE,isInSafeRoom} from '../src/world.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {POWER_SECTORS} from '../src/power-grid.js';
import {SecurityCoverage} from '../src/security-coverage.js';
const key=p=>`${Math.round(p.x)},${Math.round(p.z)}`;
test('default camera layout preserves the cinematic channel and covers the major facilities with ten cameras',()=>{
 assert.equal(L.cameras.length,10);assert.deepEqual(L.cameras[0].position,{x:11.15,z:7.2,y:2.45});assert.deepEqual(L.cameras[0].target,{x:16.4,z:10.5,y:1.3});assert.equal(L.cameras[0].fov,87);
 const coverage=new SecurityCoverage({tiles:MAP,center:MAP_CENTER,unit:CELL_SIZE,entryGate:ENTRY_GATE,rooms:L.rooms,barriers:MAP_DOCUMENT.barriers}),seen=new Set();
 for(const camera of L.cameras)for(const p of coverage.get(camera,{corridorWidth:2}).cells)seen.add(key(p));
 for(const p of [ENTRY_GATE.outside,...POWER_SECTORS,...L.rooms.map(r=>r.door.outside)])assert(seen.has(key(p)),`critical public point ${key(p)}`);
 let coveredPublic=0;for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[0].length;x++)if(MAP[z][x]!=='#'&&!isInSafeRoom({x,z})&&!L.rooms.some(r=>x>=r.bounds.minX&&x<=r.bounds.maxX&&z>=r.bounds.minZ&&z<=r.bounds.maxZ)&&seen.has(key({x,z})))coveredPublic++;
 assert(coveredPublic>=320,`coverage must retain the optimized public layout, got ${coveredPublic}`);
});
