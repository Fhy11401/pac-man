import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGame,blackoutSight} from '../src/core.js';
import {MAP,MAP_CENTER,CELL_SIZE} from '../src/world.js';
import {BLACKOUT_LAYOUT as L} from '../src/blackout-layout.js';
import {roomDoorWall} from '../src/entry-state.js';
import {hasMazeSight} from '../src/visibility.js';
import {SecurityCameras,SECURITY_CHANNELS} from '../src/security-cameras.js';
import {BlackoutUI} from '../src/blackout-ui.js';

const world=(point,y=1.3)=>new THREE.Vector3((point.x-MAP_CENTER.x)*CELL_SIZE,y,(point.z-MAP_CENTER.z)*CELL_SIZE);
const projects=(camera,point)=>{
  const ndc=point.clone().project(camera);
  return point.distanceTo(camera.position)<=40&&['x','y','z'].every(axis=>Math.abs(ndc[axis])<=1);
};

test('public cameras observe all hall centres while preserving closed-room and corridor blind spots',()=>{
  const game=createGame({}, {mode:'blackout'}),controller=new SecurityCameras({renderer:{},film:{},home:null}),missing=[];
  let cells=0;
  for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[z].length;x++)if(MAP[z][x]!=='#'){
    cells++;const point={x,z},position=world(point);
    const visible=controller.cameras.some((camera,index)=>projects(camera,position)&&blackoutSight(game,SECURITY_CHANNELS[index].position,point));
    if(!visible)missing.push(point);
  }
  assert.equal(cells,482);assert.equal(controller.cameras.length,SECURITY_CHANNELS.length);assert.ok(missing.length>0);
  for(const {bounds:b} of L.halls){
    const point={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
    assert.ok(controller.cameras.some((camera,index)=>projects(camera,world(point))&&blackoutSight(game,SECURITY_CHANNELS[index].position,point)),'each hall has a useful real view');
  }
  for(const room of L.rooms)for(let z=room.bounds.minZ;z<=room.bounds.maxZ;z++)for(let x=room.bounds.minX;x<=room.bounds.maxX;x++)assert.ok(missing.some(point=>point.x===x&&point.z===z),'closed guest rooms remain unobserved');
  controller.dispose();
});

test('public cameras cannot look into guest rooms through their physical doors',()=>{
  const game=createGame({}, {mode:'blackout'}),controller=new SecurityCameras({renderer:{},film:{},home:null});
  for(const room of L.rooms){
    const index=SECURITY_CHANNELS.findIndex((channel,i)=>projects(controller.cameras[i],world(room.door.inside))&&hasMazeSight(channel.position,room.door.inside,game.tuning.corridorWidth)&&!blackoutSight(game,channel.position,room.door.inside));assert(index>=0,`a public camera overlooks the closed door of ${room.room}`);const camera=controller.cameras[index],origin=SECURITY_CHANNELS[index].position;
    const target=world(room.door.inside),bounds=roomDoorWall(room,game.tuning.corridorWidth);
    assert.ok(projects(camera,target));assert.equal(hasMazeSight(origin,room.door.inside,game.tuning.corridorWidth),true);
    assert.equal(blackoutSight(game,origin,room.door.inside),false);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(bounds.halfX*2*CELL_SIZE,2.7,bounds.halfZ*2*CELL_SIZE),new THREE.MeshBasicMaterial());
    panel.position.copy(world(bounds,1.35));panel.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(camera.position,target.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(target));
    assert.ok(ray.intersectObject(panel).length>0,'the actual camera-to-target ray meets the closed three-dimensional door');
    game.blackout.roomDoors[room.id].closed=false;game.blackout.roomDoors[room.id].progress=0;
    assert.equal(blackoutSight(game,origin,room.door.inside),true);
    panel.geometry.dispose();panel.material.dispose();
  }
  controller.dispose();
});

class Element {
    querySelector(selector){this.selected??={};return this.selected[selector]??=new Element();}
    remove(){}
  constructor(tagName='div'){
    this.tagName=tagName.toUpperCase();this.children=[];this.parentNode=null;this.clientWidth=960;this.clientHeight=540;
    this.dataset={};this.attributes={};this.style={cssText:''};this.textContent='';this.listeners=new Map();
    const classes=new Set();this.classList={remove:(...items)=>items.forEach(item=>classes.delete(item)),toggle:(item,enabled)=>enabled?classes.add(item):classes.delete(item)};
  }
  get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;}
  appendChild(child){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);this.children.push(child);child.parentNode=this;return child;}
  append(...children){for(const child of children)this.appendChild(child);}
  replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
  insertBefore(child,next){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);this.children.splice(this.children.indexOf(next),0,child);child.parentNode=this;}
  getBoundingClientRect(){return{width:this.clientWidth,height:this.clientHeight};}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  removeEventListener(type){this.listeners.delete(type);}
  focus(){document.activeElement=this;}
}

