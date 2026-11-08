import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDefaultHotelDocument,normalizeHotelDocument,cloneHotelDocument,serializeHotelDocument,validateHotelDocument} from '../src/hotel-document.js';
import {HOTEL_DEFAULT_DOCUMENT} from '../src/hotel-default-data.js';

const fresh=createDefaultHotelDocument;
const invalid=(doc,code)=>assert.ok(validateHotelDocument(doc).errors.some(error=>error.code===code),`expected ${code}`);
test('canonical hotel export is reproducible, connected, larger, and preserves the control room and guest rooms',()=>{
  const doc=fresh(),result=validateHotelDocument(doc),bundled=JSON.parse(readFileSync(new URL('../HOTEL_DEFAULT.json',import.meta.url),'utf8'));
  assert.deepEqual(doc,normalizeHotelDocument(HOTEL_DEFAULT_DOCUMENT));assert.deepEqual(doc,bundled);assert.deepEqual(JSON.parse(serializeHotelDocument(doc)),doc);
  assert.equal(result.valid,true,JSON.stringify(result.errors));assert.equal(doc.map.width,56);assert.equal(doc.map.height,40);
  assert.equal(result.analysis.stats.cells,482);assert.equal(result.analysis.stats.components,1);assert.deepEqual(result.analysis.unreachable,[]);
  assert.deepEqual(result.analysis.shortTurns,[]);assert.equal(doc.facilities.halls.length,4);assert.equal(doc.facilities.cameras.length,10);
  assert.deepEqual(doc.map.barriers,[]);assert.deepEqual(doc.map.start,{x:16,z:16});assert.deepEqual(doc.map.entryGate,{x:16,z:13.5,inside:{x:16,z:14},outside:{x:16,z:13}});
  const clone=cloneHotelDocument(doc);clone.facilities.power.x=1;clone.map.tiles[0]='.'.repeat(doc.map.width);
  assert.equal(doc.facilities.power.x,48);assert.equal(doc.map.tiles[0],'#'.repeat(56));
});
test('normalization preserves editable invalid semantics but rejects unsafe shapes and unsupported fields',()=>{
  const doc=fresh();doc.facilities.power.x=0;doc.facilities.rooms=[];
  assert.equal(normalizeHotelDocument(doc).facilities.rooms.length,0);invalid(doc,'facility-terrain');invalid(doc,'room-count');
  for(const mutate of [d=>d.map.width=81,d=>d.map.tiles[1]='?',d=>d.facilities.power.prompt='private',d=>d.facilities.cameras[0].fov=NaN,d=>d.facilities.halls[0].type='unknown']){
    const bad=fresh();mutate(bad);assert.throws(()=>normalizeHotelDocument(bad));
  }
  const missingType=fresh();delete missingType.facilities.halls[0].type;assert.equal(normalizeHotelDocument(missingType).facilities.halls[0].type,'lounge');
});
test('facilities, wall directions, private rooms and unique identifiers have explicit semantic validation',()=>{
  const cases=[
    ['fixture-wall',d=>d.facilities.power.wall={x:1,z:0}],
    ['facility-id',d=>d.facilities.batteries[0].id='power'],
    ['room-phone',d=>d.facilities.phones[0].room='202'],
    ['room-door',d=>d.facilities.rooms[0].door.axis='z'],
    ['camera-private-room',d=>d.facilities.cameras[0].position={x:20,z:7,y:2.4}],
    ['camera-wall',d=>d.facilities.cameras[0].position={x:49.48,z:5,y:2.4}],
    ['facility-terrain',d=>d.facilities.cameras[0].position={x:1e100,z:1e100,y:2.4}],
    ['camera-pose',d=>d.facilities.cameras[0].fov=150],
    ['region-overlap',d=>d.facilities.halls[0].bounds={...d.facilities.rooms[0].bounds,maxX:22,maxZ:9}],
    ['control-structure',d=>d.map.safeRoom.maxX=Number.MAX_SAFE_INTEGER],
  ];
  for(const [code,mutate] of cases){const doc=fresh();mutate(doc);invalid(doc,code);}
});
test('terrain edits validate connectivity, a single room entrance, and complete hall footprints',()=>{
  const set=(doc,x,z,tile)=>{const row=[...doc.map.tiles[z]];row[x]=tile;doc.map.tiles[z]=row.join('');};
  const disconnected=fresh();set(disconnected,52,35,'.');invalid(disconnected,'unreachable');
  const extraDoor=fresh();set(extraDoor,19,7,'.');invalid(extraDoor,'room-entry');
  const blockedHall=fresh();set(blockedHall,14,9,'#');invalid(blockedHall,'region-terrain');
  const blockedGate=fresh();set(blockedGate,16,14,'#');invalid(blockedGate,'control-exits');
});
test('variable terrain sizes and useful camera blind spots are accepted',()=>{
  const doc=fresh();doc.map.width=64;doc.map.height=48;doc.map.tiles=doc.map.tiles.map(row=>row+'#'.repeat(8));
  while(doc.map.tiles.length<48)doc.map.tiles.push('#'.repeat(64));
  doc.facilities.cameras=doc.facilities.cameras.slice(0,1);
  assert.equal(validateHotelDocument(doc).valid,true);assert.equal(normalizeHotelDocument(doc).facilities.cameras.length,1);
});
