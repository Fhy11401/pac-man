import * as THREE from '../vendor/three.module.js';
import {BLACKOUT_LAYOUT,BLACKOUT_RULES} from './blackout-layout.js';
import {MAP_CENTER,ENTRY_GATE,SAFE_ROOM,isInSafeRoom,isOpen} from './world.js';
import {batchStaticMeshes} from './static-batch.js';
import {ceilingBowl} from './hotel-joinery.js';
import {slideMove} from './movement.js';
import {entryCollisionWalls} from './entry-state.js';
import {blackoutVisualLighting} from './blackout-lighting.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const reserved=[BLACKOUT_LAYOUT.power,...BLACKOUT_LAYOUT.phones,...BLACKOUT_LAYOUT.lockers,BLACKOUT_LAYOUT.console];
const inwardAngle=wall=>Math.atan2(-wall.x,-wall.z);
const cellAt=(position,unit)=>({x:position.x/unit+MAP_CENTER.x,z:position.z/unit+MAP_CENTER.z});
const inGuestRoom=p=>(BLACKOUT_LAYOUT.rooms??[]).some(({bounds:b})=>p.x>=b.minX-.01&&p.x<=b.maxX+.01&&p.z>=b.minZ-.01&&p.z<=b.maxZ+.01);

// Separate the emissive material before static batching: the emergency room and
// the hotel may share a source bulb mesh, but never share its power-state uniform.
export function prepareBlackoutWorld(v,world,unit){
  const legacy=new THREE.Group();legacy.name='blackout-replaced-hotel-details';
  const signs=[],roomCenter=world((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2,(SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2);
  for(const child of [...v.scene.children]){
    const kind=child.userData.landmark?.kind;
    if(['exit','reception','guide'].includes(kind)){
      const face=child.children.find(mesh=>mesh.geometry?.type==='PlaneGeometry');
      signs.push({kind,position:child.position.clone(),rotation:child.rotation.clone(),height:face?.position.y??1.88,landmark:child.userData.landmark});legacy.add(child);
    }else if(child.position.y>v.ceilingHeight-.10&&(Math.hypot(child.position.x-roomCenter.x,child.position.z-roomCenter.z)<.1||inGuestRoom(cellAt(child.position,unit)))&&(child.isGroup||child.material?.blending===THREE.AdditiveBlending))legacy.add(child);
  }
  const sites=reserved.map(site=>world(site.x+site.wall.x*v.corridorWidth/(2*unit),site.z+site.wall.z*v.corridorWidth/(2*unit)));
  v.scene.updateMatrixWorld(true);
  for(const child of [...v.scene.children])if(child.isGroup&&sites.some(site=>Math.hypot(child.position.x-site.x,child.position.z-site.z)<.13)){
    // Keep continuous cornices/skirting; replace only furniture and wall ornaments.
    const trim=new THREE.Group();trim.position.copy(child.position);trim.quaternion.copy(child.quaternion);
    for(const part of [...child.children])if(part.isMesh){const extent=new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3());if(Math.max(extent.x,extent.z)>unit*.8&&extent.y<.04)trim.add(part);}
    if(trim.children.length)v.scene.add(trim);legacy.add(child);
  }
  const materials=new Map(),emitters=[];v.scene.updateMatrixWorld(true);legacy.updateMatrixWorld(true);
  for(const root of [v.scene,legacy])root.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material))return;
    const source=object.material;
    const glow=source===v.mat.glow||source.isMeshBasicMaterial&&(source.blending===THREE.AdditiveBlending||Math.max(source.color.r,source.color.g,source.color.b)>1);
    if(!glow&&!(source.emissiveIntensity>0))return;
    if(isInSafeRoom(cellAt(object.getWorldPosition(new THREE.Vector3()),unit)))return;
    let material=materials.get(source);
    if(!material){material=source.clone();materials.set(source,material);emitters.push({material,color:material.color.clone(),emissive:material.emissiveIntensity,opacity:material.opacity,glow,additive:material.blending===THREE.AdditiveBlending});}
    object.material=material;
  });
  const textured=[...materials].filter(([source])=>source.isMeshStandardMaterial);
  if(textured.length)v.assetJobs.push(Promise.all([...v.assetJobs]).then(()=>{
    if(v.disposed)return{key:'blackout-fixture-surfaces',loaded:false,disposed:true};
    // Fabric normals arrive asynchronously. The two power circuits share those
    // immutable texture handles while retaining separate emissive uniforms.
    for(const [source,material] of textured){for(const channel of ['map','normalMap','roughnessMap','bumpMap'])material[channel]=source[channel];material.normalScale.copy(source.normalScale);material.bumpScale=source.bumpScale;material.needsUpdate=true;}
    return{key:'blackout-fixture-surfaces',loaded:true};
  }));
  const replacedLamps=new Set(v.lampPositions.filter(position=>inGuestRoom(cellAt(position,unit))||sites.some(site=>Math.hypot(position.x-site.x,position.z-site.z)<.4)));
  const legacyRoomLamps=new Set(v.lampPositions.filter(position=>Math.hypot(position.x-roomCenter.x,position.z-roomCenter.z)<.1));
  return{legacy,emitters,replacedLamps,legacyRoomLamps,signs};
}

