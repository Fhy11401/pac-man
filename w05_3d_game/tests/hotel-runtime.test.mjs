import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createDefaultHotelDocument,validateHotelDocument} from '../src/hotel-document.js';
import {createDefaultMapDocument} from '../src/map-document.js';
import {createGame,blackoutSight} from '../src/core.js';
import {blackoutPath} from '../src/blackout-state.js';
import {roomFurnitureWalls} from '../src/entry-state.js';
import {slideMove} from '../src/movement.js';
import {MAP,START,RULES,isOpen,distance,key} from '../src/world.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';

function runtime(document,kind='hotel'){
  const source=`
    const document=JSON.parse(process.env.HOTEL_TEST_DOCUMENT),kind=${JSON.stringify(kind)};
    const id='runtime-fixture',key=kind==='hotel'?'night-hotel.hotel-previews.v1':'night-hotel.map-previews.v1';
    globalThis.window={location:{search:kind==='hotel'?'?hotelDraft='+id:'?mapDraft='+id},localStorage:{getItem(name){return name===key?JSON.stringify([{id,createdAt:Date.now(),document}]):null;}}};
    const world=await import(${JSON.stringify(new URL('../src/world.js',import.meta.url).href)});
    const {BLACKOUT_LAYOUT:L}=await import(${JSON.stringify(new URL('../src/blackout-layout.js',import.meta.url).href)});
    const {createGame,getBlackoutInteraction}=await import(${JSON.stringify(new URL('../src/core.js',import.meta.url).href)});
    const {securityRoomFurniture}=await import(${JSON.stringify(new URL('../src/security-room-layout.js',import.meta.url).href)});
    const {SecurityCameras}=await import(${JSON.stringify(new URL('../src/security-cameras.js',import.meta.url).href)});
    const game=createGame({},kind==='hotel'?{mode:'blackout'}:{});
    let interaction=null,cameraTarget=null,furniture=null;
    if(game.blackout){game.player={x:L.power.x,z:L.power.z};interaction=getBlackoutInteraction(game,Math.atan2(-L.power.wall.x,-L.power.wall.z));furniture=securityRoomFurniture().map(({room,phone,bed,desk})=>({id:room.id,phone,bed,desk}));const cameras=new SecurityCameras({renderer:{},film:{},home:null});cameraTarget=cameras.channels[0].target;cameras.dispose();}
    console.log(JSON.stringify({width:world.MAP_WIDTH,height:world.MAP_HEIGHT,legacy:world.IS_MAP_DRAFT,hotel:world.IS_HOTEL_DRAFT,error:world.MAP_DRAFT_ERROR,blackout:Boolean(game.blackout),power:L.power,phones:L.phones,rooms:L.rooms,cameraTarget,furniture,interaction,roomDoors:game.blackout?Object.keys(game.blackout.roomDoors):[]}));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',env:{...process.env,HOTEL_TEST_DOCUMENT:JSON.stringify(document)}});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());
}

test('an explicit hotel snapshot changes actual terrain, interaction positions, doors, furniture and cameras together',()=>{
  const doc=createDefaultHotelDocument(),f=doc.facilities;doc.map.width=60;doc.map.tiles=doc.map.tiles.map(row=>row+'####');
  const grid=doc.map.tiles.map(row=>[...row]);grid[7][20]='#';grid[7][21]='#';
  for(let z=7;z<=8;z++)for(let x=22;x<=23;x++)grid[z][x]='.';
  doc.map.tiles=grid.map(row=>row.join(''));
  const room=f.rooms[0];room.bounds={minX:22,maxX:23,minZ:7,maxZ:8};room.door={x:21.5,z:8,axis:'x',inside:{x:22,z:8},outside:{x:21,z:8}};
  f.phones[0].x=22;f.batteries[0].x=22;f.power.x=47;f.console.z=15;f.cameras[0].target={x:15,z:10,y:1.2};
  assert.equal(validateHotelDocument(doc).valid,true,JSON.stringify(validateHotelDocument(doc).errors));
  const result=runtime(doc);assert.equal(result.error,null);assert.equal(result.width,60);assert.equal(result.height,40);assert.equal(result.hotel,true);assert.equal(result.legacy,false);assert.equal(result.blackout,true);
  assert.deepEqual(result.power,f.power);assert.deepEqual(result.rooms,f.rooms);assert.deepEqual(result.phones,f.phones);assert.deepEqual(result.cameraTarget,f.cameras[0].target);
  assert.equal(result.interaction.kind,'power');assert.equal(result.interaction.point.x,47);assert.ok(result.interaction.point.z>9.5&&result.interaction.point.z<10);assert.deepEqual(result.roomDoors,f.rooms.map(room=>room.id));
  assert.equal(result.furniture[0].bed.x,22.5);assert.equal(result.furniture[0].desk.x,22);assert.equal(result.furniture[0].phone.x,22);
});

test('the separate legacy map preview remains a collection game on its own complete snapshot',()=>{
  const doc=createDefaultMapDocument();doc.name='Legacy fixture';
  const result=runtime(doc,'legacy');assert.equal(result.error,null);assert.equal(result.width,32);assert.equal(result.height,27);assert.equal(result.legacy,true);assert.equal(result.hotel,false);assert.equal(result.blackout,false);
});

test('physical hall furniture preserves navigation to every cell and each objective without crossing an obstacle',()=>{
  const game=createGame({}, {mode:'blackout'}),walls=roomFurnitureWalls(game.tuning.corridorWidth);
  assert.ok(walls.some(wall=>L.halls.some(hall=>wall.id.startsWith(hall.id+'-'))));
  const checkedEdges=new Set();
  for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[z].length;x++)if(isOpen(x,z)){
    const route=blackoutPath(game,START,{x,z});assert.ok(route.length,`furniture trapped ${x},${z}`);
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],token=[key(a),key(b)].sort().join('|');if(checkedEdges.has(token))continue;checkedEdges.add(token);
      const moved=slideMove(a,{x:b.x-a.x,z:b.z-a.z},RULES.enemyRadius,game.tuning.corridorWidth,walls);
      assert.ok(distance(moved.position,b)<1e-5,`route crosses furniture: ${token}`);
    }
  }
  for(const point of [L.power,...L.patrol,...L.phones])assert.ok(blackoutPath(game,START,point).length);
  assert.ok(checkedEdges.size>400);
});

test('tall hall columns occlude perception while low furnishing remains below the eye line',()=>{
  const game=createGame({}, {mode:'blackout'}),walls=roomFurnitureWalls(game.tuning.corridorWidth),column=walls.find(wall=>wall.blocksSight);
  assert.ok(column,'a high column has an explicit visibility footprint');
  const a={x:column.x-column.halfX-.1,z:column.z},b={x:column.x+column.halfX+.1,z:column.z};
  assert.equal(blackoutSight(game,a,b),false);
});
