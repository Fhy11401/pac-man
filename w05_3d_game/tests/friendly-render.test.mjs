import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {FilmLight} from '../src/film-light.js';
import {EnemyXray,MosaicFallback,mosaicGrid,updateEnemyWarning} from '../src/friendly-render.js';
import {WorldView} from '../src/view.js';
import {PlayerMotion} from '../src/player-motion.js';
import {DEFAULT_TUNING} from '../src/tuning.js';
import {createGame} from '../src/core.js';

function renderer(hdr=true){
  let target=null;
  return {autoClear:true,info:{autoReset:true},calls:[],extensions:{has:()=>hdr},getContext:()=>({MAX_SAMPLES:1,getParameter:()=>4}),
    getDrawingBufferSize:v=>v.set(1920,1080),getPixelRatio:()=>2,getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},compile(){},
    render(scene,camera){this.calls.push({scene,camera,target,material:scene.children[0]?.material,clear:this.autoClear,reset:this.info.autoReset});}};
}

test('friendly HDR sampling uses an aspect-correct block grid without extra passes and resets for ordinary/CCTV/title frames',()=>{
  const r=renderer(),film=new FilmLight(r),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,16/9,.045,70),scare=new THREE.Scene();
  const version=film.finish.version,draw=mosaic=>film.render(scene,camera,()=>r.render(scare,camera),0,{mosaic});
  draw(false);const ordinary=r.calls.length;assert.deepEqual(film.finish.uniforms.mosaicCells.value.toArray(),[0,0]);r.calls=[];
  draw(true);assert.equal(r.calls.length,ordinary);assert.deepEqual(film.finish.uniforms.mosaicCells.value.toArray(),[53,30]);
  assert.equal(r.calls[0].target,film.color);assert.equal(r.calls[1].scene,scare);assert.equal(r.calls[1].target,film.color,'the full scare is in the quantized source');
  assert.equal(r.calls.at(-1).material,film.finish);assert.equal(r.calls.at(-1).target,null);
  assert.match(film.finish.fragmentShader,/floor\(vUv\*mosaicCells\)/);assert.match(film.finish.fragmentShader,/texture2D\(source,uv\)/);assert.match(film.finish.fragmentShader,/texture2D\(bloom,uv\)/);
  for(const [w,h] of [[1920,1080],[1024,768],[1080,1920],[20,12]]){const g=mosaicGrid(w,h);assert.ok(Math.abs(w/g.x-h/g.y)<1.5);assert.ok(g.y<=30&&g.x>=1);}
  film.render(scene,camera);assert.deepEqual(film.finish.uniforms.mosaicCells.value.toArray(),[0,0]);assert.equal(film.finish.version,version,'toggles do not recompile the material');assert.equal(r.info.autoReset,true);assert.equal(r.autoClear,true);film.dispose();
});

test('non-HDR hardware receives real nearest-neighbour pixelation only during friendly scares and releases its target',()=>{
  const r=renderer(false),film=new FilmLight(r),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),scare=new THREE.Scene(),fallback=film.mosaicFallback;
  film.render(scene,camera);assert.equal(r.calls.length,1);assert.equal(r.calls[0].target,null);
  r.calls=[];film.render(scene,camera,()=>r.render(scare,camera),0,{mosaic:true});
  assert.equal(r.calls.length,3);assert.equal(r.calls[0].target,fallback.target);assert.equal(r.calls[1].target,fallback.target);assert.equal(r.calls[2].target,null);
  assert.equal(fallback.target.width,53);assert.equal(fallback.target.height,30);assert.equal(fallback.target.texture.minFilter,THREE.NearestFilter);assert.equal(fallback.target.texture.magFilter,THREE.NearestFilter);
  assert.equal(r.calls[2].material.uniforms.source.value,fallback.target.texture);assert.equal(r.info.autoReset,true);assert.equal(r.autoClear,true);
  let released=0;for(const resource of [fallback.target,fallback.geometry,fallback.material])resource.addEventListener('dispose',()=>released++);
  film.dispose();film.dispose();assert.equal(released,3);
});

