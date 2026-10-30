import * as THREE from '../vendor/three.module.js';
import { MAP, SHARDS, EXIT, ENEMY_START, isOpen, RULES } from './world.js';
import {decorateHotel} from './hotel-detail.js';
import {SCARE_TURN_SECONDS} from './presentation.js';
export const UNIT = 2.4;
const world = (x,z,y=0) => new THREE.Vector3((x-7)*UNIT,y,(z-7)*UNIT);
function texture(kind) {
  const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
  x.fillStyle=kind==='paper'?'#a18d70':kind==='carpet'?'#491b2b':'#3d2829';x.fillRect(0,0,512,512);
  let seed=1894;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<16000;i++){const a=random()*.13;x.fillStyle=`rgba(${random()>.5?'255,225,192':'0,0,0'},${a})`;x.fillRect(random()*512,random()*512,1+random()*2,1+random()*2);}
  if(kind==='paper') {
    for(let j=-1;j<6;j++)for(let i=-1;i<6;i++){
      x.save();x.translate(i*100+(j%2)*50,j*110);x.strokeStyle='#483b36b0';x.fillStyle='#514239bb';x.lineWidth=2;
      for(let k=0;k<4;k++){x.rotate(Math.PI/2);x.beginPath();x.moveTo(0,0);x.bezierCurveTo(30,-40,36,-14,8,-8);x.bezierCurveTo(24,-9,20,-30,0,-42);x.bezierCurveTo(-10,-27,-14,-12,0,0);x.fill();x.stroke();}
      x.strokeStyle='#e1bc7370';x.beginPath();x.moveTo(0,-50);x.lineTo(39,0);x.lineTo(0,50);x.lineTo(-39,0);x.closePath();x.stroke();x.restore();
    }
  } else if(kind==='carpet') {
    x.save();x.translate(256,256);for(let ring=0;ring<4;ring++){x.strokeStyle=ring%2?'#b5936060':'#be6c7450';x.lineWidth=2;x.beginPath();for(let k=0;k<=64;k++){const a=k*Math.PI/32,r=72+ring*38+Math.cos(a*8)*12;x.lineTo(Math.cos(a)*r,Math.sin(a)*r);}x.stroke();}x.restore();
    for(let j=0;j<8;j++)for(let i=0;i<8;i++){x.strokeStyle='#81525d35';x.beginPath();const a=i*64+32,b=j*64+32;x.moveTo(a,b-22);x.lineTo(a+16,b);x.lineTo(a,b+22);x.lineTo(a-16,b);x.closePath();x.stroke();}
  } else {for(let i=0;i<60;i++){x.strokeStyle=`rgba(12,7,5,${random()*.25})`;x.lineWidth=random()*2;x.beginPath();const a=random()*512;x.moveTo(a,0);x.bezierCurveTo(a+15,170,a-8,300,a,512);x.stroke();}x.strokeStyle='#07050480';x.lineWidth=4;x.strokeRect(15,15,482,482);x.strokeStyle='#9b795133';x.lineWidth=2;x.strokeRect(24,24,464,464);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
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
  constructor(container){
    this.horizontalFov=94;this.runBlend=0;this.bobBlend=0;this.stepPhase=0;this.enemyPhase=0;this.enemyHeading=-Math.PI/2;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');this.motionEnabled=!this.reducedMotion.matches;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#100d14');this.scene.fog=new THREE.Fog('#100d14',8,30);
    this.camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.045,70);this.camera.rotation.order='YXZ';
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;
    this.scene.add(new THREE.HemisphereLight(0xc9b7cd,0x30202a,.38));const fill=new THREE.DirectionalLight(0xe5cdab,.40);fill.position.set(-8,20,4);this.scene.add(fill);
    this.cameraLight=new THREE.PointLight(0xd4c6dd,.5,5,2);this.scene.add(this.cameraLight);
    this.mat={paper:new THREE.MeshStandardMaterial({map:texture('paper'),roughness:1}),wood:new THREE.MeshStandardMaterial({map:texture('wood'),roughness:.85}),brass:new THREE.MeshStandardMaterial({color:0xb39863,metalness:.55,roughness:.4}),black:new THREE.MeshStandardMaterial({color:0x100c13,roughness:.9}),glow:new THREE.MeshBasicMaterial({color:0xffd2a2})};
    this.buildMap();decorateHotel(this,world,UNIT);this.batchStaticMeshes();this.buildShards();this.buildExit();this.buildEnemy();this.buildScare();
    this.lights=Array.from({length:6},()=>{const light=new THREE.PointLight(0xffba7c,4.5,7,2);this.scene.add(light);return light;});this.lightClock=1;
    this.resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.updateFov();this.renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',this.resize);this.updateFov();
    this.ready=Promise.all([this.renderer.compileAsync(this.scene,this.camera),this.renderer.compileAsync(this.scareScene,this.scareCamera)]).catch(()=>{});
  }
  updateFov(){this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.horizontalFov+this.runBlend*3)/2)/Math.max(1.6,this.camera.aspect)));this.camera.updateProjectionMatrix();}
  mesh(geo,mat,parent=this.scene){const m=new THREE.Mesh(geo,mat);parent.add(m);return m;}
  box(w,h,d,mat,x,y,z,parent=this.scene){const m=this.mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;}
  buildMap(){
    const walls=[];MAP.forEach((row,z)=>[...row].forEach((c,x)=>{if(c==='#')walls.push({x,z});}));const dummy=new THREE.Object3D();
    for(const [h,y,pad,mat] of [[3.1,1.55,0,this.mat.paper],[1,.5,.018,this.mat.wood],[.09,1.03,.04,this.mat.brass],[.15,.075,.04,this.mat.black],[.10,2.96,.05,this.mat.brass],[.07,2.84,.035,this.mat.wood]]){
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(UNIT+pad,h,UNIT+pad),mat,walls.length);mesh.castShadow=true;mesh.receiveShadow=true;walls.forEach((p,i)=>{dummy.position.copy(world(p.x,p.z,y));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.scene.add(mesh);
    }
    const carpet=texture('carpet');carpet.repeat.set(15,15);const floor=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),new THREE.MeshStandardMaterial({map:carpet,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
    const ceiling=this.mesh(new THREE.PlaneGeometry(15*UNIT,15*UNIT),new THREE.MeshStandardMaterial({color:0x6c5b50,roughness:1,side:THREE.DoubleSide}));ceiling.rotation.x=Math.PI/2;ceiling.position.y=3.1;
    this.lampPositions=[];let doorNumber=201;const shadeMaterial=new THREE.MeshStandardMaterial({color:0xceae84,emissive:0xa95d27,emissiveIntensity:.25,roughness:.9});
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#')return;
      const edges=[{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}].filter(d=>!isOpen(x+d.x,z+d.z));
      for(const d of edges){
        const hash=x*17+z*13+(d.x+1)*3+d.z;
        if(hash%7===0&&!(x===1&&z===1)){
          const g=new THREE.Group();g.position.copy(world(x+d.x*.485,z+d.z*.485));g.rotation.y=d.a;this.scene.add(g);
          this.box(1.10,2.25,.075,this.mat.black,0,1.125,0,g);this.box(.91,2.13,.09,this.mat.wood,0,1.065,.045,g);
          for(const side of [-.54,.54])this.box(.07,2.3,.12,this.mat.brass,side,1.15,.05,g);this.box(1.15,.08,.12,this.mat.brass,0,2.29,.05,g);
          this.box(.12,.035,.055,this.mat.brass,.3,1.02,.12,g);
          const c=document.createElement('canvas');c.width=128;c.height=64;const cx=c.getContext('2d');cx.fillStyle='#201912';cx.fillRect(0,0,128,64);cx.strokeStyle='#95784b';cx.strokeRect(3,3,122,58);cx.fillStyle='#ccb58a';cx.font='28px Georgia';cx.textAlign='center';cx.fillText(String(doorNumber++),64,42);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(.32,.16),new THREE.MeshBasicMaterial({map:t}),g);sign.position.set(0,1.75,.10);
        } else if(hash%4===0){
          const g=new THREE.Group();g.position.copy(world(x+d.x*.46,z+d.z*.46));g.rotation.y=d.a;this.scene.add(g);this.box(.14,.4,.055,this.mat.brass,0,1.95,0,g);this.box(.035,.035,.25,this.mat.brass,0,1.92,.12,g);
          const shade=this.mesh(new THREE.CylinderGeometry(.11,.18,.26,12),shadeMaterial,g);shade.position.set(0,2.04,.23);const bulb=this.mesh(new THREE.SphereGeometry(.075,8,8),this.mat.glow,g);bulb.position.set(0,1.92,.23);g.updateMatrixWorld();this.lampPositions.push(bulb.getWorldPosition(new THREE.Vector3()));
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
    this.shardMesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.15),new THREE.MeshStandardMaterial({color:0xa855f7,emissive:0x9e30ee,emissiveIntensity:1.7,metalness:.3,roughness:.2}),SHARDS.length);
    this.shardGlow=new THREE.InstancedMesh(new THREE.PlaneGeometry(.75,.75),new THREE.MeshBasicMaterial({map:glowTexture(),color:0xc28bff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),SHARDS.length);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.shardGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.shardMesh,this.shardGlow);this.shardFade=new Float32Array(SHARDS.length).fill(1);this.dummy=new THREE.Object3D();
  }
  buildExit(){
    this.exit=new THREE.Group();this.exit.position.copy(world(.53,EXIT.z));this.exit.rotation.y=Math.PI/2;this.scene.add(this.exit);
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
    const speed=Math.hypot(game.playerVelocity.x,game.playerVelocity.z),moving=active&&game.phase==='playing'&&speed>.05, motion=this.motionEnabled&&!this.reducedMotion.matches;
    this.runBlend+=((moving&&game.sprinting&&!this.reducedMotion.matches?1:0)-this.runBlend)*(1-Math.exp(-dt*9));this.updateFov();
    this.bobBlend+=((moving&&motion?motionScale:0)-this.bobBlend)*(1-Math.exp(-dt*16));if(moving)this.stepPhase+=speed*UNIT*dt*Math.PI*2/2.1;
    const bob=Math.sin(this.stepPhase)*(.018+this.runBlend*.014)*this.bobBlend,sway=Math.cos(this.stepPhase*.5)*(.009+this.runBlend*.005)*this.bobBlend;
    this.camera.position.copy(world(game.player.x,game.player.z,1.69+bob));this.camera.position.x+=Math.cos(yaw)*sway;this.camera.position.z-=Math.sin(yaw)*sway;this.camera.rotation.set(pitch,yaw,0,'YXZ');this.cameraLight.position.copy(this.camera.position);
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
    this.lightClock+=dt;if(this.lightClock>.25){this.lightClock=0;const nearest=[...this.lampPositions].sort((a,b)=>a.distanceToSquared(this.camera.position)-b.distanceToSquared(this.camera.position));this.lights.forEach((light,i)=>{light.position.copy(nearest[i]??this.camera.position);light.color.setHex(0xffba7c);});}
    this.renderer.render(this.scene,this.camera);this.drawScare(game,time);
  }
}
