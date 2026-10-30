import {DEFAULT_TUNING} from './tuning.js';
import * as THREE from '../vendor/three.module.js';
import { MAP, SHARDS, EXIT, ENEMY_START, isOpen, RULES,CELL_SIZE,wallInset } from './world.js';
import {decorateHotel} from './hotel-detail.js';
import {hotelTexture as texture,makeHotelMaterials} from './hotel-materials.js';
import {SCARE_TURN_SECONDS} from './presentation.js';
export const UNIT = CELL_SIZE;
const world = (x,z,y=0) => new THREE.Vector3((x-7)*UNIT,y,(z-7)*UNIT);
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,1,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.15,'#d99cffbb');g.addColorStop(.5,'#8c3cbd30');g.addColorStop(1,'#0000');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
// One original porcelain mask is used both in the corridor and in the contact animation.
function makeMask(){
  const group=new THREE.Group(),ivory=new THREE.MeshStandardMaterial({color:0xc8b49b,roughness:.52}),black=new THREE.MeshStandardMaterial({color:0x080609,roughness:1});
  const add=(geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);group.add(m);return m;};
  add(new THREE.SphereGeometry(.255,20,16),black,0,0,-.13,.99,1.27,.84);
  add(new THREE.SphereGeometry(.22,24,18),ivory,0,0,0,.91,1.23,.81);
  for(const side of [-1,1]){
    const eye=add(new THREE.SphereGeometry(.061,12,10),black,side*.078,.058,.155,1.08,.77,.4);eye.rotation.z=side*-.22;
    add(new THREE.SphereGeometry(.020,10,8),new THREE.MeshBasicMaterial({color:0xff1829,toneMapped:false}),side*.078,.055,.185,.63,1.1,.6);
    const brow=add(new THREE.SphereGeometry(.065,12,10),ivory,side*.081,.108,.15,1,.3,.43);brow.rotation.z=side*.31;
    const crack=add(new THREE.BoxGeometry(.008,.12,.006),black,side*.137,-.004,.13);crack.rotation.z=side*.43;
  }
  const nose=add(new THREE.ConeGeometry(.027,.067,4),ivory,0,-.006,.178);nose.rotation.x=Math.PI/2;
  const mouth=add(new THREE.SphereGeometry(.095,16,12),black,0,-.104,.149,.95,1.12,.32);group.userData.mouth=mouth;
  for(let i=0;i<7;i++)for(const side of [-1,1]){
    const tooth=add(new THREE.ConeGeometry(.011,.049,4),ivory,(i-3)*.023,-.104+side*.065,.181);if(side===1)tooth.rotation.z=Math.PI;
  }
  return group;
}
export class WorldView {
  constructor(container,tuning=DEFAULT_TUNING){
    this.corridorWidth=tuning.corridorWidth??DEFAULT_TUNING.corridorWidth;this.wallInset=wallInset(this.corridorWidth);this.eyeHeight=tuning.eyeHeight??DEFAULT_TUNING.eyeHeight;
    this.horizontalFov=DEFAULT_TUNING.fov;this.runBobStrength=DEFAULT_TUNING.runBob;this.walkBobStrength=DEFAULT_TUNING.walkBob;this.runBlend=0;this.bobBlend=0;this.stepPhase=0;this.enemyPhase=0;this.enemyHeading=-Math.PI/2;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');this.motionEnabled=!this.reducedMotion.matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0d0b11');this.scene.fog=new THREE.Fog('#0d0b11',10,28);
    this.camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.045,70);this.camera.rotation.order='YXZ';
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.672;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;
    this.scene.add(new THREE.HemisphereLight(0xd3c4ce,0x85717a,.58));
    this.scene.add(new THREE.AmbientLight(0xb5a5b7,.07));
    // Preserve the outline of nearby walls without making the whole corridor bright.
    this.cameraLight=new THREE.PointLight(0xbcb0c5,.40,3.8,2);this.scene.add(this.cameraLight);
    this.mat=makeHotelMaterials();this.detailAudit={crookedPictures:0,ajarDoors:0,luggage:0,maxPropProjection:0};
    this.buildMap();decorateHotel(this,world,UNIT);this.batchStaticMeshes();this.buildShards();this.buildExit();this.buildEnemy();this.buildScare();
    // Static shadow maps update only when a pool slot moves to another real fixture.
    // Downward cones keep the warm light local and prevent light leaking through walls.
    this.lights=Array.from({length:10},()=>{const light=new THREE.SpotLight(0xffd29f,10,6.2,Math.PI/3.1,.78,2);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.06;light.shadow.bias=-.00015;light.shadow.normalBias=.025;light.shadow.autoUpdate=false;light.userData.fixture=-1;this.scene.add(light,light.target);return light;});this.lightClock=1;
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.updateFov();this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);this.updateFov();
    this.ready=Promise.all([this.renderer.compileAsync(this.scene,this.camera),this.renderer.compileAsync(this.scareScene,this.scareCamera)]).catch(()=>{});
  }
  dispose(){
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
  updateFov(){this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov+this.runBlend*3)/2)/Math.max(1.6,this.camera.aspect)));this.camera.updateProjectionMatrix();}
  mesh(geo,mat,parent=this.scene){const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;parent.add(m);return m;}
  box(w,h,d,mat,x,y,z,parent=this.scene){const m=this.mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
  buildMap(){
    const walls=[];MAP.forEach((row,z)=>[...row].forEach((c,x)=>{if(c==='#')walls.push({x,z});}));const dummy=new THREE.Object3D();
    for(const [h,y,pad,mat] of [[3.1,1.55,0,this.mat.paper],[1,.5,.018,this.mat.wood],[.055,1.03,.04,this.mat.wood],[.15,.075,.04,this.mat.black],[.07,2.96,.05,this.mat.wood],[.07,2.84,.035,this.mat.wood]]){
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(UNIT+pad+2*this.wallInset*UNIT,h,UNIT+pad+2*this.wallInset*UNIT),mat,walls.length);mesh.castShadow=true;mesh.receiveShadow=true;walls.forEach((p,i)=>{dummy.position.copy(world(p.x,p.z,y));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.scene.add(mesh);
    }
    const carpet=texture('carpet');carpet.repeat.set(15,15);const floor=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),new THREE.MeshStandardMaterial({map:carpet,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
    const ceiling=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),new THREE.MeshStandardMaterial({color:0x6c5b50,roughness:1,side:THREE.DoubleSide}));ceiling.rotation.x=Math.PI/2;ceiling.position.y=3.1;ceiling.receiveShadow=true;
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

        } else if(hash%4===0){
          const g=new THREE.Group();g.position.copy(world(x+d.x*(.46-this.wallInset),z+d.z*(.46-this.wallInset)));g.rotation.y=d.a;this.scene.add(g);this.box(.14,.4,.055,this.mat.brass,0,1.95,0,g);this.box(.035,.035,.25,this.mat.brass,0,1.92,.12,g);
          const slim=hash%3===0;
          const shade=this.mesh(slim?new THREE.CylinderGeometry(.10,.10,.30,12):new THREE.CylinderGeometry(.11,.18,.26,12),shadeMaterial,g);shade.position.set(0,2.04,.23);
          const bulb=this.mesh(new THREE.SphereGeometry(.055,8,8),this.mat.glow,g);bulb.position.set(0,1.88,.23);g.updateMatrixWorld();
          const lamp=bulb.getWorldPosition(new THREE.Vector3());lamp.strength=[8.2,10.8,12.2][hash%3];lamp.reach=4.9;lamp.angle=slim?.75:.88;lamp.warmth=hash%3===0?0xe8d2b7:0xffcf9e;lamp.aimX=-d.x*.20;lamp.aimZ=-d.z*.20;this.lampPositions.push(lamp);
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
    this.scareFace=makeMask();this.scareScene.add(this.scareFace);
    const coat=new THREE.MeshStandardMaterial({color:0x261620,roughness:.8});
    const shoulders=this.mesh(new THREE.CylinderGeometry(.18,.43,.6,14),coat,this.scareFace);shoulders.position.set(0,-.56,-.10);
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
    this.shardMesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.15),new THREE.MeshStandardMaterial({color:0x8758ae,emissive:0x7834a0,emissiveIntensity:.55,metalness:.22,roughness:.48}),SHARDS.length);
    this.shardGlow=new THREE.InstancedMesh(new THREE.PlaneGeometry(.45,.45),new THREE.MeshBasicMaterial({map:glowTexture(),color:0xa87ac6,transparent:true,opacity:.26,depthWrite:false,blending:THREE.AdditiveBlending}),SHARDS.length);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shardGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.shardMesh,this.shardGlow);this.shardFade=new Float32Array(SHARDS.length).fill(1);this.dummy=new THREE.Object3D();
  }
  buildExit(){
    this.exit=new THREE.Group();this.exit.position.copy(world(.53+this.wallInset,EXIT.z));this.exit.rotation.y=Math.PI/2;this.scene.add(this.exit);
    for(const side of [-.7,.7])this.box(.12,2.55,.2,this.mat.brass,side,1.275,0,this.exit);this.box(1.52,.12,.2,this.mat.brass,0,2.55,0,this.exit);
    this.exitMaterial=new THREE.MeshBasicMaterial({color:0x9470c2,transparent:true,opacity:.12,side:THREE.DoubleSide});const field=this.mesh(new THREE.PlaneGeometry(1.25,2.4),this.exitMaterial,this.exit);field.position.y=1.22;
    this.exitRing=this.mesh(new THREE.TorusGeometry(.48,.025,8,64),new THREE.MeshBasicMaterial({color:0xb18fd3}),this.exit);this.exitRing.position.set(0,1.2,.08);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#121416';x.fillRect(0,0,512,128);x.fillStyle='#b9d1bd';x.font='bold 44px Microsoft YaHei';x.textAlign='center';x.fillText('入口 / EXIT',256,82);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(1.3,.32),new THREE.MeshBasicMaterial({map:t}),this.exit);sign.position.set(0,2.83,.06);
  }
  buildEnemy(){
    this.enemy=new THREE.Group();this.scene.add(this.enemy);const coat=new THREE.MeshStandardMaterial({color:0x36222c,roughness:.8});const mask=new THREE.MeshStandardMaterial({color:0xb6a590,roughness:.5,metalness:.12});
    this.enemyBody=new THREE.Group();this.enemy.add(this.enemyBody);const torso=this.mesh(new THREE.CylinderGeometry(.24,.35,.87,8),coat,this.enemyBody);torso.position.y=.98;
    for(const yy of [.81,1.04,1.25])this.box(.025,.025,.03,this.mat.brass,0,yy,.245,this.enemyBody);
    const face=makeMask();face.position.set(0,1.63,.025);this.enemyBody.add(face);
    this.enemyLimbs=[];for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.29,1.31,0);this.enemyBody.add(arm);const limb=this.mesh(new THREE.CylinderGeometry(.065,.055,.63,8),coat,arm);limb.position.y=-.28;const hand=this.mesh(new THREE.SphereGeometry(.073,8,8),mask,arm);hand.position.y=-.61;this.enemyLimbs.push({node:arm,side,leg:false});
      const leg=new THREE.Group();leg.position.set(side*.14,.63,0);this.enemy.add(leg);const shin=this.mesh(new THREE.CylinderGeometry(.09,.07,.54,8),this.mat.black,leg);shin.position.y=-.23;this.box(.16,.13,.28,this.mat.black,0,-.53,.05,leg);this.enemyLimbs.push({node:leg,side,leg:true});
    }
    this.warningLight=new THREE.SpotLight(0xff0820,110,12,Math.PI/5.2,.3,1.2);this.warningLight.castShadow=true;this.warningLight.shadow.mapSize.set(1024,1024);this.warningLight.shadow.camera.near=.15;this.warningLight.shadow.bias=-.0004;this.warningLight.shadow.normalBias=.025;this.scene.add(this.warningLight,this.warningLight.target);
  }
  render(game,yaw,pitch,time,dt=1/60,active=true,motionScale=1){
    if(this.lastGame!==game){this.lastGame=game;this.shardFade.fill(1);this.enemyHeading=-Math.PI/2;this.bobBlend=0;}
    // Actual travel speed drives bobbing equally for forward, backward and sideways motion.
    const speed=Math.hypot(game.playerVelocity.x,game.playerVelocity.z),moving=active&&game.phase==='playing'&&speed>.05, motion=this.motionEnabled&&!this.reducedMotion.matches;
    this.runBlend+=((moving&&game.sprinting&&!this.reducedMotion.matches?1:0)-this.runBlend)*(1-Math.exp(-dt*9));this.updateFov();
    const travelBlend=Math.min(1,speed/Math.max(.1,game.tuning.playerSpeed*.6));
    this.bobBlend+=((moving&&motion?motionScale*travelBlend:0)-this.bobBlend)*(1-Math.exp(-dt*16));if(moving)this.stepPhase+=speed*UNIT*dt*Math.PI*2/2.1;
    const runAmplitude=this.walkBobStrength+(this.runBobStrength-this.walkBobStrength)*this.runBlend;
    const bob=Math.sin(this.stepPhase)*(.018+this.runBlend*.014)*this.bobBlend*runAmplitude,sway=Math.cos(this.stepPhase*.5)*(.009+this.runBlend*.005)*this.bobBlend*runAmplitude;
    this.camera.position.copy(world(game.player.x,game.player.z,this.eyeHeight+bob));this.camera.position.x+=Math.cos(yaw)*sway;this.camera.position.z-=Math.sin(yaw)*sway;this.camera.rotation.set(pitch,yaw,0,'YXZ');this.cameraLight.position.copy(this.camera.position);
    const es=Math.hypot(game.enemyVelocity.x,game.enemyVelocity.z);if(active&&game.phase==='playing'){this.enemyPhase+=es*UNIT*dt*Math.PI/1.65;if(es>.01){const target=Math.atan2(game.enemyVelocity.x,game.enemyVelocity.z),delta=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading));this.enemyHeading+=delta*(1-Math.exp(-dt*15));}}
    if(game.phase==='caught'){
      const target=Math.atan2(game.player.x-game.enemy.x,game.player.z-game.enemy.z);
      this.enemyHeading+=Math.atan2(Math.sin(target-this.enemyHeading),Math.cos(target-this.enemyHeading))*(1-Math.exp(-dt*22));
    }
    this.enemy.visible=game.phase!=='caught'||RULES.caughtSeconds-game.caught<SCARE_TURN_SECONDS;
    this.enemy.position.copy(world(game.enemy.x,game.enemy.z));this.enemy.rotation.y=this.enemyHeading;this.enemyBody.position.y=Math.abs(Math.sin(this.enemyPhase))*.018;this.enemyLimbs.forEach(({node,side,leg})=>node.rotation.x=Math.sin(this.enemyPhase)*side*(leg?.48:-.31));
    this.warningLight.position.copy(world(game.enemy.x,game.enemy.z,1.05));this.warningLight.target.position.copy(this.warningLight.position).add(new THREE.Vector3(Math.sin(this.enemyHeading)*5,-1.02,Math.cos(this.enemyHeading)*5));this.warningLight.visible=game.phase==='playing';
    SHARDS.forEach((p,i)=>{const fade=this.shardFade[i]=Math.max(0,this.shardFade[i]-(game.collected.has(i)?dt*6:0));const dummy=this.dummy;dummy.position.set((p.x-7)*UNIT,.87+Math.sin(time*2+i)*.035+(1-fade)*.2,(p.z-7)*UNIT);dummy.rotation.set(0,time*.9+i*.4,0);dummy.scale.setScalar(fade);dummy.updateMatrix();this.shardMesh.setMatrixAt(i,dummy.matrix);dummy.quaternion.copy(this.camera.quaternion);dummy.updateMatrix();this.shardGlow.setMatrixAt(i,dummy.matrix);});this.shardMesh.instanceMatrix.needsUpdate=true;this.shardGlow.instanceMatrix.needsUpdate=true;
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
