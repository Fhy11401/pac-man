import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {MenuView} from '../src/menu-view.js';
import {attendantMaterials,attendantHead,createAttendant} from '../src/enemy-model.js';
import {WorldView} from '../src/view.js';

const pose=object=>({position:object.position.toArray(),rotation:object.rotation.toArray(),scale:object.scale.toArray(),visible:object.visible});
function fixture(){
  const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  const materials=attendantMaterials();let model;try{model=createAttendant(materials);}finally{globalThis.document=previous;}
  const scare=attendantHead(materials),menu=new MenuView(model.body),calls=[];
  const renderer={toneMappingExposure:.672},film={finish:{uniforms:{securityInfrared:{value:0}}},render:(scene,camera,overlay,ao)=>calls.push({scene,camera,overlay,ao,exposure:renderer.toneMappingExposure})};
  const dispose=()=>{menu.dispose();const geometries=new Set(),textures=new Set();for(const root of [model.root,scare])root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const m of Object.values(materials)){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}for(const g of geometries)g.dispose();for(const t of textures)t.dispose();};
  return{materials,model,scare,menu,renderer,film,calls,dispose};
}

test('menu portrait shares source resources but owns its pose, lights and camera',()=>{
  const f=fixture(),source=[],portrait=[];f.model.body.traverse(o=>{if(o.isMesh)source.push(o);});f.menu.portrait.traverse(o=>{if(o.isMesh)portrait.push(o);});
  assert.equal(portrait.length,source.length);portrait.forEach((mesh,index)=>{assert.notEqual(mesh,source[index]);assert.equal(mesh.geometry,source[index].geometry);assert.equal(mesh.material,source[index].material);});
  f.model.body.position.set(.2,.1,.3);f.model.body.rotation.y=.44;f.scare.position.set(.4,-.1,-.8);f.scare.rotation.set(.2,.3,.1);f.scare.scale.setScalar(1.2);
  const bodyPose=pose(f.model.body),scarePose=pose(f.scare),versions=Object.values(f.materials).map(m=>m.version);for(const m of Object.values(f.materials))m.envMapIntensity*=.09;
  const reflection=Object.values(f.materials).map(m=>m.envMapIntensity);
  for(const kind of ['menu','lost','won','menu'])f.menu.draw(f.renderer,f.film,kind,16/9);
  assert.deepEqual(pose(f.model.body),bodyPose);assert.deepEqual(pose(f.scare),scarePose);assert.deepEqual(Object.values(f.materials).map(m=>m.envMapIntensity),reflection);assert.deepEqual(Object.values(f.materials).map(m=>m.version),versions);assert.equal(f.calls.length,4);assert.ok(f.calls.every(call=>call.scene===f.menu.scene&&call.camera===f.menu.camera&&call.overlay===undefined));assert.equal(f.renderer.toneMappingExposure,.672);
  f.dispose();
});

test('head framing preserves the left text region at common desktop aspect ratios',()=>{
  const f=fixture();
  for(const aspect of [4/3,16/9,21/9])for(const kind of ['menu','lost']){
    f.menu.configure(kind,aspect);const head=f.menu.portrait.getObjectByName('attendant-head'),box=new THREE.Box3().setFromObject(head),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(f.menu.camera));
    assert.ok(Math.min(...points.map(p=>p.x))>.05,`${kind} ${aspect} head stays right of text`);
    assert.ok(Math.max(...points.map(p=>p.x))<1.12,`${kind} ${aspect} face remains in frame`);
    assert.ok(Math.min(...points.map(p=>p.y))>-.9&&Math.max(...points.map(p=>p.y))<1.25,'eyes/mouth remain visible');
  }
  f.menu.configure('won',16/9);assert.equal(f.menu.portrait.visible,false);f.dispose();
});

test('title pass restores shared uniforms on failure and disposing it never disposes shared GPU resources',()=>{
  const f=fixture();f.film.finish.uniforms.securityInfrared.value=1;
  const reflection=Object.values(f.materials).map(m=>m.envMapIntensity);f.film.render=()=>{throw new Error('title pass failed');};assert.throws(()=>f.menu.draw(f.renderer,f.film,'lost'),/title pass failed/);
  assert.deepEqual(Object.values(f.materials).map(m=>m.envMapIntensity),reflection);assert.equal(f.renderer.toneMappingExposure,.672);assert.equal(f.film.finish.uniforms.securityInfrared.value,1);
  let resourcesDisposed=0;const geometries=new Set();f.model.body.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const g of geometries)g.addEventListener('dispose',()=>resourcesDisposed++);for(const m of Object.values(f.materials))m.addEventListener('dispose',()=>resourcesDisposed++);
  f.menu.dispose();assert.equal(resourcesDisposed,0);assert.equal(f.menu.draw(f.renderer,f.film),false);f.dispose();
});

test('WorldView title rendering returns the same canvas home without updating player motion or gameplay pose',()=>{
  const f=fixture(),canvas={parentNode:{}},home={appendChild(node){node.parentNode=this;}},camera=new THREE.PerspectiveCamera(60,16/9,.045,70);camera.position.set(2,1.65,3);camera.rotation.set(.12,.8,0);
  const cameraPose=pose(camera),game={player:{x:16,z:16},enemy:{x:18,z:10}},before=JSON.stringify(game);let closes=0;
  const view={disposed:false,renderer:{...f.renderer,domElement:canvas},film:f.film,container:home,camera,menuView:f.menu,setSecurityMonitor(active){assert.equal(active,false);closes++;},playerMotion:{update(){throw new Error('must not update motion');}},lastGame:game};
  assert.equal(WorldView.prototype.renderTitle.call(view,'lost'),true);assert.equal(closes,1);assert.equal(canvas.parentNode,home);assert.deepEqual(pose(camera),cameraPose);assert.equal(JSON.stringify(game),before);assert.equal(f.calls.length,1);f.dispose();
});
