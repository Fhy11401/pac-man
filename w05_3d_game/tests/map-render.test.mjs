import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {MAP,MAP_WIDTH,MAP_HEIGHT,MAP_CENTER,CELL_SIZE,wallInset,transitionWallRect,transitionWalls,isOpen} from '../src/world.js';
import {createWallShell} from '../src/wall-shell.js';
import {mapTransform,mapPoint} from '../src/map-view.js';
const legacy=JSON.parse(readFileSync(new URL('../assets/maps/maplab-before-editor.json',import.meta.url),'utf8'));
const legacyWalls=width=>legacy.barriers.map(({a,b})=>transitionWallRect(a,b,width));

test('local-map corridors keep their physical screen size when the floor grows',()=>{
 const t=mapTransform(480,{x:15,z:10},0,true,2.1),a=mapPoint({x:15,z:10},t),b=mapPoint({x:16,z:10},t);
 assert.equal(a.x,240);assert.equal(a.y,240);assert.ok(Math.abs(b.x-a.x-(480-24)/15*2.1)<1e-8);
});
test('full rectangular map stays inside the display at every heading',()=>{
 for(let yaw=0;yaw<2*Math.PI;yaw+=.13){const t=mapTransform(480,{x:15,z:10},yaw,false);
  for(const x of [-.5,MAP_WIDTH-.5])for(const z of [-.5,MAP_HEIGHT-.5]){const p=mapPoint({x,z},t);assert.ok(p.x>7&&p.x<473&&p.y>7&&p.y<473);}
 }
});
test('imported transition walls share physics bounds even when the default has no partitions',()=>{
 assert.equal(legacy.barriers.length,8);
 for(const width of [1.3,1.5,1.9,2.4])for(const p of legacyWalls(width)){
  const g=createWallShell([],CELL_SIZE,wallInset(width),2.7,1.35,0,MAP_CENTER,[p]);
  for(const [axis,half] of [['x',p.halfX],['z',p.halfZ]]){
   assert.ok(Math.abs(g.boundingBox.min[axis]-(p[axis]-MAP_CENTER[axis]-half)*CELL_SIZE)<1e-5);
   assert.ok(Math.abs(g.boundingBox.max[axis]-(p[axis]-MAP_CENTER[axis]+half)*CELL_SIZE)<1e-5);
  }g.dispose();
 }
});

test('the imported legacy shell occludes all eight actual partitions without covering its open cell centres',()=>{
 const width=1.5,walls=legacy.tiles.flatMap((r,z)=>[...r].flatMap((c,x)=>c==='#'?[{x,z}]:[])),partitions=legacyWalls(width);
 const g=createWallShell(walls,CELL_SIZE,wallInset(width),2.7,1.35,0,MAP_CENTER,partitions);
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster();mesh.updateMatrixWorld(true);
 for(let z=0;z<legacy.height;z++)for(let x=0;x<legacy.width;x++)if(legacy.tiles[z][x]!=='#'){
  ray.set(new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,3,(z-MAP_CENTER.z)*CELL_SIZE),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0);
 }
 for(const p of partitions){
  ray.set(new THREE.Vector3((p.x-MAP_CENTER.x)*CELL_SIZE,3,(p.z-MAP_CENTER.z)*CELL_SIZE),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(mesh).length>0);
 }
 g.dispose();mesh.material.dispose();
});
test('combined shell occludes every divider while all walkable centres remain clear',()=>{
 const width=1.5,walls=MAP.flatMap((r,z)=>[...r].flatMap((c,x)=>c==='#'?[{x,z}]:[]));
 const g=createWallShell(walls,CELL_SIZE,wallInset(width),2.7,1.35,0,MAP_CENTER,transitionWalls(width));
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),ray=new THREE.Raycaster();mesh.updateMatrixWorld(true);
 for(let z=0;z<MAP_HEIGHT;z++)for(let x=0;x<MAP_WIDTH;x++)if(isOpen(x,z)){
  ray.set(new THREE.Vector3((x-MAP_CENTER.x)*CELL_SIZE,3,(z-MAP_CENTER.z)*CELL_SIZE),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0,`clear cell ${x},${z}`);
 }
 for(const p of transitionWalls(width)){
  ray.set(new THREE.Vector3((p.x-MAP_CENTER.x)*CELL_SIZE,3,(p.z-MAP_CENTER.z)*CELL_SIZE),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(mesh).length>0);
 }g.dispose();mesh.material.dispose();
});
