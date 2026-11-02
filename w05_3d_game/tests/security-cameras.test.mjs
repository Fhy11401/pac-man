import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {SecurityCameras,securityCameraPoses,securityFeedSize,SECURITY_CHANNELS} from '../src/security-cameras.js';

const channels=[{id:'test-a',label:'A',code:'CAM A',description:'first',position:{x:18,z:12,y:2.35},target:{x:18,z:8,y:1.05},fov:78},{id:'test-b',label:'B',code:'CAM B',description:'second',position:{x:22,z:10,y:2.35},target:{x:24,z:10,y:1.05},fov:75}];
class Node {
  constructor(width=0,height=0){this.children=[];this.parentNode=null;this.clientWidth=width;this.clientHeight=height;this.style={cssText:'width:1440px;height:900px;'};}
  get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;}
  appendChild(child){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);this.children.push(child);child.parentNode=this;}
  insertBefore(child,next){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);this.children.splice(this.children.indexOf(next),0,child);child.parentNode=this;}
  getBoundingClientRect(){return{width:this.clientWidth,height:this.clientHeight};}
}
function fixture(){
  const home=new Node(1440,900),host=new Node(1600,900),canvas=new Node(),sibling=new Node();home.appendChild(canvas);home.appendChild(sibling);
  const calls=[],draws=[],changes=[];let ratio=1.5;
  const renderer={domElement:canvas,toneMappingExposure:.672,getPixelRatio:()=>ratio,setPixelRatio:value=>{ratio=value;calls.push(['ratio',value]);},setSize:(...size)=>calls.push(['size',...size])};
  const film={finish:{uniforms:{securityInfrared:{value:0}}},resize:()=>calls.push(['film-resize']),render:(scene,camera,overlay,ao)=>draws.push({scene,camera,overlay,ao,exposure:renderer.toneMappingExposure,sensor:film.finish.uniforms.securityInfrared.value})};
  const controller=new SecurityCameras({renderer,film,home,channels,onChange:(...args)=>changes.push(args),resizePlayer:()=>{renderer.setPixelRatio(1.5);renderer.setSize(1440,900);film.resize();}});
  return{home,host,canvas,sibling,renderer,film,calls,draws,changes,controller};
}

test('canvas moves once into the monitor, fits 16:9 at DPR1, and returns to its exact original parent/order',()=>{
  const f=fixture(),c=f.controller,originalStyle=f.canvas.style.cssText;
  assert.equal(c.set(true,0,f.host),true);assert.equal(f.renderer.domElement,f.canvas);assert.equal(f.canvas.parentNode,f.host);assert.equal(f.renderer.getPixelRatio(),1);assert.deepEqual(f.calls.find(call=>call[0]==='size'),['size',1920,1080,false]);
  const count=f.calls.length;assert.equal(c.set(true,0,f.host),false);assert.equal(f.calls.length,count,'repeated UI updates do not resize/reallocate targets');
  f.host.clientWidth=640;f.host.clientHeight=360;c.resize();assert.deepEqual(f.calls.filter(call=>call[0]==='size').at(-1),['size',1920,1080,false]);
  assert.equal(c.set(false),true);assert.deepEqual(f.home.children,[f.canvas,f.sibling]);assert.equal(f.host.children.length,0);assert.equal(f.canvas.style.cssText,originalStyle);assert.equal(f.renderer.getPixelRatio(),1.5);assert.deepEqual(f.calls.filter(call=>call[0]==='size').at(-1),['size',1440,900]);assert.equal(c.active,false);
  assert.equal(c.set(false),false);assert.equal(c.set(true,0,null),false);
});

test('only drawing is limited to 30Hz and channel/power changes invalidate immediately',()=>{
  const f=fixture(),c=f.controller;let simulationTicks=0,draws=0;c.set(true,0,f.host);
  for(let frame=0;frame<60;frame++){simulationTicks++;if(c.shouldRender(1/60,false))draws++;}
  assert.equal(simulationTicks,60);assert.equal(draws,30);
  assert.equal(c.shouldRender(0,false),false);assert.equal(c.shouldRender(0,true),true);
  c.set(true,'test-b',f.host);assert.equal(c.selected.id,'test-b');assert.equal(c.shouldRender(0,true),true);assert.equal(c.shouldRender(0,true),false);
  c.set(true,999,f.host);assert.equal(c.channel,0);assert.equal(c.shouldRender(0,true),true);
  c.set(false);assert.equal(c.shouldRender(1,false),false);
});

test('the selected real camera renders the exact scene once; IR uniforms and exposure restore even on render failure',()=>{
  const f=fixture(),c=f.controller,scene=new THREE.Scene(),enemy=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.fog=new THREE.Fog(0x111111,10,28);scene.add(enemy);c.set(true,1,f.host);
  const before=c.camera.matrixWorld.toArray();assert.equal(c.draw(scene,{powerOn:false,baseExposure:.6,contactStrength:.9}),true);
  assert.equal(f.draws.length,1);assert.equal(f.draws[0].scene,scene);assert.equal(f.draws[0].camera,c.cameras[1]);assert.equal(f.draws[0].overlay,undefined);assert.equal(f.draws[0].ao,.45);assert.ok(Math.abs(f.draws[0].exposure-.6)<1e-10);assert.equal(f.draws[0].sensor,1);assert.equal(f.renderer.toneMappingExposure,.672);assert.equal(f.film.finish.uniforms.securityInfrared.value,0);assert.deepEqual(c.camera.matrixWorld.toArray(),before);assert.equal(scene.fog.near,10);assert.equal(scene.fog.far,28);
  enemy.position.x=1;c.draw(scene,{powerOn:true});assert.equal(f.draws[1].scene.children[0],enemy);assert.equal(f.draws[1].sensor,0);assert.equal(f.draws[1].exposure,.672);
  f.film.render=()=>{assert.equal(scene.fog.near,16);assert.equal(scene.fog.far,50);throw new Error('draw failed');};assert.throws(()=>c.draw(scene,{powerOn:false}),/draw failed/);assert.equal(f.renderer.toneMappingExposure,.672);assert.equal(f.film.finish.uniforms.securityInfrared.value,0);assert.equal(scene.fog.near,10);assert.equal(scene.fog.far,28);
  c.set(false);assert.equal(c.draw(scene),false);enemy.geometry.dispose();enemy.material.dispose();
});

