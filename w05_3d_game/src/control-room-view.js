import * as THREE from '../vendor/three.module.js';
import {MAP,MAP_WIDTH,MAP_HEIGHT,SAFE_ROOM,MAP_CENTER,isInSafeRoom} from './world.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';
import {securityCameraPoses,SECURITY_CHANNELS} from './security-cameras.js';
import {controlRoomLayout} from './control-room-layout.js';

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
  const sx=px((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2),sz=pz((SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2);c.fillStyle='#b35e39';c.beginPath();c.arc(sx,sz,9,0,Math.PI*2);c.fill();c.font='bold 19px Microsoft YaHei';c.textAlign='left';c.fillText('您在此处 · 监控室',sx+18,sz+6);
  c.fillStyle='#243b39';c.font='20px Microsoft YaHei';c.fillText('● 监控点位     ■ 公共大厅     ● 监控室',70,1010);c.textAlign='right';c.font='18px monospace';c.fillText('HOTEL OPERATIONS  /  KEEP FOR REFERENCE',1466,1010);
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
  const screenGroup=new THREE.Group();screenGroup.name='security-live-screens';screenGroup.position.copy(root.position);screenGroup.rotation.copy(root.rotation);screenGroup.scale.z=layout.deskScale;dynamic.add(screenGroup);
  const poses=securityCameraPoses(v.corridorWidth,unit),indices=[0,1,2,3,8,5].filter(i=>i<poses.length),feeds=[];
  const spacing=layout.deskWidth/3,sw=spacing-.10,sh=sw*9/16;
  for(const [i,index] of indices.entries()){
    const x=(i%3-1)*spacing,y=1.15+Math.floor(i/3)*.66;
    box(sw+.07,sh+.095,.09,edge,x,y,.13);box(sw+.015,sh+.025,.012,metal,x,y,.182);
    if(i<3){box(.06,.20,.04,metal,x,.95,.11);box(.26,.025,.18,edge,x,.839,.18);}
    const target=new THREE.WebGLRenderTarget(256,144,{depthBuffer:true,stencilBuffer:false});target.texture.colorSpace=THREE.SRGBColorSpace;target.texture.generateMipmaps=false;
    const screenMaterial=new THREE.MeshBasicMaterial({map:target.texture,color:0xa5c3c0,toneMapped:false});plane(sw,sh,screenMaterial,x,y,.194,screenGroup);
    const label=document.createElement('canvas');label.width=512;label.height=40;const c=label.getContext('2d');c.fillStyle='#101819';c.fillRect(0,0,512,40);c.fillStyle='#bad9cf';c.font='18px monospace';c.fillText(SECURITY_CHANNELS[index].code,12,26);c.textAlign='right';c.font='17px Microsoft YaHei';c.fillText(SECURITY_CHANNELS[index].label,496,26);
    const tex=new THREE.CanvasTexture(label);tex.colorSpace=THREE.SRGBColorSpace;plane(sw,.045,new THREE.MeshBasicMaterial({map:tex,toneMapped:false}),x,y-sh/2-.027,.194,screenGroup);
    const camera=new THREE.PerspectiveCamera(poses[index].fov,16/9,.045,70);camera.position.copy(poses[index].position);camera.lookAt(poses[index].target);camera.updateMatrixWorld(true);feeds.push({target,camera,index});
  }
  box(.53,.027,.18,edge,-.36,.839,.59);for(let row=0;row<4;row++)for(let col=0;col<12;col++)box(.032,.007,.026,keys,-.58+col*.040,.858,.532+row*.036);
  box(.25,.005,.22,leather,.20,.826,.60);const mouse=v.mesh(new THREE.SphereGeometry(.04,12,8),keys,root);mouse.position.set(.20,.847,.60);mouse.scale.set(.7,.5,1.3);
  box(.20,.46,.40,edge,-layout.deskWidth/2+.42,.28,.40);for(let i=0;i<7;i++)box(.13,.005,.006,keys,-layout.deskWidth/2+.42,.17+i*.024,.604);
  cyl(.052,.10,paper,layout.deskWidth/2-.28,.875,.57);cyl(.043,.002,edge,layout.deskWidth/2-.28,.927,.57);
  const note=box(.24,.003,.31,paper,.67,.827,.58);note.rotation.y=-.13;
  const chair=new THREE.Group();chair.name='security-office-chair';chair.position.set(layout.chairX,0,layout.chairZ/layout.deskScale);chair.scale.z=1/layout.deskScale;root.add(chair);
  cyl(.035,.39,metal,0,.25,0,chair);box(.51,.10,.47,leather,0,.49,0,chair);box(.49,.60,.08,leather,0,.89,.25,chair);box(.052,.49,.07,metal,0,.65,.30,chair);
  for(const side of [-1,1]){box(.036,.23,.036,metal,side*.28,.60,.08,chair);box(.065,.035,.32,leather,side*.28,.73,.03,chair);}
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,spoke=box(.035,.035,.32,metal,Math.sin(a)*.14,.10,Math.cos(a)*.14,chair);spoke.rotation.y=a;cyl(.045,.06,edge,Math.sin(a)*.28,.045,Math.cos(a)*.28,chair);}
  const board=new THREE.Group();board.name='hotel-wall-plan';board.position.copy(world((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2+.15,SAFE_ROOM.maxZ+v.corridorWidth/(2*unit)));board.rotation.y=Math.PI;fixed.add(board);
  const planWidth=Math.min(2.4,(SAFE_ROOM.maxX-SAFE_ROOM.minX)*unit+v.corridorWidth-.30),planHeight=planWidth*1080/1536;
  box(planWidth+.09,planHeight+.09,.035,v.mat.wood,0,1.66,.03,board);box(planWidth+.025,planHeight+.025,.018,metal,0,1.66,.057,board);
  const texture=new THREE.CanvasTexture(hotelPlan());texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,v.renderer.capabilities.getMaxAnisotropy());
  plane(planWidth,planHeight,new THREE.MeshStandardMaterial({map:texture,roughness:.88,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.14}),0,1.66,.068,board);
  let clock=0,cursor=0,frames=0;
  function updateFeeds(game,dt){
    const b=game.blackout;if(!b||b.introLighting==='blackout'||!isInSafeRoom(game.player)||game.phase!=='playing'||v.security.active)return;
    clock+=dt;if(clock<1/12||!feeds.length)return;clock%=1/12;
    const feed=feeds[cursor++%feeds.length],renderer=v.renderer,previousTarget=renderer.getRenderTarget(),exposure=renderer.toneMappingExposure,ambient=v.ambientLight.intensity,hemi=v.hemisphereLight.intensity,shadow=renderer.shadowMap.autoUpdate,halos=v.lampHalos.visible;
    try{screenGroup.visible=false;v.lampHalos.visible=false;renderer.shadowMap.autoUpdate=false;v.ambientLight.intensity=b.powerOn?1.2:1.8;v.hemisphereLight.intensity=.7;renderer.toneMappingExposure=.9;renderer.setRenderTarget(feed.target);renderer.render(v.scene,feed.camera);frames++;}
    finally{renderer.setRenderTarget(previousTarget);renderer.toneMappingExposure=exposure;v.ambientLight.intensity=ambient;v.hemisphereLight.intensity=hemi;renderer.shadowMap.autoUpdate=shadow;v.lampHalos.visible=halos;screenGroup.visible=true;}
  }
  return{root,board,screenGroup,feeds,layout,updateFeeds,get frames(){return frames;},dispose(){feeds.forEach(({target})=>target.dispose());}};
}