function labelMaterial(title,subtitle,{lit=false,ink='#d6c5a0',background='#252824'}={}){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
  const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,512,160);c.strokeStyle='#796d52';c.lineWidth=3;c.strokeRect(8,8,496,144);
  c.textAlign='center';c.fillStyle=ink;c.font='bold 38px Microsoft YaHei';c.fillText(title,256,72);c.font='20px Georgia';c.fillText(subtitle,256,120);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map,roughness:.78,metalness:.12,emissiveMap:lit?map:null,emissive:lit?0xaaaaaa:0x000000,emissiveIntensity:lit?.45:0,envMapIntensity:.25});
}

function hazardMaterial(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const c=canvas.getContext('2d');
  c.fillStyle='#b7a161';c.fillRect(0,0,128,64);c.fillStyle='#282a28';
  for(let i=-64;i<160;i+=64){c.beginPath();c.moveTo(i,0);c.lineTo(i+29,0);c.lineTo(i+93,64);c.lineTo(i+64,64);c.closePath();c.fill();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.repeat.x=5;
  return new THREE.MeshStandardMaterial({map,roughness:.87,metalness:.18,envMapIntensity:.3});
}

export function buildBlackoutView(v,world,unit){
  const preparation=v.blackoutPreparation??{legacy:new THREE.Group(),emitters:[],replacedLamps:new Set(),legacyRoomLamps:new Set(),signs:[]};
  const group=new THREE.Group();group.name='blackout-installation';group.visible=false;v.scene.add(group,preparation.legacy);
  const fixed=new THREE.Group();fixed.name='blackout-fixed-installation';group.add(fixed);
  const dynamic=new THREE.Group();dynamic.name='blackout-moving-installation';group.add(dynamic);
  const steel=new THREE.MeshStandardMaterial({color:0x57615c,roughness:.67,metalness:.73,envMapIntensity:.65});
  const dark=new THREE.MeshStandardMaterial({color:0x222b28,roughness:.78,metalness:.48,envMapIntensity:.42});
  const bakelite=new THREE.MeshStandardMaterial({color:0x1e221e,roughness:.39,metalness:.02,envMapIntensity:.5});
  const cream=new THREE.MeshStandardMaterial({color:0xbbb69f,roughness:.83,metalness:.12,envMapIntensity:.3});
  const rubber=new THREE.MeshStandardMaterial({color:0x101613,roughness:.97,envMapIntensity:.08});
  const hazard=hazardMaterial(),screwGeometry=new THREE.CylinderGeometry(.006,.006,.005,8);screwGeometry.rotateX(Math.PI/2);
  const frame=(site,parent=fixed)=>{const g=new THREE.Group();g.name=`blackout-${site.id}`;g.position.copy(world(site.x+site.wall.x*v.corridorWidth/(2*unit),site.z+site.wall.z*v.corridorWidth/(2*unit)));g.rotation.y=inwardAngle(site.wall);parent.add(g);return g;};
  const box=(w,h,d,m,x,y,z,parent)=>{const mesh=v.box(w,h,d,m,x,y,z,parent);mesh.castShadow=true;return mesh;};
  const screw=(parent,x,y,z)=>{const mesh=v.mesh(screwGeometry,v.mat.brass,parent);mesh.position.set(x,y,z);return mesh;};
  const label=(parent,title,subtitle,w,h,x,y,z,options)=>{const mesh=v.mesh(new THREE.PlaneGeometry(w,h),labelMaterial(title,subtitle,options),parent);mesh.position.set(x,y,z);return mesh;};
  const dial=(parent,r,depth,x,y,z,material=v.mat.brass)=>{const mesh=v.mesh(new THREE.CylinderGeometry(r,r,depth,16),material,parent);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.castShadow=true;return mesh;};

  for(const sign of preparation.signs){
    const plaque=new THREE.Group();plaque.position.copy(sign.position);plaque.rotation.copy(sign.rotation);fixed.add(plaque);
    let title='监控室';if(sign.kind==='guide'){const {cell,next}=sign.landmark;const local=(next.x-cell.x)*Math.cos(sign.rotation.y)-(next.z-cell.z)*Math.sin(sign.rotation.y);title=local>0?'监控室 →':'← 监控室';}
    box(.974,.504,.025,v.mat.wood,0,sign.height,.026,plaque);
    label(plaque,title,'SECURITY  /  恢复供电后返回',.94,.47,0,sign.height,.041);
  }
  // One dedicated emergency ceiling bowl replaces the dim hotel fixture here.
  // Its wider cone lights faces/equipment in the room without an unshadowed fill.
  const roomLamp=new THREE.Group();roomLamp.position.copy(world(SAFE_ROOM.minX+.6,SAFE_ROOM.minZ+.6,v.ceilingHeight-.047));fixed.add(roomLamp);ceilingBowl(v,roomLamp,.29);
  const roomLight=world(SAFE_ROOM.minX+.6,SAFE_ROOM.minZ+.6,v.ceilingHeight-.18);
  Object.assign(roomLight,{blackoutOnly:true,emergency:true,strength:42,reach:6.4,angle:1.43,penumbra:.28,warmth:0xffdfb0,normalBias:.014,isCorner:true});v.lampPositions.push(roomLight);

  // The moving steel skin occupies the same gate plane and depth as its collider.
  const gate=new THREE.Group();gate.name='blackout-mechanical-gate';gate.position.copy(world(ENTRY_GATE.x,ENTRY_GATE.z));dynamic.add(gate);
  const gateFixed=new THREE.Group();gateFixed.position.copy(gate.position);fixed.add(gateFixed);
  const opening=v.corridorWidth,doorHeight=Math.min(2.28,v.ceilingHeight-.29);
  for(const side of [-1,1]){
    box(.11,doorHeight+.08,.16,steel,side*(opening/2+.035),(doorHeight+.08)/2,0,gateFixed);
    box(.025,doorHeight,.062,rubber,side*(opening/2-.012),doorHeight/2,0,gateFixed);
  }
  box(opening+.24,.22,.24,dark,0,doorHeight+.10,0,gateFixed);
  for(const side of [-1,1]){const sign=label(gateFixed,'监控室','SECURITY  /  BACKUP POWER',.88,.13,0,doorHeight+.10,side*.124,{lit:true});if(side<0)sign.rotation.y=Math.PI;}
  const leaf=new THREE.Group();leaf.name='blackout-gate-leaf';gate.add(leaf);
  box(opening+.012,doorHeight,.05,steel,0,doorHeight/2,0,leaf);
  for(let i=1;i<15;i++)for(const side of [-1,1])box(opening,.008,.003,dark,0,doorHeight*i/15,side*.027,leaf);
  box(opening,.065,.058,hazard,0,.043,0,leaf);
  box(opening,.018,.060,rubber,0,.009,0,leaf);
  // Only the complete leaf is batched; its enclosing group remains animated.
  batchStaticMeshes(leaf);
  const buttonMaterial=new THREE.MeshStandardMaterial({color:0x9c5e31,roughness:.42,metalness:.25,emissive:0x8d3513,emissiveIntensity:.22});
  for(const side of [-1,1]){
    const button=new THREE.Group();button.position.set(-opening/2+.002,0,side*.46);button.rotation.y=Math.PI/2;gateFixed.add(button);
    box(.17,.29,.026,dark,0,1.18,.022,button);box(.148,.266,.013,steel,0,1.18,.041,button);
    dial(button,.032,.016,0,1.17,.057,buttonMaterial);label(button,'开 / 关','DOOR',.126,.055,0,1.263,.050);
    for(const x of [-.061,.061])for(const y of [1.071,1.289])screw(button,x,y,.051);
  }

  const power=frame(BLACKOUT_LAYOUT.power),powerDynamic=frame(BLACKOUT_LAYOUT.power,dynamic);
  box(.69,1.02,.020,rubber,0,1.36,.015,power);box(.65,.98,.105,dark,0,1.36,.073,power);
  box(.604,.928,.015,steel,0,1.36,.134,power);
  for(const x of [-.28,.28])for(const y of [.94,1.78])screw(power,x,y,.145);
  for(const y of [1.09,1.18]){box(.075,.038,.013,rubber,.18,y,.151,power);box(.014,.029,.014,cream,.18,y,.165,power);}
  label(power,'主配电','MAIN DISTRIBUTION',.46,.145,0,1.65,.145);
  label(power,'检修 · 长按 E','HOLD TO RESTORE POWER',.45,.14,0,1.015,.145,{ink:'#cab47c'});
  box(.418,.066,.013,rubber,0,1.412,.149,power);
  const progressMaterial=new THREE.MeshStandardMaterial({color:0x72aa83,roughness:.6,emissive:0x396b4a,emissiveIntensity:.55});
  const progress=box(.392,.037,.012,progressMaterial,0,1.412,.162,powerDynamic);progress.name='blackout-repair-progress';progress.scale.x=.001;
  const powerLamp=dial(powerDynamic,.017,.009,.24,1.53,.152,buttonMaterial.clone());
  for(let i=0;i<5;i++)box(.016,.018,.004,cream,-.16+i*.08,1.344,.145,power);

  const phones=BLACKOUT_LAYOUT.phones.map((site,index)=>{
    const room=frame(site),moving=frame(site,dynamic);room.translateX(-.57);moving.translateX(-.57);
    box(.25,.48,.019,rubber,.57,1.38,.018,room);box(.228,.45,.058,dark,.57,1.38,.061,room);
    label(room,site.room,'ROOM TELEPHONE',.24,.095,.57,1.72,.045);
    const receiver=new THREE.Group();receiver.position.set(.57,1.39,.112);moving.add(receiver);
    const handle=v.mesh(new THREE.CapsuleGeometry(.019,.245,3,10),bakelite,receiver);handle.position.z=.012;handle.castShadow=true;
    for(const y of [-.145,.145]){const cup=v.mesh(new THREE.CapsuleGeometry(.033,.020,3,12),bakelite,receiver);cup.rotation.x=Math.PI/2;cup.position.set(0,y,.012);cup.castShadow=true;}
    for(const y of [-.125,.125])box(.067,.018,.055,steel,.57,1.39+y,.095,room);
    const cordPoints=[];for(let i=0;i<=72;i++)cordPoints.push(new THREE.Vector3(.57+Math.sin(i*.65)*.012,1.21-i/72*.24,.123+Math.cos(i*.65)*.012));
    v.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints),64,.0035,4,false),rubber,room);
    const ledMaterial=new THREE.MeshStandardMaterial({color:0x6f3c22,roughness:.4,emissive:0xffa45b,emissiveIntensity:.05});
    dial(moving,.008,.007,.645,1.55,.095,ledMaterial);
    return{receiver,ledMaterial,index,site};
  });

  const lockers=BLACKOUT_LAYOUT.lockers.map(site=>{
    const locker=frame(site);box(.79,2.10,.018,rubber,0,1.05,.014,locker);box(.75,2.055,.115,dark,0,1.033,.078,locker);
    box(.69,1.98,.016,steel,0,1.043,.144,locker);
    for(const y of [.75,1.56])for(let i=0;i<6;i++){box(.43,.027,.004,rubber,0,y+i*.059,.155,locker);const slat=box(.438,.025,.014,steel,0,y+.011+i*.059,.166,locker);slat.rotation.x=-.35;}
    box(.027,.154,.030,v.mat.brass,.258,1.06,.173,locker);box(.009,.108,.030,rubber,.258,1.06,.191,locker);
    for(const y of [.23,1.07,1.84]){box(.026,.078,.022,dark,-.329,y,.157,locker);screw(locker,-.329,y-.025,.171);screw(locker,-.329,y+.025,.171);}
    label(locker,'值班储物','SERVICE LOCKER',.40,.095,0,1.29,.156);
    return{site,group:locker};
  });

  const batteries=BLACKOUT_LAYOUT.batteries.map(site=>{
    const wall=[{x:-1,z:0},{x:1,z:0},{x:0,z:-1},{x:0,z:1}].find(n=>!isOpen(site.x+n.x,site.z+n.z));
    const mount={...site,wall:wall??{x:0,z:0}},tray=frame(mount),item=frame(mount,dynamic);
    if(wall){box(.25,.025,.20,dark,0,1.03,.105,tray);box(.25,.15,.012,steel,0,1.10,.013,tray);
      box(.045,.025,.18,v.mat.brass,-.085,1.044,.105,tray);box(.045,.025,.18,v.mat.brass,.085,1.044,.105,tray);
    }else{item.position.y-=1.03;item.translateZ(-.118);}
    const cell=box(.086,.164,.058,cream,0,1.128,.118,item);cell.name=`blackout-${site.id}-cell`;
    box(.09,.022,.063,dark,0,1.211,.118,item);box(.021,.007,.021,v.mat.brass,-.022,1.226,.118,item);box(.018,.007,.018,v.mat.brass,.022,1.226,.118,item);
    label(item,'+','CELL',.057,.091,0,1.139,.149,{ink:'#424c3b',background:'#aaa987'});
    batchStaticMeshes(item);return{site,group:item};
  });

  const terminal=frame(BLACKOUT_LAYOUT.console);
  box(.91,.047,.25,v.mat.wood,0,.92,.126,terminal);box(.78,.12,.026,dark,0,.838,.030,terminal);
  for(const x of [-.34,.34]){box(.025,.30,.028,steel,x,.755,.034,terminal);const brace=box(.025,.25,.022,steel,x,.81,.123,terminal);brace.rotation.x=-.48;}
  box(.70,.48,.055,dark,0,1.33,.062,terminal);box(.631,.391,.012,rubber,0,1.34,.096,terminal);
  label(terminal,'安防监控','HALLS  /  SECURITY NETWORK',.593,.352,0,1.34,.104,{lit:true,ink:'#80a795',background:'#101e1a'});
  box(.43,.018,.115,dark,0,.959,.159,terminal);
  for(let row=0;row<3;row++)for(let col=0;col<10;col++)box(.025,.004,.019,cream,-.162+col*.036,.971,.128+row*.027,terminal);
  label(terminal,'独立应急供电','SECURITY  /  BACKUP CIRCUIT',.72,.15,0,1.76,.035,{lit:true});
  const fixture=new THREE.Group();fixture.position.copy(world(ENTRY_GATE.x,ENTRY_GATE.z)).add(new THREE.Vector3(-opening/2,0,1.05));fixture.rotation.y=Math.PI/2;fixed.add(fixture);
  box(.16,.27,.04,dark,0,2.11,.03,fixture);box(.11,.17,.05,cream,0,2.11,.075,fixture);
  const emergencyGlass=new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,1.72,1.05),toneMapped:false});box(.087,.139,.025,emergencyGlass,0,2.11,.111,fixture);
  for(const y of [2.055,2.165])box(.12,.008,.017,steel,0,y,.132,fixture);

  // This near-eye louver is a view of the inside of the locker, not a player
  // teleport. It follows the existing camera without writing position or yaw.
  const hideMask=new THREE.Group();hideMask.name='blackout-locker-interior';hideMask.visible=false;v.scene.add(hideMask);
  const insideMaterial=new THREE.MeshStandardMaterial({color:0x28342c,roughness:.84,metalness:.4,emissive:0x28362b,emissiveIntensity:.4,envMapIntensity:.1});
  const slats=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),insideMaterial,10),dummy=new THREE.Object3D();slats.frustumCulled=false;hideMask.add(slats);
  for(let i=0;i<10;i++){dummy.position.set(0,-1.08+i*.24,0);dummy.rotation.x=-.23;dummy.scale.set(2.3,.16,.035);dummy.updateMatrix();slats.setMatrixAt(i,dummy.matrix);}slats.instanceMatrix.needsUpdate=true;
  const flashlight=new THREE.SpotLight(0xe6e9d9,0,BLACKOUT_RULES.flashlightRange*unit,.30,.46,2);flashlight.name='blackout-flashlight';flashlight.castShadow=true;flashlight.shadow.mapSize.set(1024,1024);flashlight.shadow.camera.near=.04;flashlight.shadow.bias=-.00008;flashlight.shadow.normalBias=.012;flashlight.shadow.autoUpdate=false;v.scene.add(flashlight,flashlight.target);
  const lastFlashPosition=new THREE.Vector3(Infinity,0,0),lastFlashRotation=new THREE.Quaternion(),direction=new THREE.Vector3(),phoneOffset=new THREE.Vector3();

  const batch=batchStaticMeshes(fixed);batchStaticMeshes(preparation.legacy);
  for(const root of [fixed,preparation.legacy]){root.updateMatrixWorld(true);root.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});}
  const reflectionMaterials=new Map();v.scene.traverse(object=>{for(const material of [object.material].flat())if(material?.isMeshStandardMaterial&&!reflectionMaterials.has(material))reflectionMaterials.set(material,material.envMapIntensity);});
  const emergencyMaterials=new Map();group.traverse(object=>{const m=object.material;if(!m||emergencyMaterials.has(m))return;if(m.isMeshBasicMaterial||m.emissiveIntensity>0)emergencyMaterials.set(m,{color:m.color.clone(),emissive:m.emissiveIntensity});});
  let powerState=null,lastDoor=-1,wasFlash=false;
  function allowedLamp(position,game){const visual=blackoutVisualLighting(game.blackout);if(!visual.enabled)return!position.blackoutOnly;if(visual.blackout)return false;return!preparation.replacedLamps.has(position)&&!preparation.legacyRoomLamps.has(position)&&(visual.powerOn||position.emergency||isInSafeRoom(cellAt(position,unit)));}
  function update(game,dt){
    const state=game.blackout,visual=blackoutVisualLighting(state),{enabled,key}=visual,power=visual.powerOn;
    group.visible=enabled;preparation.legacy.visible=!enabled;if(v.safeRoom)v.safeRoom.group.visible=!enabled;
    if(v.shardMesh)v.shardMesh.visible=!enabled;if(v.shardGlow)v.shardGlow.visible=!enabled;if(v.exit)v.exit.visible=!enabled;
    // Keep shader light counts stable; an inactive beam has zero intensity and
    // does not render a shadow map, rather than compiling a new light variant.
    hideMask.visible=enabled&&Boolean(state.hidden)&&!String(state.hidden).startsWith('bed:')&&game.phase==='playing';
    if(key!==powerState){
      for(const entry of preparation.emitters){const m=entry.material;m.color.copy(entry.color);m.opacity=entry.opacity;if(entry.emissive!==undefined)m.emissiveIntensity=power?entry.emissive:0;if(!power&&entry.glow){if(entry.additive)m.opacity=0;else m.color.multiplyScalar(visual.blackout?0:.006);}}
      for(const [material,value] of reflectionMaterials)material.envMapIntensity=value*(power?1:visual.blackout?.005:.09);
      for(const [material,initial] of emergencyMaterials){if(material.isMeshBasicMaterial)material.color.copy(initial.color).multiplyScalar(visual.blackout?0:1);if(initial.emissive!==undefined)material.emissiveIntensity=visual.blackout?0:initial.emissive;}
      if(v.hemisphereLight)v.hemisphereLight.intensity=power?.19:visual.blackout?.003:.018;
      if(v.ambientLight)v.ambientLight.intensity=power?.07:visual.blackout?0:.009;
      if(v.cameraLight)v.cameraLight.intensity=power?.18:visual.blackout?0:.035;
      for(const light of v.lights??[])light.shadow.needsUpdate=true;
      v.lightClock=1;powerState=key;
    }
    // Exposure changes the sensor response only; night vision adds no world light.
    const exposureFactor=enabled&&state.nightVision&&state.battery>0?14:1;
    if(v.renderer)v.renderer.toneMappingExposure=.96*(v.motionTuning?.brightness??.7)*exposureFactor;
    // The near-eye louver's small readability floor is not a physical lamp;
    // keep it stable while the sensor amplifies the actual corridor lighting.
    insideMaterial.emissiveIntensity=.4/exposureFactor;
    if(!enabled){flashlight.intensity=0;wasFlash=false;return;}
    const door=clamp(state.doorProgress??1);leaf.position.y=(1-door)*(doorHeight+.055);
    if(door!==lastDoor){for(const light of v.lights??[])if(light.position.distanceToSquared(gate.position)<70)light.shadow.needsUpdate=true;if(wasFlash)flashlight.shadow.needsUpdate=true;lastDoor=door;}
    const amount=clamp(state.repairProgress??0);progress.scale.x=Math.max(.001,amount);progress.position.x=-(1-amount)*.196;
    progressMaterial.color.setHex(state.powerOn?0xb5d0a0:0x72aa83);powerLamp.material.emissive.setHex(state.powerOn?0x53a87a:0xa76423);powerLamp.material.emissiveIntensity=state.powerOn?.9:.25;
    buttonMaterial.color.setHex(state.doorClosed?0xa17341:0x6fa488);buttonMaterial.emissive.setHex(state.doorClosed?0x783815:0x267445);
    phones.forEach(({receiver,ledMaterial,index})=>{const ringing=(state.phones[index]?.remaining??0)>0;receiver.rotation.z=ringing?Math.sin((game.elapsed??0)*34)*.026:0;ledMaterial.emissiveIntensity=ringing?1.2:.05;});
    if(visual.blackout)for(const [material,initial] of emergencyMaterials)if(initial.emissive!==undefined)material.emissiveIntensity=0;
    batteries.forEach(({site,group:item})=>{item.visible=!state.batteries.has(site.id);});
    const lit=state.flashlight&&!visual.blackout&&!state.hidden&&game.phase==='playing';flashlight.intensity=lit?82:0;
    direction.set(0,0,-1).applyQuaternion(v.camera.quaternion);flashlight.target.position.copy(v.camera.position).addScaledVector(direction,8);
    phoneOffset.set(-.26,-.30,-.22).applyQuaternion(v.camera.quaternion);flashlight.position.copy(v.camera.position).add(phoneOffset);
    if(lit){
      const origin=cellAt(v.camera.position,unit),walls=game.tuning?entryCollisionWalls(game).filter(wall=>wall.type!=='furniture'):[];
      const lens=slideMove(origin,{x:phoneOffset.x/unit,z:phoneOffset.z/unit},.018/unit,v.corridorWidth,walls).position;
      flashlight.position.x=(lens.x-MAP_CENTER.x)*unit;flashlight.position.z=(lens.z-MAP_CENTER.z)*unit;
    }
    if(lit&&(!wasFlash||lastFlashPosition.distanceToSquared(flashlight.position)>1e-8||1-Math.abs(lastFlashRotation.dot(v.camera.quaternion))>1e-8)){flashlight.shadow.needsUpdate=true;lastFlashPosition.copy(flashlight.position);lastFlashRotation.copy(v.camera.quaternion);}wasFlash=lit;
    if(hideMask.visible){const halfHeight=Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2))*.31;hideMask.position.copy(v.camera.position);hideMask.quaternion.copy(v.camera.quaternion);hideMask.translateZ(-.31);hideMask.scale.set(halfHeight*v.camera.aspect,halfHeight,1);}
  }
  function warmup(){const states=[group.visible,preparation.legacy.visible,flashlight.visible,hideMask.visible];group.visible=preparation.legacy.visible=flashlight.visible=hideMask.visible=true;return()=>{[group.visible,preparation.legacy.visible,flashlight.visible,hideMask.visible]=states;};}
  v.detailAudit.blackout={phones:phones.length,lockers:lockers.length,batteries:batteries.length,maxPropProjection:.25,extraShadowLights:1,batch};
  return{group,fixed,dynamic,gate,leaf,doorHeight,progress,phones,lockers,batteries,flashlight,hideMask,preparation,update,allowedLamp,warmup};
}
