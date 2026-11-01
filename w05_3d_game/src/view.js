import {DEFAULT_TUNING} from './tuning.js';
import * as THREE from '../vendor/three.module.js';
import { MAP, MAP_CENTER, MAP_WIDTH, MAP_HEIGHT, SHARDS, EXIT, ENEMY_START, isOpen, RULES,CELL_SIZE,wallInset,transitionWalls,isInSafeRoom,IS_MAP_DRAFT } from './world.js';
import {decorateHotel,createHotelDoor} from './hotel-detail.js';
import {decorateMapLandmarks} from './map-landmarks.js';
import {buildSafeRoom} from './safe-room-view.js';
import {prepareBlackoutWorld,buildBlackoutView} from './blackout-view.js';
import {hotelTexture as texture,makeHotelMaterials} from './hotel-materials.js';
import {SCARE_TURN_SECONDS,renderPixelRatio,angularTurnRate} from './presentation.js';
import {PlayerMotion} from './player-motion.js';
import {applyHotelAsset} from './hotel-assets.js';
import {crystalGeometry} from './crystal.js';
import {createCrystalMaterial} from './crystal-material.js';
import {attendantMaterials,attendantHead,createAttendant} from './enemy-model.js';
import {hotelEnvironment,addContactOcclusion,lampHalos} from './hotel-lighting.js';
import {batchStaticMeshes} from './static-batch.js';
import {beveledBoxGeometry} from './joinery.js';
import {FilmLight} from './film-light.js';
import {createWallShell} from './wall-shell.js';
import {SecurityCameras} from './security-cameras.js';
import {buildSecurityRooms} from './security-rooms.js';
import {blackoutVisualLighting} from './blackout-lighting.js';
import {MenuView} from './menu-view.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {hallAt} from './hall-layout.js';
import {buildHalls,createHallCeiling} from './hall-view.js';
import {bedViewHeight} from './bed-layout.js';
import {EnemyXray,updateEnemyWarning} from './friendly-render.js';
export const UNIT = CELL_SIZE;
const world = (x,z,y=0) => new THREE.Vector3((x-MAP_CENTER.x)*UNIT,y,(z-MAP_CENTER.z)*UNIT);
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,1,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.15,'#d99cffbb');g.addColorStop(.5,'#8c3cbd30');g.addColorStop(1,'#0000');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
export class WorldView {
  constructor(container,tuning=DEFAULT_TUNING){
    this.disposed=false;this.container=container;
    this.loadingListeners=new Set();this.loadingProgress={stage:'assets',completed:0,total:0,ratio:0};
    this.corridorWidth=tuning.corridorWidth??DEFAULT_TUNING.corridorWidth;this.wallInset=wallInset(this.corridorWidth);this.eyeHeight=tuning.eyeHeight??DEFAULT_TUNING.eyeHeight;
    this.ceilingHeight=tuning.ceilingHeight??DEFAULT_TUNING.ceilingHeight;
    this.horizontalFov=DEFAULT_TUNING.fov;this.motionTuning={...DEFAULT_TUNING,...tuning};this.playerMotion=new PlayerMotion();this.enemyPhase=0;this.enemyHeading=-Math.PI/2;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');this.motionEnabled=!this.reducedMotion.matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0d0b11');this.scene.fog=new THREE.Fog('#0d0b11',10,28);
    this.camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.045,70);this.camera.rotation.order='YXZ';
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));this.renderer.setSize(innerWidth,innerHeight);this.renderer.transmissionResolutionScale=.5;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.672;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;
    this.environmentTarget=hotelEnvironment(this.renderer);this.scene.environment=this.environmentTarget.texture;
    this.hemisphereLight=new THREE.HemisphereLight(0xc6c8c6,0x48414b,.19);this.scene.add(this.hemisphereLight);
    this.ambientLight=new THREE.AmbientLight(0xadb1b2,.07);this.scene.add(this.ambientLight);
    // Preserve the outline of nearby walls without making the whole corridor bright.
    this.cameraLight=new THREE.PointLight(0xbcc1bb,.18,3.5,2);this.scene.add(this.cameraLight);
    this.assetJobs=[];this.mat=makeHotelMaterials(this.assetJobs,this.ceilingHeight,MAP_WIDTH,MAP_HEIGHT);this.detailAudit={crookedPictures:0,ajarDoors:0,luggage:0,maxPropProjection:0};
    this.hallDefinitions=IS_MAP_DRAFT?[]:BLACKOUT_LAYOUT.halls??[];this.hallAt=(x,z)=>hallAt(this.hallDefinitions,x,z);
    this.buildMap();this.halls=buildHalls(this,world,UNIT,this.hallDefinitions,isOpen);decorateHotel(this,world,UNIT);decorateMapLandmarks(this,world,UNIT);addContactOcclusion(this,world,UNIT);this.blackoutPreparation=prepareBlackoutWorld(this,world,UNIT);this.batchStaticMeshes();this.freezeStaticWorld();this.finishLegacyDoors();this.safeRoom=buildSafeRoom(this,world,UNIT);this.buildShards();this.buildExit();this.buildEnemy();this.assetJobs.push(applyHotelAsset(this.attendantMat.porcelain,'leather',{repeat:[3,1.5],normalScale:.32}));this.buildScare();this.blackoutView=buildBlackoutView(this,world,UNIT);this.securityRooms=buildSecurityRooms(this,world,UNIT);
    // Static shadow maps update only when a pool slot moves to another real fixture.
    // Downward cones keep the warm light local and prevent light leaking through walls.
    this.lights=Array.from({length:10},()=>{const light=new THREE.SpotLight(0xffd29f,10,6.2,Math.PI/3.1,.78,2);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.near=.06;light.shadow.bias=-.00015;light.shadow.normalBias=.025;light.shadow.autoUpdate=false;light.userData.fixture=-1;this.scene.add(light,light.target);return light;});this.lightClock=1;
    this.lampHalos=lampHalos(this.lights.length);this.scene.add(this.lampHalos);
    this.scene.traverse(object=>{for(const material of [object.material].flat()){if(material?.isMeshStandardMaterial&&!material.envMap){material.envMap=this.environmentTarget.texture;material.needsUpdate=true;}}});
    this.film=new FilmLight(this.renderer);this.lampHalos.visible=!this.film.enabled;
    this.menuView=new MenuView(this.enemyBody);this.enemyXray=new EnemyXray();
    this.security=new SecurityCameras({renderer:this.renderer,film:this.film,home:container,corridorWidth:this.corridorWidth,unit:UNIT,onChange:active=>{this.lightClock=1;if(!active&&this.lastGame&&!this.disposed)this.updateLampPool(this.lastGame,0,this.camera);},resizePlayer:()=>this.resizePlayerView()});
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.updateFov();if(this.security.active)this.security.resize();else this.resizePlayerView();};window.addEventListener('resize',this.resize);this.updateFov();
    this.ready=this.prepareAssets();
  }
  onLoadingProgress(callback){
    if(this.disposed)return()=>{};
    this.loadingListeners.add(callback);callback(this.loadingProgress);
    return()=>this.loadingListeners.delete(callback);
  }
  reportLoading(stage,completed,total,ratio){
    if(this.disposed)return;
    this.loadingProgress={stage,completed,total,ratio:Math.max(this.loadingProgress.ratio,Math.min(1,ratio))};
    for(const callback of this.loadingListeners)callback(this.loadingProgress);
  }
  async prepareAssets(){
      let completed=0;const total=this.assetJobs.length;
      this.reportLoading('assets',0,total,0);
      this.assetAudit=await Promise.all(this.assetJobs.map(job=>Promise.resolve(job).then(result=>{this.reportLoading('assets',++completed,total,total?completed/total*.82:.82);return result;})));
      if(this.disposed)return;
      // Upload decoded surface maps before movement; first visibility of a
      // distant door or face must not synchronously upload its texture set.
      const loadedTextures=new Set();
      for(const scene of [this.scene,this.scareScene])scene.traverse(object=>{
        for(const material of [object.material].flat())if(material)for(const value of Object.values(material)){
          if(value?.isTexture&&!value.isRenderTargetTexture)loadedTextures.add(value);
        }
      });
      const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      this.reportLoading('upload',0,loadedTextures.size,.82);
      await nextPaint();if(this.disposed)return;
      let uploaded=0,sliceStarted=performance.now();
      for(const texture of loadedTextures){
        if(this.disposed)return;
        this.renderer.initTexture(texture);uploaded++;
        this.reportLoading('upload',uploaded,loadedTextures.size,.82+.14*uploaded/loadedTextures.size);
        // Give the progress overlay a paint between GPU upload batches.
        if(performance.now()-sliceStarted>=8){await nextPaint();sliceStarted=performance.now();}
      }
      this.reportLoading('warmup',0,1,.96);
      await nextPaint();if(this.disposed)return;
      // compileAsync leaves a readiness timer alive after renderer.dispose().
      // Developer sliders can rebuild immediately; compile synchronously once
      // on the menu so no stale shader poll can touch a destroyed renderer.
      const restoreBlackoutVisibility=this.blackoutView?.warmup();
      const roomVisibility=this.securityRooms?.group.visible;if(this.securityRooms)this.securityRooms.group.visible=true;
      try{this.film.warmup(this.scene,this.camera,this.scareScene,this.scareCamera);if(this.menuView)this.film.warmup(this.menuView.scene,this.menuView.camera,this.scareScene,this.scareCamera);this.enemyXray?.warmup(this.renderer);}finally{restoreBlackoutVisibility?.();if(this.securityRooms)this.securityRooms.group.visible=roomVisibility;}
      this.reportLoading('ready',1,1,1);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.blackoutView?.controlRoom?.dispose();this.security?.dispose();
    this.menuView?.dispose();
    this.enemyXray?.dispose();
    this.loadingListeners.clear();
    window.removeEventListener('resize',this.resize);
    const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const scene of [this.scene,this.scareScene])scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.material)for(const material of [object.material].flat())materials.add(material);
      object.shadow?.map?.dispose();
    });
    for(const material of materials){for(const value of Object.values(material))if(value?.isTexture&&value!==this.environmentTarget?.texture)textures.add(value);material.dispose();}
    for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();
    this.film?.dispose();this.environmentTarget?.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  }
  updateFov(){const next=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov+this.playerMotion.fov)/2)/Math.max(1.6,this.camera.aspect)));if(Math.abs(next-this.camera.fov)>1e-7||this.projectionAspect!==this.camera.aspect){this.camera.fov=next;this.projectionAspect=this.camera.aspect;this.camera.updateProjectionMatrix();}}
  resizePlayerView(){this.camera.aspect=innerWidth/innerHeight;this.updateFov();this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));this.renderer.setSize(innerWidth,innerHeight);this.film.resize();}
  setSecurityMonitor(active,channel=0,container=null){if(this.disposed)return false;return this.security.set(active,channel,container??globalThis.document?.getElementById?.('monitor-feed'));}
  renderTitle(kind='menu'){
    if(this.disposed)return false;this.setSecurityMonitor(false);
    if(this.renderer.domElement.parentNode!==this.container)this.container.appendChild(this.renderer.domElement);
    return this.menuView.draw(this.renderer,this.film,kind,this.camera.aspect);
  }
  updateLampPool(game,dt,camera=this.camera,channel=null){
    this.lightClock+=dt;if(this.lightClock<=.05)return;this.lightClock=0;
    const direction=camera.getWorldDirection(new THREE.Vector3());direction.y=0;direction.normalize();
    const ahead=camera.position.clone().addScaledVector(direction,3);
    const predicted=camera.position.clone();if(!channel)predicted.add(new THREE.Vector3(game.playerVelocity.x*UNIT*.45,0,game.playerVelocity.z*UNIT*.45));
    const retained=new Set(this.lights.map(light=>light.userData.fixture));
    const visual=blackoutVisualLighting(game.blackout);
    const nearest=this.lampPositions.map((position,index)=>({position,index,distance:Math.min(position.distanceToSquared(camera.position),position.distanceToSquared(ahead)+3,position.distanceToSquared(predicted)+2)-(retained.has(index)?2:0)-(position.isCorner?4:0)})).filter(({position})=>position.securityRoom?channel===position.securityRoom&&visual.powerOn:this.blackoutView.allowedLamp(position,game)).sort((a,b)=>a.distance-b.distance).slice(0,this.lights.length);
    const wanted=new Set(nearest.map(lamp=>lamp.index)),used=new Set(this.lights.filter(light=>wanted.has(light.userData.fixture)).map(light=>light.userData.fixture));
    for(const light of this.lights){if(wanted.has(light.userData.fixture))continue;const lamp=nearest.find(lamp=>!used.has(lamp.index));if(!lamp){light.intensity=0;light.userData.fixture=-1;light.shadow.needsUpdate=false;continue;}used.add(lamp.index);light.userData.fixture=lamp.index;light.intensity=lamp.position.strength??(lamp.position.isCorner?14:10);light.distance=lamp.position.reach??6.2;light.angle=lamp.position.angle??Math.PI/3.1;light.penumbra=lamp.position.penumbra??.78;light.shadow.normalBias=lamp.position.normalBias??.025;light.color.setHex(lamp.position.warmth??0xffd29f);light.position.copy(lamp.position);light.target.position.copy(lamp.position);light.target.position.y=0;light.target.position.x+=lamp.position.aimX??0;light.target.position.z+=lamp.position.aimZ??0;light.shadow.needsUpdate=true;}
  }
  freezeStaticWorld(){
    const groups=[];this.scene.traverse(object=>{if(object.isGroup)groups.push(object);});
    for(const group of groups.reverse())if(!group.children.length)group.removeFromParent();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse(object=>{if(object.isMesh||object.isGroup){object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;}});
  }
  mesh(geo,mat,parent=this.scene){const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;parent.add(m);return m;}
  box(w,h,d,mat,x,y,z,parent=this.scene){
    const edge=Math.min(w,h,d),bevel=edge>=.02&&mat!==this.mat.black?Math.min(.006,edge*.12):0;
    const m=this.mesh(bevel?beveledBoxGeometry(w,h,d,bevel):new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;
  }
  buildMap(){
    const height=this.ceilingHeight;
    this.randomDoors=new THREE.Group();this.randomDoors.name='legacy-random-room-doors';
    const walls=[];MAP.forEach((row,z)=>[...row].forEach((c,x)=>{if(c==='#')walls.push({x,z});}));
    for(const [h,y,pad,mat] of [[height,height/2,0,this.mat.paper],[.94,.47,.018,this.mat.panel],[.055,.97,.04,this.mat.trim],[.12,.06,.04,this.mat.black],[.10,height-.06,.05,this.mat.trim],[.045,height-.15,.035,this.mat.trim]]){
      // Shadow the near face too: back-face-only depth can leak at wall/trim joins.
      mat.shadowSide=THREE.DoubleSide;
      const mesh=this.mesh(createWallShell(walls,UNIT,this.wallInset,h,y,pad,MAP_CENTER,transitionWalls(this.corridorWidth)),mat);mesh.castShadow=true;
    }
    const carpet=texture('carpet');carpet.repeat.set(MAP_WIDTH,MAP_HEIGHT);const floor=this.mesh(new THREE.PlaneGeometry(MAP_WIDTH*UNIT,MAP_HEIGHT*UNIT),new THREE.MeshStandardMaterial({map:carpet,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
    floor.material.envMapIntensity=.04;floor.material.color.setHex(0xb49ca7);
    this.assetJobs.push(applyHotelAsset(floor.material,'carpet',{repeat:[MAP_WIDTH*25/15,MAP_HEIGHT*25/15],bump:.0018}));
    const ceiling=this.mesh(createHallCeiling(this.hallDefinitions??[],{width:MAP_WIDTH,height:MAP_HEIGHT,unit:UNIT,corridorWidth:this.corridorWidth,ceilingHeight:height,center:MAP_CENTER}),this.mat.ceiling);ceiling.receiveShadow=true;ceiling.castShadow=true;this.mat.ceiling.shadowSide=THREE.DoubleSide;
    this.lampPositions=[];let doorNumber=201;const shadeMaterial=this.mat.cloth;
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#'||isInSafeRoom({x,z})||this.hallAt?.(x,z))return;
      const edges=[{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}].filter(d=>!isOpen(x+d.x,z+d.z));
      for(const d of edges){
        const hash=x*17+z*13+(d.x+1)*3+d.z;
        if(hash%7===0&&!(x===1&&z===1)){
          const g=new THREE.Group();g.position.copy(world(x+d.x*(.485-this.wallInset),z+d.z*(.485-this.wallInset)));g.rotation.y=d.a;this.randomDoors.add(g);
          createHotelDoor(this,g,doorNumber,{ajar:doorNumber%11===5});doorNumber++;

        } else if(edges.length!==2&&hash%4===0){
          // Occasional small sconces mark junctions; the narrow halls use ceiling bowls.
          const g=new THREE.Group();g.position.copy(world(x+d.x*(.485-this.wallInset),z+d.z*(.485-this.wallInset)));g.rotation.y=d.a;this.scene.add(g);this.box(.10,.28,.035,this.mat.brass,0,1.96,0,g);this.box(.025,.025,.14,this.mat.brass,0,1.92,.07,g);
          const shade=this.mesh(new THREE.CylinderGeometry(.065,.09,.19,12),shadeMaterial,g);shade.position.set(0,2.06,.145);
          const bulb=this.mesh(new THREE.SphereGeometry(.038,8,8),this.mat.glow,g);bulb.position.set(0,1.94,.145);g.updateMatrixWorld();
          const lamp=bulb.getWorldPosition(new THREE.Vector3());lamp.strength=5.5;lamp.reach=3.8;lamp.angle=.95;lamp.warmth=0xffe1ad;lamp.aimX=-d.x*.16;lamp.aimZ=-d.z*.16;this.lampPositions.push(lamp);
        }
      }
    }));
  }
  batchStaticMeshes(){
    this.batchAudit=batchStaticMeshes(this.scene);
  }
  finishLegacyDoors(){this.scene.add(this.randomDoors);batchStaticMeshes(this.randomDoors);this.randomDoors.updateMatrixWorld(true);this.randomDoors.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});}
  buildScare(){
    this.scareScene=new THREE.Scene();this.scareCamera=new THREE.PerspectiveCamera(42,this.camera.aspect,.02,8);
    this.scareFace=attendantHead(this.attendantMat);this.scareScene.add(this.scareFace);
    const coat=this.attendantMat.coat;
    const shoulders=this.mesh(new THREE.CylinderGeometry(.18,.43,.6,28),coat,this.scareFace);shoulders.position.set(0,-.56,-.10);
    for(const side of [-1,1]){const collar=this.box(.12,.20,.055,this.mat.black,side*.12,-.31,.04,this.scareFace);collar.rotation.z=side*.38;}
    for(const y of [-.46,-.61,-.76])this.box(.022,.022,.02,this.mat.brass,0,y,.21,this.scareFace);
    this.scareScene.add(new THREE.AmbientLight(0x8a6a70,.24));const red=new THREE.PointLight(0xff3527,.85,4,1);red.position.set(-.55,.3,-.10);this.scareScene.add(red);
    const cold=new THREE.PointLight(0xe4dece,2.1,3,1);cold.position.set(.62,.45,-.13);this.scareScene.add(cold);
  }
  drawScare(game,time){
    if(game.phase!=='caught')return;
    const t=RULES.caughtSeconds-game.caught;if(t<SCARE_TURN_SECONDS)return;
    this.scareCamera.aspect=this.camera.aspect;this.scareCamera.updateProjectionMatrix();
    const previous=this.scarePlacement;
    if(!previous||previous.game!==game||previous.deaths!==game.deaths||previous.aspect!==this.camera.aspect){
      const head=this.enemy.getObjectByName('attendant-head');
      const inverseHead=new THREE.Matrix4().copy(head.matrixWorld).invert(),points=[],worldBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
      // Bounding corners are sufficient here: both scenes use the same rigid head mesh.
      // Capture only the head, not the separately drawn scare shoulders.
      head.traverse(child=>{if(!child.isMesh)return;child.geometry.computeBoundingBox();const box=child.geometry.boundingBox;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const worldPoint=new THREE.Vector3(x,y,z).applyMatrix4(child.matrixWorld),projected=worldPoint.clone().project(this.camera);
          worldBounds.minX=Math.min(worldBounds.minX,projected.x);worldBounds.maxX=Math.max(worldBounds.maxX,projected.x);worldBounds.minY=Math.min(worldBounds.minY,projected.y);worldBounds.maxY=Math.max(worldBounds.maxY,projected.y);
          points.push(worldPoint.applyMatrix4(inverseHead));
        }
      });
      const rotation=this.camera.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()));
      const scale=head.getWorldScale(new THREE.Vector3()),tan=Math.tan(THREE.MathUtils.degToRad(this.scareCamera.fov/2)),aspect=this.camera.aspect;
      const centre={x:(worldBounds.minX+worldBounds.maxX)/2,y:(worldBounds.minY+worldBounds.maxY)/2};
      const height=Math.max(.4,Math.min(3.2,worldBounds.maxY-worldBounds.minY));
      const boundsAt=(position,q)=>{
        const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
        for(const local of points){const point=local.clone().multiply(scale).applyQuaternion(q).add(position).project(this.scareCamera);bounds.minX=Math.min(bounds.minX,point.x);bounds.maxX=Math.max(bounds.maxX,point.x);bounds.minY=Math.min(bounds.minY,point.y);bounds.maxY=Math.max(bounds.maxY,point.y);}
        return bounds;
      };
      const fit=(targetHeight,targetCentre,q,initialDistance)=>{
        // The FOV ratio gives the initial camera-space distance. Refine it against
        // the actual 3D head depth so the switch does not make the face shrink.
        let low=.34,high=Math.max(4,initialDistance*2),position=new THREE.Vector3(),bounds;
        for(let i=0;i<18;i++){
          const distance=i===0?Math.max(low,Math.min(high,initialDistance)):(low+high)/2;
          position.set(targetCentre.x*distance*tan*aspect,targetCentre.y*distance*tan,-distance);
          for(let j=0;j<3;j++){
            bounds=boundsAt(position,q);position.x+=(targetCentre.x-(bounds.minX+bounds.maxX)/2)*distance*tan*aspect;position.y+=(targetCentre.y-(bounds.minY+bounds.maxY)/2)*distance*tan;
          }
          bounds=boundsAt(position,q);if(bounds.maxY-bounds.minY>targetHeight)low=distance;else high=distance;
        }
        return {position:position.clone(),bounds};
      };
      const relative=head.getWorldPosition(new THREE.Vector3());this.camera.worldToLocal(relative);
      const fovRatio=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/tan;
      const start=fit(height,centre,rotation,Math.max(.4,-relative.z*fovRatio));
      const finish=fit(Math.max(height,Math.min(2.12,height*1.07)),{x:0,y:.02},new THREE.Quaternion(),-start.position.z);
      this.scarePlacement={game,deaths:game.deaths,aspect,fov:this.camera.fov,start:start.position,finish:finish.position,rotation,scale,worldBounds,startBounds:start.bounds,endBounds:finish.bounds};
    }
    const placement=this.scarePlacement,p=Math.min(1,(t-SCARE_TURN_SECONDS)/.22),ease=this.motionEnabled?1-(1-p)**3:0;
    this.scareFace.position.copy(placement.start).lerp(placement.finish,ease);
    this.scareFace.quaternion.copy(placement.rotation).slerp(new THREE.Quaternion(),ease);
    // The lunge begins at the captured apparent size. Only the short final motion shakes.
    if(this.motionEnabled){
      this.scareFace.position.x+=Math.sin(time*39)*.006*ease;
      this.scareFace.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(time*31)*.025*ease,Math.sin(time*26)*.035*ease,Math.sin(time*33)*.025*ease)));
    }
    this.scareFace.scale.copy(placement.scale);
    this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.scareScene,this.scareCamera);this.renderer.autoClear=true;
  }
  buildShards(){
    this.shardMesh=new THREE.InstancedMesh(crystalGeometry(),createCrystalMaterial(),SHARDS.length);
    this.shardMesh.receiveShadow=true;
    this.shardGlow=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.60),new THREE.MeshBasicMaterial({map:glowTexture(),color:0xa87ac6,transparent:true,opacity:.10,depthWrite:false,blending:THREE.AdditiveBlending}),SHARDS.length);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shardGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.shardMesh,this.shardGlow);this.shardFade=new Float32Array(SHARDS.length).fill(1);this.dummy=new THREE.Object3D();
  }
  buildExit(){
    const height=Math.min(2.3,this.ceilingHeight-.4);
    const exitFace=[{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0},{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2}].find(face=>!isOpen(EXIT.x+face.x,EXIT.z+face.z));
    this.exit=new THREE.Group();this.exit.position.copy(world(EXIT.x+exitFace.x*(.5-this.wallInset),EXIT.z+exitFace.z*(.5-this.wallInset)));this.exit.rotation.y=exitFace.a;this.scene.add(this.exit);
    for(const side of [-.7,.7])this.box(.12,height,.2,this.mat.brass,side,height/2,0,this.exit);this.box(1.52,.12,.2,this.mat.brass,0,height,0,this.exit);
    this.exitMaterial=new THREE.MeshBasicMaterial({color:0x9470c2,transparent:true,opacity:.12,side:THREE.DoubleSide});const field=this.mesh(new THREE.PlaneGeometry(1.25,height-.10),this.exitMaterial,this.exit);field.position.y=height/2;
    this.exitRing=this.mesh(new THREE.TorusGeometry(.48,.025,8,64),new THREE.MeshBasicMaterial({color:0xb18fd3}),this.exit);this.exitRing.position.set(0,1.2,.08);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#121416';x.fillRect(0,0,512,128);x.fillStyle='#b9d1bd';x.font='bold 44px Microsoft YaHei';x.textAlign='center';x.fillText('出口 / EXIT',256,82);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(1.3,.24),new THREE.MeshBasicMaterial({map:t}),this.exit);sign.position.set(0,height+.19,.06);
  }
  buildEnemy(){
    this.attendantMat=attendantMaterials();const model=createAttendant(this.attendantMat);
    this.enemy=model.root;this.enemyBody=model.body;this.enemyLimbs=model.limbs;this.scene.add(this.enemy);
    this.warningLight=new THREE.SpotLight(0xff0820,110,12,Math.PI/5.2,.3,1.2);this.warningLight.castShadow=true;this.warningLight.shadow.mapSize.set(1024,1024);this.warningLight.shadow.camera.near=.03;this.warningLight.shadow.bias=-.00005;this.warningLight.shadow.normalBias=.003;this.warningLight.shadow.autoUpdate=false;this.warningShadowPose={x:Infinity,z:Infinity,heading:Infinity};this.scene.add(this.warningLight,this.warningLight.target);
  }
  render(game,yaw,pitch,time,dt=1/60,active=true,motionScale=1){
    if(this.security.active&&(!game.blackout||!active||game.phase!=='playing'))this.setSecurityMonitor(false);
    if(this.randomDoors)this.randomDoors.visible=!game.blackout;
    if(this.lastGame!==game){this.lastGame=game;this.shardFade.fill(1);this.enemyHeading=-Math.PI/2;this.playerMotion.reset();this.lastViewYaw=null;this.bedEyeHeight=this.eyeHeight;}
    if(!game.blackout)this.safeRoom.update(game,dt);
    const speed=Math.hypot(game.playerVelocity.x,game.playerVelocity.z);
    const turnRate=angularTurnRate(this.lastViewYaw,yaw,dt);this.lastViewYaw=active&&game.phase==='playing'?yaw:null;
    const underBed=Boolean(game.blackout?.bedHide),motion=this.playerMotion.update(underBed?0:speed,dt,this.motionTuning,{active:active&&game.phase==='playing',motion:this.motionEnabled&&!this.reducedMotion.matches,scale:underBed?0:motionScale,turnRate});this.updateFov();
    if(game.phase!=='caught')this.bedEyeHeight=bedViewHeight(game.blackout,this.eyeHeight);
    this.camera.position.copy(world(game.player.x,game.player.z,(this.bedEyeHeight??this.eyeHeight)+motion.bob));this.camera.position.x+=Math.cos(yaw)*motion.sway;this.camera.position.z-=Math.sin(yaw)*motion.sway;this.camera.rotation.set(pitch+motion.pitch,yaw,0,'YXZ');this.cameraLight.position.copy(this.camera.position);
    this.blackoutView.update(game,dt);
    this.securityRooms?.update(game,dt);
    const es=Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z);if(active&&game.phase==='playing'){this.enemyPhase+=es*UNIT*dt*Math.PI/1.65;if(es>.01||game.blackout){const target=game.blackout?.enemyHeading??Math.atan2(game.enemyVelocity.x,game.enemyVelocity.z),delta=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading));this.enemyHeading+=delta*(1-Math.exp(-dt*(es>.01?15:4)));}}
    if(game.phase==='caught'){
      const target=Math.atan2(game.player.x-game.enemy.x,game.player.z-game.enemy.z);
      this.enemyHeading+=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading))*(1-Math.exp(-dt*22));
    }
    this.enemy.visible=Boolean(game.blackout||game.entryOpened)&&(game.phase!=='caught'||RULES.caughtSeconds-game.caught<SCARE_TURN_SECONDS);
    this.enemy.position.copy(world(game.enemy.x,game.enemy.z));this.enemy.rotation.y=this.enemyHeading;this.enemyBody.position.y=Math.abs(Math.sin(this.enemyPhase))*.018;this.enemyBody.rotation.x=.055;this.enemyBody.rotation.z=Math.sin(this.enemyPhase)*.012;this.enemyLimbs.forEach(({node,elbow,side,leg})=>{node.rotation.x=Math.sin(this.enemyPhase)*side*(leg?.42:-.28);if(elbow)elbow.rotation.x=-.28+Math.sin(this.enemyPhase)*side*.10;});
    const friendly=Boolean(this.motionTuning.friendlyMode),warning=active&&game.phase==='playing'&&!blackoutVisualLighting(game.blackout).blackout&&(friendly||!game.blackout&&game.entryOpened&&!isInSafeRoom(game.player));
    updateEnemyWarning(this.warningLight,this.warningShadowPose,{x:this.enemy.position.x,z:this.enemy.position.z,heading:this.enemyHeading,enabled:warning,friendly,doorProgress:game.blackout?.doorProgress??game.entryBreakTime??0,roomDoors:game.blackout?.roomDoors});
    if(!game.blackout){SHARDS.forEach((p,i)=>{if(this.shardFade[i]===0)return;const fade=this.shardFade[i]=Math.max(0,this.shardFade[i]-(game.collected.has(i)?dt*6:0));const dummy=this.dummy;dummy.position.copy(world(p.x,p.z,.87+Math.sin(time*2+i)*.035+(1-fade)*.2));dummy.rotation.set(0,time*.9+i*.4,0);dummy.scale.setScalar(fade);dummy.updateMatrix();this.shardMesh.setMatrixAt(i,dummy.matrix);dummy.quaternion.copy(this.camera.quaternion);dummy.updateMatrix();this.shardGlow.setMatrixAt(i,dummy.matrix);});this.shardMesh.instanceMatrix.needsUpdate=true;this.shardGlow.instanceMatrix.needsUpdate=true;}
    const unlocked=game.collected.size===SHARDS.length;this.exitMaterial.color.setHex(unlocked?0x74f2b8:0x9470c2);this.exitMaterial.opacity=unlocked?.27+Math.sin(time*3)*.05:.08;this.exitRing.material.color.setHex(unlocked?0x9bffcc:0x5a3d72);this.exitRing.rotation.z=time*(unlocked?.6:.06);
    if(active)this.blackoutView.controlRoom?.updateFeeds(game,dt);
    const renderCamera=this.security.active?this.security.camera:this.camera;
    this.updateLampPool(game,dt,renderCamera,this.security.active?this.security.selected.id:null);
    this.lights.forEach((light,i)=>{const dummy=this.dummy;dummy.position.copy(light.position);dummy.position.y+=.08;dummy.quaternion.copy(renderCamera.quaternion);dummy.scale.setScalar(light.visible&&light.intensity>6?.72:0);dummy.updateMatrix();this.lampHalos.setMatrixAt(i,dummy.matrix);});this.lampHalos.instanceMatrix.needsUpdate=true;
    if(this.security.active){const visual=blackoutVisualLighting(game.blackout);if(this.security.shouldRender(dt,visual.powerOn))this.security.draw(this.scene,{powerOn:visual.powerOn,baseExposure:.96*this.motionTuning.brightness,contactStrength:this.motionTuning.contactShadows??.85});}
    else{this.film.render(this.scene,this.camera,()=>this.drawScare(game,time),game.phase==='caught'?0:this.motionTuning.contactShadows??.85,{mosaic:friendly&&game.phase==='caught'});if(active&&game.phase==='playing'&&this.motionTuning.enemyXray)this.enemyXray?.draw(this.renderer,this.camera,this.enemy);}
  }
}
