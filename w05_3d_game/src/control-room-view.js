import {drawPropertyNote} from './lost-property-note.js';
import {openingPushProgress} from './opening-timing.js';
import {POWER_SECTORS} from './power-grid.js';
import * as THREE from '../vendor/three.module.js';
import {MAP,MAP_WIDTH,MAP_HEIGHT,SAFE_ROOM,MAP_CENTER,isInSafeRoom} from './world.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {securityCameraPoses,SECURITY_CHANNELS,SECURITY_LIGHTING} from './security-cameras.js';
import {controlRoomLayout,controlMonitorLayout} from './control-room-layout.js';

function hotelPlan(){
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1080;const c=canvas.getContext('2d');
  c.fillStyle='#e1dfce';c.fillRect(0,0,1536,1080);c.strokeStyle='#6e796c';c.lineWidth=2;c.strokeRect(34,34,1468,1012);
  c.fillStyle='#243b39';c.font='34px Georgia';c.fillText('THE NIGHT HOTEL',70,92);c.font='bold 52px Microsoft YaHei';c.fillText('酒店总平面图',70,163);
  c.font='20px monospace';c.fillText('SECURITY OFFICE  /  FLOOR 01',932,95);c.fillText('N ↑',1390,162);
  c.strokeStyle='#8c9788';c.beginPath();c.moveTo(70,193);c.lineTo(1466,193);c.stroke();
  const unit=Math.min(1376/MAP_WIDTH,735/MAP_HEIGHT),ox=(1536-unit*MAP_WIDTH)/2,oz=224;
  const px=x=>ox+(x+.5)*unit,pz=z=>oz+(z+.5)*unit;
  c.fillStyle='#c9ccbd';for(let z=0;z<MAP_HEIGHT;z++)for(let x=0;x<MAP_WIDTH;x++)if(MAP[z][x]!=='#')c.fillRect(ox+x*unit,oz+z*unit,unit+.3,unit+.3);
  const colors=['#9aa99a','#b2baa1','#c0ad8c','#9cafb2'];
  BLACKOUT_LAYOUT.halls.forEach(({bounds:b},i)=>{c.fillStyle=colors[i%colors.length];c.fillRect(ox+b.minX*unit,oz+b.minZ*unit,(b.maxX-b.minX+1)*unit,(b.maxZ-b.minZ+1)*unit);});
  c.strokeStyle='#5d7066';c.lineWidth=1.4;c.beginPath();for(let z=0;z<MAP_HEIGHT;z++)for(let x=0;x<MAP_WIDTH;x++)if(MAP[z][x]!=='#')for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(MAP[z+dz]?.[x+dx]==='#'||MAP[z+dz]?.[x+dx]===undefined){const xx=ox+(x+(dx>0?1:0))*unit,zz=oz+(z+(dz>0?1:0))*unit;c.moveTo(xx,zz);c.lineTo(xx+(dx?0:unit),zz+(dz?0:unit));}c.stroke();
  c.textAlign='center';c.font='bold 20px Microsoft YaHei';c.fillStyle='#253e39';BLACKOUT_LAYOUT.halls.forEach(({bounds:b,label})=>c.fillText(label.split(' / ')[0],px((b.minX+b.maxX)/2),pz((b.minZ+b.maxZ)/2)+7));
  SECURITY_CHANNELS.forEach((camera,i)=>{const x=px(camera.position.x),y=pz(camera.position.z);c.fillStyle='#365951';c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.fill();c.fillStyle='#f5f3df';c.font='bold 13px monospace';c.fillText(String(i+1).padStart(2,'0'),x,y+5);});
  POWER_SECTORS.forEach(p=>{const x=px(p.x),y=pz(p.z);c.fillStyle='#955737';c.fillRect(x-13,y-11,26,22);c.fillStyle='#fff8df';c.font='bold 15px monospace';c.fillText(`P${p.number}`,x,y+5);});
  const sx=px((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2),sz=pz((SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2);c.fillStyle='#b35e39';c.beginPath();c.arc(sx,sz,9,0,Math.PI*2);c.fill();c.font='bold 19px Microsoft YaHei';c.textAlign='left';c.fillText('您在此处 · 监控室',sx+18,sz+6);
  c.fillStyle='#243b39';c.font='20px Microsoft YaHei';c.fillText('● 监控点位     ■ 公共大厅     P1–P4 分区配电     ● 监控室',70,1010);c.textAlign='right';c.font='18px monospace';c.fillText('HOTEL OPERATIONS  /  KEEP FOR REFERENCE',1466,1010);
  return canvas;
}

export function buildControlRoom(v,world,unit,fixed,dynamic){
  const layout=controlRoomLayout(v.corridorWidth),root=new THREE.Group();root.name='security-workstation';root.position.copy(world(layout.anchor.x,layout.anchor.z));root.rotation.y=layout.angle;root.scale.z=layout.deskScale;fixed.add(root);
  const material=(color,roughness=.6,metalness=.2)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const metal=material(0x303c3c,.55,.65),edge=material(0x12191d,.48,.45),leather=material(0x262e31,.91,.02),keys=material(0x667278,.64,.12),paper=material(0xc6c6b3,.9,0);
  const box=(w,h,d,m,x,y,z,parent=root)=>{const mesh=v.box(w,h,d,m,x,y,z,parent);mesh.castShadow=mesh.receiveShadow=true;return mesh;};
  const cyl=(r,h,m,x,y,z,parent=root)=>{const mesh=v.mesh(new THREE.CylinderGeometry(r,r,h,16),m,parent);mesh.position.set(x,y,z);mesh.castShadow=true;return mesh;};
  const plane=(w,h,m,x,y,z,parent=root)=>{const mesh=v.mesh(new THREE.PlaneGeometry(w,h),m,parent);mesh.position.set(x,y,z);return mesh;};
  box(layout.deskWidth,.065,layout.depth,v.mat.wood,0,.79,.43);box(layout.deskWidth+.025,.024,.035,metal,0,.78,.85);
  for(const x of [-layout.deskWidth/2+.16,layout.deskWidth/2-.16]){box(.07,.73,.66,metal,x,.37,.41);box(.26,.04,.72,edge,x,.03,.43);}
  box(layout.deskWidth-.3,.30,.035,metal,0,.54,.13);
  const bank=new THREE.Group();bank.name='operator-facing-television-bank';bank.position.copy(root.position);bank.rotation.copy(root.rotation);fixed.add(bank);
  const screenGroup=new THREE.Group();screenGroup.name='security-live-screens';screenGroup.position.copy(root.position);screenGroup.rotation.copy(root.rotation);dynamic.add(screenGroup);
  const poses=securityCameraPoses(v.corridorWidth,unit),feeds=[],led=new THREE.MeshBasicMaterial({color:0x879b6a,toneMapped:false});
  for(const panel of controlMonitorLayout(layout,v.ceilingHeight)){
    const {channel:index,x,y,z,yaw,pitch,width:sw,height:sh}=panel;if(!poses[index])continue;
    const housing=new THREE.Group(),face=new THREE.Group();housing.position.set(x,y,z);housing.rotation.set(pitch,yaw,0,'YXZ');bank.add(housing);face.position.copy(housing.position);face.rotation.copy(housing.rotation);screenGroup.add(face);
    box(sw+.12,sh+.13,.29,edge,0,0,-.125,housing);
    box(sw+.06,sh+.065,.027,metal,0,0,.028,housing);
    // Deep CRT casings, recessed glass, lower controls and ventilation slots.
    for(let j=0;j<6;j++)box(.005,.08,.14,metal,sw/2+.061,-sh*.18,-.13+j*.008,housing);
    cyl(.015,.014,keys,sw*.39,-sh/2-.043,.049,housing).rotation.x=Math.PI/2;
    plane(.014,.009,led,sw*.32,-sh/2-.043,.049,housing);
    const target=new THREE.WebGLRenderTarget(index===0?1920:640,index===0?1080:360,{type:index===0&&v.renderer.extensions?.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,samples:Math.min(4,v.renderer.capabilities.maxSamples??0),depthBuffer:true,stencilBuffer:false});target.texture.colorSpace=target.texture.type===THREE.HalfFloatType?THREE.NoColorSpace:THREE.SRGBColorSpace;target.texture.generateMipmaps=false;
    const screenMaterial=new THREE.MeshBasicMaterial({map:target.texture,color:0xffffff,toneMapped:false});const display=plane(sw,sh,screenMaterial,0,0,.047,face);
    const label=document.createElement('canvas');label.width=512;label.height=40;const c=label.getContext('2d');c.fillStyle='#101413';c.fillRect(0,0,512,40);c.fillStyle='#bac2b7';c.font='18px monospace';c.fillText(SECURITY_CHANNELS[index].code,12,26);c.textAlign='right';c.font='17px Microsoft YaHei';c.fillText(SECURITY_CHANNELS[index].label,496,26);
    const tex=new THREE.CanvasTexture(label);tex.colorSpace=THREE.SRGBColorSpace;plane(sw*.68,.035,new THREE.MeshBasicMaterial({map:tex,toneMapped:false}),-sw*.10,-sh/2-.042,.050,face);
    const camera=new THREE.PerspectiveCamera(poses[index].fov,sw/sh,.045,70);camera.position.copy(poses[index].position);camera.lookAt(poses[index].target);camera.updateMatrixWorld(true);feeds.push({target,camera,index,display,face,material:screenMaterial,panel,ready:false});
  }
  const screenGlow=new THREE.PointLight(0x9eaca2,.65,3,2);screenGlow.position.set(0,1.35,.9).applyEuler(root.rotation).add(root.position);dynamic.add(screenGlow);
  const seatLocal=new THREE.Vector3(layout.chairX,1.25,layout.chairZ),seatPosition=seatLocal.clone().applyAxisAngle(new THREE.Vector3(0,1,0),layout.angle).add(root.position);
  screenGroup.updateMatrixWorld(true);
  const focusFeed=feeds.find(f=>f.index===0)??feeds[0],focusPosition=new THREE.Vector3(),focusNormal=new THREE.Vector3();
  focusFeed.display.getWorldPosition(focusPosition);focusFeed.display.getWorldDirection(focusNormal);
  box(.53,.027,.18,edge,-.36,.839,.59);for(let row=0;row<4;row++)for(let col=0;col<12;col++)box(.032,.007,.026,keys,-.58+col*.040,.858,.532+row*.036);
  box(.25,.005,.22,leather,.20,.826,.60);const mouse=v.mesh(new THREE.SphereGeometry(.04,12,8),keys,root);mouse.position.set(.20,.847,.60);mouse.scale.set(.7,.5,1.3);
  box(.20,.46,.40,edge,-layout.deskWidth/2+.42,.28,.40);for(let i=0;i<7;i++)box(.13,.005,.006,keys,-layout.deskWidth/2+.42,.17+i*.024,.604);
  cyl(.052,.10,paper,layout.deskWidth/2-.28,.875,.57);cyl(.043,.002,edge,layout.deskWidth/2-.28,.927,.57);
  const noteTable=new THREE.Group();noteTable.name='property-note-side-table';noteTable.position.set(layout.noteX,0,layout.noteZ);bank.add(noteTable);
  box(.68,.045,.60,v.mat.wood,0,.76,0,noteTable);
  for(const x of [-.265,.265])for(const z of [-.225,.225])box(.045,.73,.045,v.mat.wood,x,.365,z,noteTable);
  box(.53,.08,.035,v.mat.wood,0,.64,-.24,noteTable);box(.035,.08,.46,v.mat.wood,-.27,.64,0,noteTable);box(.035,.08,.46,v.mat.wood,.27,.64,0,noteTable);
  const noteCanvas=document.createElement('canvas'),noteTexture=new THREE.CanvasTexture(drawPropertyNote(noteCanvas,[]));noteTexture.colorSpace=THREE.SRGBColorSpace;noteTexture.anisotropy=Math.min(4,v.renderer.capabilities.getMaxAnisotropy());
  const noteGeometry=new THREE.PlaneGeometry(.34,.425,8,12),vertices=noteGeometry.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setZ(i,.006*Math.pow(Math.abs(vertices.getX(i))/.17,4)+.003*Math.sin(vertices.getY(i)*20));noteGeometry.computeVertexNormals();
  const note=v.mesh(noteGeometry,new THREE.MeshStandardMaterial({map:noteTexture,roughness:.96,metalness:0,side:THREE.DoubleSide}),noteTable);note.name='lost-property-paper';note.position.set(0,.790,0);note.rotation.set(-Math.PI/2,0,-.13);note.receiveShadow=true;
  let noteRecords=null;
  const chair=new THREE.Group();chair.name='security-office-chair';chair.position.set(layout.chairX,0,layout.chairZ/layout.deskScale);chair.scale.z=1/layout.deskScale;root.add(chair);
  cyl(.035,.39,metal,0,.25,0,chair);box(.51,.10,.47,leather,0,.49,0,chair);box(.49,.60,.08,leather,0,.89,.25,chair);box(.052,.49,.07,metal,0,.65,.30,chair);
  for(const side of [-1,1]){box(.036,.23,.036,metal,side*.28,.60,.08,chair);box(.065,.035,.32,leather,side*.28,.73,.03,chair);}
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,spoke=box(.035,.035,.32,metal,Math.sin(a)*.14,.10,Math.cos(a)*.14,chair);spoke.rotation.y=a;cyl(.045,.06,edge,Math.sin(a)*.28,.045,Math.cos(a)*.28,chair);}
  const board=new THREE.Group();board.name='hotel-wall-plan';board.position.copy(world((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2+.15,SAFE_ROOM.maxZ+v.corridorWidth/(2*unit)));board.rotation.y=Math.PI;fixed.add(board);
  const planWidth=Math.min(2.4,(SAFE_ROOM.maxX-SAFE_ROOM.minX)*unit+v.corridorWidth-.30),planHeight=planWidth*1080/1536;
  box(planWidth+.09,planHeight+.09,.035,v.mat.wood,0,1.66,.03,board);box(planWidth+.025,planHeight+.025,.018,metal,0,1.66,.057,board);
  const texture=new THREE.CanvasTexture(hotelPlan());texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,v.renderer.capabilities.getMaxAnisotropy());
  plane(planWidth,planHeight,new THREE.MeshStandardMaterial({map:texture,roughness:.88,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.14}),0,1.66,.068,board);
  let clock=0,cursor=0,frames=0,introClock=0;
  function drawFeed(feed,game,camera=feed.camera){
    const renderer=v.renderer,previousTarget=renderer.getRenderTarget(),exposure=renderer.toneMappingExposure,ambient=v.ambientLight.intensity,hemi=v.hemisphereLight.intensity,shadow=renderer.shadowMap.autoUpdate,halos=v.lampHalos.visible,visible=screenGroup.visible;
    try{screenGroup.visible=false;v.lampHalos.visible=false;
      const story=game.blackout.introShot==='monitor'&&feed===focusFeed;
      // Story lighting comes from the actual hall fixtures, like the main CCTV view.
      renderer.shadowMap.autoUpdate=story?shadow:false;
      if(!story){v.ambientLight.intensity=game.blackout.powerOn?SECURITY_LIGHTING.powered:SECURITY_LIGHTING.infrared;v.hemisphereLight.intensity=SECURITY_LIGHTING.hemisphere;}
      renderer.toneMappingExposure=.96*(v.motionTuning?.brightness??.7);renderer.setRenderTarget(feed.target);renderer.render(v.scene,camera);feed.ready=true;frames++;}
    finally{renderer.setRenderTarget(previousTarget);renderer.toneMappingExposure=exposure;v.ambientLight.intensity=ambient;v.hemisphereLight.intensity=hemi;renderer.shadowMap.autoUpdate=shadow;v.lampHalos.visible=halos;screenGroup.visible=visible;}
  }
  function updateFeeds(game,dt){
    const b=game.blackout;if(!b)return;
    if(b.lostProperty!==noteRecords){noteRecords=b.lostProperty;drawPropertyNote(noteCanvas,noteRecords??[]);noteTexture.needsUpdate=true;}
    screenGroup.visible=b.introLighting!=='blackout';screenGlow.intensity=screenGroup.visible?.65:0;
    if(!screenGroup.visible||!isInSafeRoom(game.player)||game.phase!=='playing'||v.security.active)return;
    const opening=b.introShot==='monitor',focused=opening&&openingPushProgress(b.introTime??0)>.22;
    // Prime one screen per frame, then stagger refreshes. Only the story screen
    // runs every frame during the push-in; nine full scenes are never drawn per frame.
    if(opening&&openingPushProgress(b.introTime??0)===1)return;
    const cold=feeds.find(f=>!f.ready);clock+=dt;introClock+=dt;
    if(cold)drawFeed(cold,game,opening&&cold===focusFeed?v.openingScene.camera:cold.camera);
    else if(!focused&&clock>=1/(opening?6:18)){clock%=1/(opening?6:18);const feed=feeds[cursor++%feeds.length];if(!opening||feed!==focusFeed)drawFeed(feed,game);}
    if(opening&&focusFeed!==cold&&(focused||introClock>=1/30)){introClock%=1/30;drawFeed(focusFeed,game,v.openingScene.camera);}
  }
  return{root,bank,board,note,noteTable,screenGroup,feeds,layout,seatPosition,focusPosition,focusNormal,focusFeed,updateFeeds,get frames(){return frames;},dispose(){feeds.forEach(({target})=>target.dispose());}};
}