test('the UI selects the shared world camera without reading enemy state, creating radar canvases, or mutating gameplay',()=>{
  const previous=globalThis.document,nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  globalThis.document={body:new Element('body'),getElementById:node,querySelector:node,createElement:tag=>{
    assert.notEqual(tag,'canvas','monitor UI must not replace world rendering with a radar');return new Element(tag);
  }};
  let ui,controller;
  try{
    const game=createGame({}, {mode:'blackout'});game.blackout.monitor=true;game.blackout.battery=46;game.blackout.heading=.67;
    const before=structuredClone(game),guarded=new Proxy(game,{get(target,key,receiver){assert.notEqual(key,'enemy','UI must not detect the enemy independently of the camera');return Reflect.get(target,key,receiver);}});
    const home=new Element(),canvas=new Element('canvas'),sibling=new Element(),host=node('monitor-feed'),draws=[];home.append(canvas,sibling);
    let ratio=1.5,restores=0;
    const renderer={domElement:canvas,toneMappingExposure:.672,getPixelRatio:()=>ratio,setPixelRatio:value=>{ratio=value;},setSize:()=>{}};
    const film={finish:{uniforms:{securityInfrared:{value:0}}},resize:()=>{},render:(scene,camera)=>draws.push({scene,camera})};
    controller=new SecurityCameras({renderer,film,home,resizePlayer:()=>{ratio=1.5;restores++;}});
    ui=new BlackoutUI({onAction:action=>{assert.equal(action.type,'monitor-channel');controller.set(true,action.channel,host);}});
    ui.update(guarded,{active:true,heading:game.blackout.heading});controller.set(true,ui.channel,host);
    const scene=new THREE.Scene();scene.add(new THREE.Object3D());
    assert.equal(ui.channelButtons.length,SECURITY_CHANNELS.length);assert.equal(host.tagName,'DIV');
    for(let index=0;index<SECURITY_CHANNELS.length;index++){
      ui.setMonitorChannel(index);controller.draw(scene,{powerOn:false});
      assert.equal(node('monitor-coverage').dataset.channel,SECURITY_CHANNELS[index].id);
      assert.ok(node('monitor-coverage').attributes.d.length>0,'selected channel has a plan-view range');
      assert.equal(draws.at(-1).scene,scene);assert.equal(draws.at(-1).camera,controller.cameras[index]);
      assert.equal(host.dataset.channel,SECURITY_CHANNELS[index].id);assert.deepEqual(host.children,[canvas]);
    }
    assert.equal(draws.length,SECURITY_CHANNELS.length);assert.deepEqual(game,before);
    const marker=node('monitor-enemy-marker'),sighting={game:guarded,channel:SECURITY_CHANNELS[ui.channel].id,x:game.enemy.x,z:game.enemy.z};
    ui.setEnemySighting(sighting);assert.equal(marker.hidden,false);assert.equal(marker.style.left,`${(game.enemy.x-ui.mapNavigation.minX)/ui.mapNavigation.width*100}%`);
    ui.setEnemySighting(null);assert.equal(marker.hidden,true);ui.setEnemySighting({...sighting,game:{}});assert.equal(marker.hidden,true);
    ui.setEnemySighting(sighting);ui.setMonitorChannel(0);assert.equal(marker.hidden,true);ui.setEnemySighting(sighting);assert.equal(marker.hidden,true);
    ui.setEnemySighting({...sighting,channel:SECURITY_CHANNELS[0].id});assert.equal(marker.hidden,false);
    const calculations=ui.coverage.computations;ui.update(guarded,{active:true});ui.update(guarded,{active:true});
    assert.equal(ui.coverage.computations,calculations,'HUD updates reuse unchanged coverage');
    ui.update(guarded,{active:false});controller.set(false);
    assert.equal(marker.hidden,true);assert.equal(node('security-monitor').hidden,true);assert.deepEqual(home.children,[canvas,sibling]);assert.equal(host.children.length,0);assert.equal(ratio,1.5);assert.equal(restores,1);
    ui.update(guarded,{active:true});controller.set(true,ui.channel,host);controller.dispose();
    assert.deepEqual(home.children,[canvas,sibling]);assert.equal(host.children.length,0);assert.deepEqual(game,before);
  }finally{ui?.destroy();controller?.dispose();globalThis.document=previous;}
});
