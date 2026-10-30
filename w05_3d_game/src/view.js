import {DEFAULT_TUNING} from './tuning.js';
import * as THREE from '../vendor/three.module.js';
import { MAP, SHARDS, EXIT, ENEMY_START, isOpen, RULES,CELL_SIZE,wallInset } from './world.js';
import {decorateHotel} from './hotel-detail.js';
import {hotelTexture as texture,makeHotelMaterials} from './hotel-materials.js';
import {SCARE_TURN_SECONDS,renderPixelRatio,angularTurnRate} from './presentation.js';
import {PlayerMotion} from './player-motion.js';
import {applyHotelAsset} from './hotel-assets.js';
import {crystalGeometry} from './crystal.js';
import {attendantMaterials,attendantHead,createAttendant} from './enemy-model.js';
export const UNIT = CELL_SIZE;
const world = (x,z,y=0) => new THREE.Vector3((x-7)*UNIT,y,(z-7)*UNIT);
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,1,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.15,'#d99cffbb');g.addColorStop(.5,'#8c3cbd30');g.addColorStop(1,'#0000');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
export class WorldView {
  constructor(container,tuning=DEFAULT_TUNING){
    this.disposed=false;
    this.corridorWidth=tuning.corridorWidth??DEFAULT_TUNING.corridorWidth;this.wallInset=wallInset(this.corridorWidth);this.eyeHeight=tuning.eyeHeight??DEFAULT_TUNING.eyeHeight;
    this.ceilingHeight=tuning.ceilingHeight??DEFAULT_TUNING.ceilingHeight;
    this.horizontalFov=DEFAULT_TUNING.fov;this.motionTuning={...DEFAULT_TUNING,...tuning};this.playerMotion=new PlayerMotion();this.enemyPhase=0;this.enemyHeading=-Math.PI/2;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');this.motionEnabled=!this.reducedMotion.matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0d0b11');this.scene.fog=new THREE.Fog('#0d0b11',10,28);
    this.camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.045,70);this.camera.rotation.order='YXZ';
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.672;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;
    this.scene.add(new THREE.HemisphereLight(0xd5d2ba,0x55505a,.52));
    this.scene.add(new THREE.AmbientLight(0xadb1b2,.07));
    // Preserve the outline of nearby walls without making the whole corridor bright.
    this.cameraLight=new THREE.PointLight(0xbcc1bb,.30,3.5,2);this.scene.add(this.cameraLight);
    this.assetJobs=[];this.mat=makeHotelMaterials(this.assetJobs);this.detailAudit={crookedPictures:0,ajarDoors:0,luggage:0,maxPropProjection:0};
    this.buildMap();decorateHotel(this,world,UNIT);this.batchStaticMeshes();this.freezeStaticWorld();this.buildShards();this.buildExit();this.buildEnemy();this.buildScare();
    // Static shadow maps update only when a pool slot moves to another real fixture.
    // Downward cones keep the warm light local and prevent light leaking through walls.
    this.lights=Array.from({length:10},()=>{const light=new THREE.SpotLight(0xffd29f,10,6.2,Math.PI/3.1,.78,2);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.06;light.shadow.bias=-.00015;light.shadow.normalBias=.025;light.shadow.autoUpdate=false;light.userData.fixture=-1;this.scene.add(light,light.target);return light;});this.lightClock=1;
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.updateFov();this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);this.updateFov();
    this.ready=Promise.all(this.assetJobs).then(results=>{this.assetAudit=results;if(this.disposed)return;return Promise.all([this.renderer.compileAsync(this.scene,this.camera),this.renderer.compileAsync(this.scareScene,this.scareCamera)]);}).catch(()=>{});
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    window.removeEventListener('resize',this.resize);
    const geometries=new Set(),materials=new Set(),textures=new Set();
    for(const scene of [this.scene,this.scareScene])scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.material)for(const material of [object.material].flat())materials.add(material);
      object.shadow?.map?.dispose();
    });
    for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
    for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();
    this.renderer.dispose();this.renderer.domElement.remove();
  }
  updateFov(){const next=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov+this.playerMotion.fov)/2)/Math.max(1.6,this.camera.aspect)));if(Math.abs(next-this.camera.fov)>1e-7||this.projectionAspect!==this.camera.aspect){this.camera.fov=next;this.projectionAspect=this.camera.aspect;this.camera.updateProjectionMatrix();}}
  freezeStaticWorld(){
    const groups=[];this.scene.traverse(object=>{if(object.isGroup)groups.push(object);});
    for(const group of groups.reverse())if(!group.children.length)group.removeFromParent();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse(object=>{if(object.isMesh||object.isGroup){object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;}});
  }
  mesh(geo,mat,parent=this.scene){const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;parent.add(m);return m;}
  box(w,h,d,mat,x,y,z,parent=this.scene){const m=this.mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
  buildMap(){
    const height=this.ceilingHeight;
    const walls=[];MAP.forEach((row,z)=>[...row].forEach((c,x)=>{if(c==='#')walls.push({x,z});}));const dummy=new THREE.Object3D();
    for(const [h,y,pad,mat] of [[height,height/2,0,this.mat.paper],[.94,.47,.018,this.mat.panel],[.055,.97,.04,this.mat.trim],[.12,.06,.04,this.mat.black],[.10,height-.06,.05,this.mat.trim],[.045,height-.15,.035,this.mat.trim]]){
      // Shadow the near face too: back-face-only depth can leak at wall/trim joins.
      mat.shadowSide=THREE.DoubleSide;
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(UNIT+pad+2*this.wallInset*UNIT,h,UNIT+pad+2*this.wallInset*UNIT),mat,walls.length);mesh.castShadow=true;mesh.receiveShadow=true;walls.forEach((p,i)=>{dummy.position.copy(world(p.x,p.z,y));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.scene.add(mesh);
    }
    const carpet=texture('carpet');carpet.repeat.set(15,15);const floor=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),new THREE.MeshStandardMaterial({map:carpet,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
    this.assetJobs.push(applyHotelAsset(floor.material,'carpet',{repeat:[15,15],bump:.003}));
    const ceiling=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),this.mat.ceiling);ceiling.rotation.x=Math.PI/2;ceiling.position.y=height;ceiling.receiveShadow=true;
    this.lampPositions=[];let doorNumber=201;const shadeMaterial=this.mat.cloth;
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#')return;
      const edges=[{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}].filter(d=>!isOpen(x+d.x,z+d.z));
      for(const d of edges){
        const hash=x*17+z*13+(d.x+1)*3+d.z;
        if(hash%7===0&&!(x===1&&z===1)){
          const g=new THREE.Group();g.position.copy(world(x+d.x*(.485-this.wallInset),z+d.z*(.485-this.wallInset)));g.rotation.y=d.a;this.scene.add(g);
          // The dark backing and projecting jamb make the leaf sit inside a deep frame.
          this.box(1.13,2.30,.018,this.mat.black,0,1.15,.002,g);
          const hinge=new THREE.Group();hinge.position.set(-.455,1.075,.036);g.add(hinge);
          const ajar=doorNumber%11===5;if(ajar){hinge.rotation.y=-.11;this.detailAudit.ajarDoors++;}
          const leaf=this.box(.91,2.13,.04,this.mat.wood,.455,0,.01,hinge);leaf.castShadow=true;
          for(const side of [-.55,.55]){const jamb=this.box(.085,2.34,.16,this.mat.wood,side,1.17,.068,g);jamb.castShadow=true;}
          const lintel=this.box(1.18,.10,.16,this.mat.wood,0,2.34,.068,g);lintel.castShadow=true;
          for(const yy of [-.54,.43])this.box(.66,.69,.014,this.mat.black,.455,yy,.034,hinge);
          this.box(.12,.035,.055,this.mat.brass,.75,-.055,.065,hinge);
          const c=document.createElement('canvas');c.width=128;c.height=64;const cx=c.getContext('2d');cx.fillStyle='#302923';cx.fillRect(0,0,128,64);cx.strokeStyle='#74664d';cx.strokeRect(3,3,122,58);cx.fillStyle='#c1ae8d';cx.font='28px Georgia';cx.textAlign='center';cx.fillText(String(doorNumber++),64,42);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(.23,.115),new THREE.MeshStandardMaterial({map:t,roughness:.72,metalness:.15}),hinge);sign.position.set(.455,.66,.038);

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
    this.scene.updateMatrixWorld(true);const batches=new Map();
    this.scene.traverse(m=>{if(!m.isMesh||m.isInstancedMesh||Array.isArray(m.material))return;
      const k=m.geometry.type+JSON.stringify(m.geometry.parameters)+m.material.uuid+String(m.castShadow)+String(m.receiveShadow);
      if(!batches.has(k))batches.set(k,[]);batches.get(k).push(m);
    });
    for(const items of batches.values()){
      if(items.length<2)continue;const first=items[0],batch=new THREE.InstancedMesh(first.geometry,first.material,items.length);
      batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
      items.forEach((m,i)=>{batch.setMatrixAt(i,m.matrixWorld);m.removeFromParent();});batch.computeBoundingSphere();this.scene.add(batch);
    }
  }
  buildScare(){
    this.scareScene=new THREE.Scene();this.scareCamera=new THREE.PerspectiveCamera(42,this.camera.aspect,.02,8);
    this.scareFace=attendantHead(this.attendantMat);this.scareScene.add(this.scareFace);
    const coat=this.attendantMat.coat;
    const shoulders=this.mesh(new THREE.CylinderGeometry(.18,.43,.6,28),coat,this.scareFace);shoulders.position.set(0,-.56,-.10);
    for(const side of [-1,1]){const collar=this.box(.12,.20,.055,this.mat.black,side*.12,-.31,.04,this.scareFace);collar.rotation.z=side*.38;}
    for(const y of [-.46,-.61,-.76])this.box(.022,.022,.02,this.mat.brass,0,y,.21,this.scareFace);
    this.scareScene.add(new THREE.AmbientLight(0x8a6a70,.7));const red=new THREE.PointLight(0xff3527,2.2,4,1);red.position.set(-.3,.2,.15);this.scareScene.add(red);
    const cold=new THREE.PointLight(0xd5c8ae,1.3,3,1);cold.position.set(.4,.3,.1);this.scareScene.add(cold);
  }
  drawScare(game,time){
    if(game.phase!=='caught')return;
    const t=RULES.caughtSeconds-game.caught;if(t<SCARE_TURN_SECONDS)return;
    const p=Math.min(1,(t-SCARE_TURN_SECONDS)/.22),ease=1-(1-p)**3;
    this.scareCamera.aspect=this.camera.aspect;this.scareCamera.updateProjectionMatrix();
    this.scareFace.position.set(Math.sin(time*39)*(this.motionEnabled?.012:0),-.015,-2.2+ease*1.16);
    this.scareFace.rotation.set(this.motionEnabled?Math.sin(time*31)*.045:0,this.motionEnabled?Math.sin(time*26)*.065:0,this.motionEnabled?Math.sin(time*33)*.045:0);
    this.scareFace.scale.setScalar(1+ease*.18);
    this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.scareScene,this.scareCamera);this.renderer.autoClear=true;
  }
  buildShards(){
    this.shardMesh=new THREE.InstancedMesh(crystalGeometry(),new THREE.MeshPhysicalMaterial({color:0xb18adb,vertexColors:true,emissive:0x632b91,emissiveIntensity:.32,metalness:.12,roughness:.20,clearcoat:.85,clearcoatRoughness:.12}),SHARDS.length);
    this.shardMesh.receiveShadow=true;
    this.shardGlow=new THREE.InstancedMesh(new THREE.PlaneGeometry(.34,.60),new THREE.MeshBasicMaterial({map:glowTexture(),color:0xa87ac6,transparent:true,opacity:.20,depthWrite:false,blending:THREE.AdditiveBlending}),SHARDS.length);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shardGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.shardMesh,this.shardGlow);this.shardFade=new Float32Array(SHARDS.length).fill(1);this.dummy=new THREE.Object3D();
  }
  buildExit(){
    const height=Math.min(2.3,this.ceilingHeight-.4);
    this.exit=new THREE.Group();this.exit.position.copy(world(.53+this.wallInset,EXIT.z));this.exit.rotation.y=Math.PI/2;this.scene.add(this.exit);
    for(const side of [-.7,.7])this.box(.12,height,.2,this.mat.brass,side,height/2,0,this.exit);this.box(1.52,.12,.2,this.mat.brass,0,height,0,this.exit);
    this.exitMaterial=new THREE.MeshBasicMaterial({color:0x9470c2,transparent:true,opacity:.12,side:THREE.DoubleSide});const field=this.mesh(new THREE.PlaneGeometry(1.25,height-.10),this.exitMaterial,this.exit);field.position.y=height/2;
    this.exitRing=this.mesh(new THREE.TorusGeometry(.48,.025,8,64),new THREE.MeshBasicMaterial({color:0xb18fd3}),this.exit);this.exitRing.position.set(0,1.2,.08);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#121416';x.fillRect(0,0,512,128);x.fillStyle='#b9d1bd';x.font='bold 44px Microsoft YaHei';x.textAlign='center';x.fillText('大堂 / LOBBY',256,82);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(1.3,.24),new THREE.MeshBasicMaterial({map:t}),this.exit);sign.position.set(0,height+.19,.06);
  }
  buildEnemy(){
    this.attendantMat=attendantMaterials();const model=createAttendant(this.attendantMat);
    this.enemy=model.root;this.enemyBody=model.body;this.enemyLimbs=model.limbs;this.scene.add(this.enemy);
    this.warningLight=new THREE.SpotLight(0xff0820,110,12,Math.PI/5.2,.3,1.2);this.warningLight.castShadow=true;this.warningLight.shadow.mapSize.set(1024,1024);this.warningLight.shadow.camera.near=.03;this.warningLight.shadow.bias=-.00005;this.warningLight.shadow.normalBias=.003;this.warningLight.shadow.autoUpdate=false;this.warningShadowPose={x:Infinity,z:Infinity,heading:Infinity};this.scene.add(this.warningLight,this.warningLight.target);
  }
  render(game,yaw,pitch,time,dt=1/60,active=true,motionScale=1){
    if(this.lastGame!==game){this.lastGame=game;this.shardFade.fill(1);this.enemyHeading=-Math.PI/2;this.playerMotion.reset();this.lastViewYaw=null;}
    const speed=Math.hypot(game.playerVelocity.x,game.playerVelocity.z);
    const turnRate=angularTurnRate(this.lastViewYaw,yaw,dt);this.lastViewYaw=active&&game.phase==='playing'?yaw:null;
    const motion=this.playerMotion.update(speed,dt,this.motionTuning,{active:active&&game.phase==='playing',motion:this.motionEnabled&&!this.reducedMotion.matches,scale:motionScale,turnRate});this.updateFov();
    this.camera.position.copy(world(game.player.x,game.player.z,this.eyeHeight+motion.bob));this.camera.position.x+=Math.cos(yaw)*motion.sway;this.camera.position.z-=Math.sin(yaw)*motion.sway;this.camera.rotation.set(pitch+motion.pitch,yaw,0,'YXZ');this.cameraLight.position.copy(this.camera.position);
    const es=Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z);if(active&&game.phase==='playing'){this.enemyPhase+=es*UNIT*dt*Math.PI/1.65;if(es>.01){const target=Math.atan2(game.enemyVelocity.x,game.enemyVelocity.z),delta=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading));this.enemyHeading+=delta*(1-Math.exp(-dt*15));}}
    if(game.phase==='caught'){
      const target=Math.atan2(game.player.x-game.enemy.x,game.player.z-game.enemy.z);
      this.enemyHeading+=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading))*(1-Math.exp(-dt*22));
    }
    this.enemy.visible=game.phase!=='caught'||RULES.caughtSeconds-game.caught<SCARE_TURN_SECONDS;
    this.enemy.position.copy(world(game.enemy.x,game.enemy.z));this.enemy.rotation.y=this.enemyHeading;this.enemyBody.position.y=Math.abs(Math.sin(this.enemyPhase))*.018;this.enemyBody.rotation.x=.055;this.enemyBody.rotation.z=Math.sin(this.enemyPhase)*.012;this.enemyLimbs.forEach(({node,elbow,side,leg})=>{node.rotation.x=Math.sin(this.enemyPhase)*side*(leg?.42:-.28);if(elbow)elbow.rotation.x=-.28+Math.sin(this.enemyPhase)*side*.10;});
    this.warningLight.position.copy(world(game.enemy.x,game.enemy.z,1.05));this.warningLight.target.position.copy(this.warningLight.position).add(new THREE.Vector3(Math.sin(this.enemyHeading)*5,-1.02,Math.cos(this.enemyHeading)*5));this.warningLight.intensity=game.phase==='playing'?110:0;
    if(game.phase==='playing'&&(Math.abs(game.enemy.x-this.warningShadowPose.x)>1e-6||Math.abs(game.enemy.z-this.warningShadowPose.z)>1e-6||Math.abs(this.enemyHeading-this.warningShadowPose.heading)>1e-6)){
      this.warningLight.shadow.needsUpdate=true;Object.assign(this.warningShadowPose,{x:game.enemy.x,z:game.enemy.z,heading:this.enemyHeading});
    }
    SHARDS.forEach((p,i)=>{if(this.shardFade[i]===0)return;const fade=this.shardFade[i]=Math.max(0,this.shardFade[i]-(game.collected.has(i)?dt*6:0));const dummy=this.dummy;dummy.position.set((p.x-7)*UNIT,.87+Math.sin(time*2+i)*.035+(1-fade)*.2,(p.z-7)*UNIT);dummy.rotation.set(0,time*.9+i*.4,0);dummy.scale.setScalar(fade);dummy.updateMatrix();this.shardMesh.setMatrixAt(i,dummy.matrix);dummy.quaternion.copy(this.camera.quaternion);dummy.updateMatrix();this.shardGlow.setMatrixAt(i,dummy.matrix);});this.shardMesh.instanceMatrix.needsUpdate=true;this.shardGlow.instanceMatrix.needsUpdate=true;
    const unlocked=game.collected.size===SHARDS.length;this.exitMaterial.color.setHex(unlocked?0x74f2b8:0x9470c2);this.exitMaterial.opacity=unlocked?.27+Math.sin(time*3)*.05:.08;this.exitRing.material.color.setHex(unlocked?0x9bffcc:0x5a3d72);this.exitRing.rotation.z=time*(unlocked?.6:.06);
    this.lightClock+=dt;if(this.lightClock>.05){this.lightClock=0;
      // Prelight the view ahead (~half a second of running), not just the closest bulbs.
      // Existing slots receive a small hysteresis bonus so walking near a tie cannot flicker.
      const ahead=this.camera.position.clone().add(new THREE.Vector3(-Math.sin(yaw)*3,0,-Math.cos(yaw)*3));
      const predicted=this.camera.position.clone().add(new THREE.Vector3(game.playerVelocity.x*UNIT*.45,0,game.playerVelocity.z*UNIT*.45));
      const retained=new Set(this.lights.map(light=>light.userData.fixture));
      const nearest=this.lampPositions.map((position,index)=>({position,index,distance:Math.min(position.distanceToSquared(this.camera.position),position.distanceToSquared(ahead)+3,position.distanceToSquared(predicted)+2)-(retained.has(index)?2:0)-(position.isCorner?4:0)})).sort((a,b)=>a.distance-b.distance).slice(0,this.lights.length);
      const wanted=new Set(nearest.map(lamp=>lamp.index)),used=new Set(this.lights.filter(light=>wanted.has(light.userData.fixture)).map(light=>light.userData.fixture));
      for(const light of this.lights){if(wanted.has(light.userData.fixture))continue;const lamp=nearest.find(lamp=>!used.has(lamp.index));if(!lamp){light.visible=false;continue;}used.add(lamp.index);light.visible=true;light.userData.fixture=lamp.index;light.intensity=lamp.position.strength??(lamp.position.isCorner?14:10);light.distance=lamp.position.reach??6.2;light.angle=lamp.position.angle??Math.PI/3.1;light.color.setHex(lamp.position.warmth??0xffd29f);light.position.copy(lamp.position);light.target.position.copy(lamp.position);light.target.position.y=0;light.target.position.x+=lamp.position.aimX??0;light.target.position.z+=lamp.position.aimZ??0;light.shadow.needsUpdate=true;}
    }
    this.renderer.render(this.scene,this.camera);this.drawScare(game,time);
  }
}