test('repeated monitor cycles and disposal keep one canvas and disconnect the only resize observer',()=>{
  const previous=globalThis.ResizeObserver,observers=[];
  globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;this.live=false;observers.push(this);}observe(){this.live=true;}disconnect(){this.live=false;}};
  try{
    const f=fixture(),c=f.controller;const cameras=[...c.cameras];
    for(let i=0;i<12;i++){c.set(true,i%2,f.host);c.shouldRender(1/60,false);c.set(false);assert.deepEqual(f.home.children,[f.canvas,f.sibling]);assert.equal(f.host.children.length,0);}
    assert.equal(observers.length,1);assert.deepEqual(c.cameras,cameras);
    c.set(true,1,f.host);const calls=f.calls.length;c.dispose();assert.equal(observers[0].live,false);assert.equal(f.canvas.parentNode,f.home);assert.equal(c.cameras.length,0);assert.equal(f.calls.length,calls,'dispose does not allocate a final full-resolution target');
    observers[0].callback();assert.equal(f.calls.length,calls);assert.equal(c.set(true,0,f.host),false);assert.equal(c.shouldRender(1,true),false);assert.equal(c.draw(new THREE.Scene()),false);c.dispose();
  }finally{globalThis.ResizeObserver=previous;}
});

test('camera configuration is data driven, finite, and independent of the player perspective',()=>{
  const poses=securityCameraPoses(1.8,2.4,channels);assert.equal(poses.length,channels.length);
  assert.equal(securityCameraPoses(1.8,2.4).length,SECURITY_CHANNELS.length);
  for(const pose of poses){assert.ok(pose.position.toArray().every(Number.isFinite));assert.ok(pose.target.toArray().every(Number.isFinite));assert.ok(pose.position.distanceTo(pose.target)>0);}
  assert.throws(()=>securityCameraPoses(0,2.4,channels),RangeError);assert.throws(()=>securityCameraPoses(1.8,2.4,[{...channels[0],target:channels[0].position}]),RangeError);
  assert.throws(()=>securityCameraPoses(1.8,2.4,[{...channels[0],position:{x:NaN,z:0,y:2}}]),TypeError);
  assert.deepEqual(securityFeedSize(1920,1080),{width:1920,height:1080});assert.deepEqual(securityFeedSize(640,360),{width:1920,height:1080});assert.deepEqual(securityFeedSize(0,0),{width:1920,height:1080});
});


test('rendered enemy metadata is cleared on camera change and closing',()=>{
 const f=fixture(),c=f.controller;
 c.set(true,0,f.host);c.detector.visible=()=>true;
 const game={phase:'playing',enemy:{x:4,z:5}};c.observeEnemy({}, {},game);assert.equal(c.sighting.game,game);assert.equal(c.sighting.channel,channels[0].id);
 c.set(true,1,f.host);assert.equal(c.sighting,null);c.observeEnemy({}, {},game);assert.equal(c.sighting.channel,channels[1].id);
 c.detector.visible=()=>false;c.observeEnemy({}, {},game);assert.equal(c.sighting,null);
 c.detector.visible=()=>true;c.observeEnemy({}, {},game);c.close();assert.equal(c.sighting,null);
});

test('phone sensor shares desktop fill lighting and restores player lights even if rendering fails',()=>{
 const f=fixture(),c=f.controller,ambientLight={intensity:.03},hemisphereLight={intensity:.02};c.set(true,0,f.host);
 f.film.render=()=>{assert.equal(ambientLight.intensity,1.8);assert.equal(hemisphereLight.intensity,.7);};c.draw(new THREE.Scene(),{ambientLight,hemisphereLight});assert.equal(ambientLight.intensity,.03);assert.equal(hemisphereLight.intensity,.02);
 f.film.render=()=>{assert.equal(ambientLight.intensity,1.2);throw new Error('failed');};assert.throws(()=>c.draw(new THREE.Scene(),{powerOn:true,ambientLight,hemisphereLight}),/failed/);assert.equal(ambientLight.intensity,.03);assert.equal(hemisphereLight.intensity,.02);
});


test('coverage poses reuse the same heading across complete revolutions and channel changes',()=>{
 const f=fixture(),c=f.controller;c.set(true,0,f.host);c.pans[0].yaw=.02;
 const first=c.mapPose;c.pans[0].yaw=Math.PI*2+.02;assert.equal(c.mapPose,first);
 c.pans[0].yaw=-Math.PI*2+.02;assert.equal(c.mapPose,first);
 c.pans[0].yaw=Math.PI/2;assert.notDeepEqual(c.mapPose.target,first.target);
 for(let i=0;i<240;i++){c.pans[0].yaw=i*Math.PI/12;void c.mapPose;}
 assert.equal(c.mapPoses[0].size,24);
 c.set(true,1,f.host);assert.equal(c.mapPose.id,channels[1].id);
 c.set(true,0,f.host);c.pans[0].yaw=.02;assert.equal(c.mapPose,first);
 c.close();assert.equal(c.mapPose,null);c.dispose();assert.equal(c.mapPoses.length,0);
});