test('the fallback restores renderer state even if an overlay draw fails',()=>{
  const r=renderer(false),fallback=new MosaicFallback(r),external=new THREE.WebGLRenderTarget(16,16);r.setRenderTarget(external);r.info.autoReset=false;r.autoClear=false;
  assert.throws(()=>fallback.render(new THREE.Scene(),new THREE.PerspectiveCamera(),()=>{throw new Error('draw failure');}),/draw failure/);
  assert.equal(r.getRenderTarget(),external);assert.equal(r.autoClear,false);assert.equal(r.info.autoReset,false);fallback.dispose();external.dispose();
});

test('a stationary enemy refreshes real shadow maps for gate, room door and bash motion, but stable frames do no shadow work',()=>{
  const light=new THREE.SpotLight(),previous={},options={x:2,z:3,heading:.7,enabled:true,friendly:true,doorProgress:1,roomDoors:{'201':{progress:1,bashPulse:0}}};
  light.castShadow=true;light.shadow.autoUpdate=false;
  const update=()=>updateEnemyWarning(light,previous,options);
  update();assert.equal(light.intensity,60);assert.equal(light.shadow.needsUpdate,true);assert.equal(light.distance,7);assert.equal(light.angle,Math.PI/10.5);
  const pitch=Math.atan2(light.target.position.y-light.position.y,2.6);assert.ok(pitch+light.angle<0,'even the top of the cone points below the horizon');
  light.shadow.needsUpdate=false;update();assert.equal(light.shadow.needsUpdate,false);
  options.doorProgress=.6;update();assert.equal(light.shadow.needsUpdate,true);
  light.shadow.needsUpdate=false;options.roomDoors['201'].progress=.7;update();assert.equal(light.shadow.needsUpdate,true);
  light.shadow.needsUpdate=false;options.roomDoors['201'].bashPulse=.4;update();assert.equal(light.shadow.needsUpdate,true);
  options.enabled=false;update();assert.equal(light.intensity,0);assert.equal(light.shadow.needsUpdate,false);
  options.enabled=true;update();assert.equal(light.shadow.needsUpdate,true);assert.equal(light.castShadow,true);assert.equal(light.shadow.autoUpdate,false);
  assert.ok(Math.abs(light.target.position.x-(2+Math.sin(.7)*2.6))<1e-9);assert.ok(Math.abs(light.target.position.z-(3+Math.cos(.7)*2.6))<1e-9);
  light.shadow.needsUpdate=false;options.friendly=false;update();assert.equal(light.intensity,110);assert.equal(light.angle,Math.PI/5.2);assert.equal(light.distance,12);assert.equal(light.shadow.needsUpdate,true,'profile changes refresh the shadow projection');
  assert.ok(Math.abs(light.target.position.z-(3+Math.cos(.7)*5))<1e-9,'ordinary collection lighting is preserved');
});

test('xray draws one lightweight screen-space marker outside the face, preserves scene poses and skips invisible/offscreen targets',()=>{
  const r=renderer(),xray=new EnemyXray(),camera=new THREE.PerspectiveCamera(60,16/9,.045,70),enemy=new THREE.Group();camera.position.y=1.65;camera.updateMatrixWorld();enemy.position.z=-6;enemy.updateMatrixWorld();
  const cameraPose=camera.matrixWorld.clone(),enemyPose=enemy.matrixWorld.clone();assert.equal(xray.draw(r,camera,enemy),true);assert.equal(r.calls.length,1);assert.equal(r.calls[0].scene,xray.scene);assert.equal(r.calls[0].clear,false);assert.equal(r.calls[0].reset,false);
  assert.equal(xray.material.depthTest,false);assert.equal(xray.geometry.attributes.position.count,72);assert.equal(xray.scene.children.length,1);assert.equal(r.autoClear,true);assert.equal(r.info.autoReset,true);
  assert.ok(camera.matrixWorld.equals(cameraPose));assert.ok(enemy.matrixWorld.equals(enemyPose));
  const face=new THREE.Vector3(0,1.64,-5.97).project(camera);face.z=0;const positions=xray.geometry.attributes.position;
  for(let i=0;i<positions.count;i+=3){const triangle=new THREE.Triangle(...[i,i+1,i+2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,j)));assert.equal(triangle.containsPoint(face),false,'the face remains uncovered');}
  enemy.visible=false;assert.equal(xray.draw(r,camera,enemy),false);enemy.visible=true;enemy.position.z=6;assert.equal(xray.draw(r,camera,enemy),false);enemy.position.set(100,0,-6);assert.equal(xray.draw(r,camera,enemy),false);assert.equal(r.calls.length,1);
  enemy.position.set(0,0,-6);r.render=()=>{throw new Error('marker failure');};assert.throws(()=>xray.draw(r,camera,enemy),/marker failure/);assert.equal(r.autoClear,true);assert.equal(r.info.autoReset,true);
  let released=0;for(const resource of [xray.geometry,xray.material])resource.addEventListener('dispose',()=>released++);xray.dispose();xray.dispose();assert.equal(released,2);assert.equal(xray.draw(r,camera,enemy),false);
});

test('WorldView isolates friendly and developer effects to the intended camera and phase without changing gameplay state',()=>{
  const camera=new THREE.PerspectiveCamera(60,16/9,.045,70),game=createGame({}, {mode:'blackout'}),scene=new THREE.Scene(),enemy=new THREE.Group(),body=new THREE.Group(),r=renderer();enemy.add(body);scene.add(enemy);
  const draws=[],v={scene,camera,renderer:r,cameraLight:new THREE.PointLight(),eyeHeight:1.65,horizontalFov:86,playerMotion:new PlayerMotion(),motionTuning:{...DEFAULT_TUNING},motionEnabled:true,reducedMotion:{matches:false},shardFade:new Float32Array(0),enemyPhase:0,enemy,enemyBody:body,enemyLimbs:[],warningLight:new THREE.SpotLight(),warningShadowPose:{},exitMaterial:{color:new THREE.Color()},exitRing:{material:{color:new THREE.Color()},rotation:{}},lampHalos:{instanceMatrix:{}},lights:[],security:{active:false,resetAim(){},updateAim(){},observeEnemy(){},camera:new THREE.PerspectiveCamera(),selected:{id:'hall'},shouldRender:()=>true,draw(){draws.push('monitor');}},blackoutView:{update(){}},film:{render(s,c,o,a,options){draws.push({mosaic:options?.mosaic??false});}},enemyXray:{draw(){draws.push('xray');}},updateLampPool(){},updateFov:WorldView.prototype.updateFov,setSecurityMonitor(active){this.security.active=active;}};
  const snapshot=structuredClone(game),frame=(active=true)=>{draws.length=0;WorldView.prototype.render.call(v,game,.3,.1,1,1/60,active);};
  frame();assert.deepEqual(draws,[{mosaic:false}]);assert.equal(v.warningLight.intensity,0);
  v.motionTuning.friendlyMode=true;v.motionTuning.enemyXray=true;frame();assert.deepEqual(draws,[{mosaic:false},'xray']);assert.equal(v.warningLight.intensity,60);assert.deepEqual(game,snapshot);
  v.security.active=true;frame();assert.deepEqual(draws,['monitor']);
  game.phase='caught';game.caught=1.1;frame();assert.equal(v.security.active,false);assert.deepEqual(draws,[{mosaic:true}]);assert.equal(v.warningLight.intensity,0);
  v.motionTuning.friendlyMode=false;frame();assert.deepEqual(draws,[{mosaic:false}]);game.phase='playing';frame(false);assert.deepEqual(draws,[{mosaic:false}]);assert.equal(v.warningLight.intensity,0);
  v.openingScene={update:()=>true,lensThreat:1};v.motionTuning.friendlyMode=true;frame();assert.deepEqual(draws,[{mosaic:false}],'opening close-up remains clear in friendly mode');
  v.openingScene.lensThreat=0;frame();assert.deepEqual(draws,[{mosaic:false}]);v.openingScene.lensThreat=1;v.motionTuning.friendlyMode=false;frame();assert.deepEqual(draws,[{mosaic:false}]);delete v.openingScene;
  v.container={};r.domElement={parentNode:v.container};v.menuView={draw(){draws.push('menu');return true;}};draws.length=0;WorldView.prototype.renderTitle.call(v,'lost');assert.deepEqual(draws,['menu']);
});
