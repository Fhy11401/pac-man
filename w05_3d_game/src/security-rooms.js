import * as THREE from '../vendor/three.module.js';
import {securityRoomFurniture,ROOM_BED_SIZE,ROOM_BED_STRUCTURE,ROOM_DESK_SIZE} from './security-room-layout.js';
import {timberBox,ceilingBowl} from './hotel-joinery.js';
import {applyHotelAsset} from './hotel-assets.js';
import {batchStaticMeshes} from './static-batch.js';
import {blackoutVisualLighting} from './blackout-lighting.js';
export {roomCollisionWalls} from './security-room-layout.js';

function roomPlate(number){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#242921';c.fillRect(0,0,256,128);c.strokeStyle='#a68f61';c.lineWidth=3;c.strokeRect(6,6,244,116);c.fillStyle='#dbc89e';c.textAlign='center';c.font='bold 60px Georgia';c.fillText(number,128,84);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:.72,metalness:.18,envMapIntensity:.3});
}

// A local impact flexes the timber, never the player's camera or door collider.
export function doorBashPose(state){
  if(!state?.bashing||state.progress<.99)return{depth:0,angle:0};
  const pulse=Math.max(0,Math.min(1,state.bashPulse??0)),wave=Math.sin((1-pulse)*Math.PI*3)*pulse;
  return{depth:wave*.012,angle:wave*.007};
}

// Rooms occupy actual open map cells. The shared furniture layout is also used
// by capsule collision and room navigation; none of the beds are scenery-only.
export function buildSecurityRooms(v,world,unit){
  const group=new THREE.Group();group.name='security-guest-rooms';group.visible=false;v.scene.add(group);
  const fixed=new THREE.Group();fixed.name='security-room-fixed-details';group.add(fixed);
  const moving=new THREE.Group();moving.name='security-room-doors';group.add(moving);
  const linen=new THREE.MeshStandardMaterial({color:0xd3d1bd,roughness:.96,envMapIntensity:.16});
  const blanket=new THREE.MeshStandardMaterial({color:0x607271,roughness:.94,envMapIntensity:.18});
  const mattress=new THREE.MeshStandardMaterial({color:0x9c9b8c,roughness:.96,envMapIntensity:.12});
  v.assetJobs.push(applyHotelAsset(linen,'fabric',{repeat:[3,3],normalScale:.14}),applyHotelAsset(blanket,'fabric',{repeat:[3,3],normalScale:.16}));
  const owned=[linen,blanket,mattress],baseEnv=owned.map(m=>m.envMapIntensity),doorSets=[],beds=[],desks=[],lampGlasses=[];
  const box=(w,h,d,mat,x,y,z,parent)=>{const m=v.box(w,h,d,mat,x,y,z,parent);m.castShadow=true;return m;};
  const hardware=(parent,x,y,z)=>{const escutcheon=box(.036,.13,.009,v.mat.brass,x,y,z,parent);const stem=v.mesh(new THREE.CylinderGeometry(.012,.012,.035,10),v.mat.brass,parent);stem.rotation.x=Math.PI/2;stem.position.set(x,y+.02,z+.021);const lever=v.mesh(new THREE.CapsuleGeometry(.008,.064,3,8),v.mat.brass,parent);lever.rotation.z=Math.PI/2;lever.position.set(x-.025,y+.02,z+.042);return escutcheon;};
  for(const entry of securityRoomFurniture(v.corridorWidth)){
    const {room,bed,desk}=entry,b=room.bounds;
    const bedGroup=new THREE.Group();bedGroup.name=bed.id;bedGroup.position.copy(world(bed.x,bed.z));bedGroup.rotation.y=bed.angle;fixed.add(bedGroup);
    const bw=ROOM_BED_SIZE.width,bl=ROOM_BED_SIZE.length;
    const underside=ROOM_BED_STRUCTURE.underside,rail=ROOM_BED_STRUCTURE.railHeight;
    for(const x of [-bw/2+.07,bw/2-.07])for(const z of [-bl/2+.11,bl/2-.11])timberBox(v,.07,underside+.045,.07,x,(underside+.045)/2,z,bedGroup);
    // Four raised rails and real transverse slats leave an unobstructed air gap.
    // The gameplay footprint remains solid for standing people and the enemy.
    for(const side of [-1,1]){timberBox(v,.065,rail,bl-.06,side*(bw/2-.0325),underside+rail/2,0,bedGroup,'z');timberBox(v,bw-.13,rail,.065,0,underside+rail/2,side*(bl/2-.0625),bedGroup,'x');}
    for(let i=0;i<6;i++)timberBox(v,bw-.14,.025,.12,0,ROOM_BED_STRUCTURE.deckTop-.0125,-.79+i*.316,bedGroup,'x');
    box(bw-.035,.19,bl-.08,mattress,0,ROOM_BED_STRUCTURE.mattressTop-.095,0,bedGroup);
    timberBox(v,bw,1.11,.045,0,.555,-bl/2+.025,bedGroup,'x');
    for(const x of [-bw/2+.055,bw/2-.055])timberBox(v,.042,1.13,.055,x,.565,-bl/2+.03,bedGroup);
    timberBox(v,bw-.07,.045,.055,0,1.082,-bl/2+.03,bedGroup,'x');
    box(bw-.055,.045,bl-.13,linen,0,.7575,.015,bedGroup);
    box(bw-.035,.040,1.35,blanket,0,.800,.25,bedGroup);box(bw-.025,.028,.18,linen,0,.829,-.36,bedGroup);
    for(const x of [-.285,.285]){const pillow=v.mesh(new THREE.SphereGeometry(1,20,10),linen,bedGroup);pillow.position.set(x,.838,-.69);pillow.scale.set(.255,.075,.18);pillow.castShadow=true;}
    beds.push({room:room.id,object:bedGroup,footprint:bed,geometryBounds:new THREE.Box3().setFromObject(bedGroup)});

    const deskGroup=new THREE.Group();deskGroup.name=desk.id;deskGroup.position.copy(world(desk.x,desk.z));deskGroup.rotation.y=desk.angle;fixed.add(deskGroup);
    timberBox(v,ROOM_DESK_SIZE.width,.045,ROOM_DESK_SIZE.depth,0,.80,0,deskGroup,'x');
    timberBox(v,ROOM_DESK_SIZE.width-.08,.13,.025,0,.713,ROOM_DESK_SIZE.depth/2-.025,deskGroup,'x');
    for(const x of [-.37,.37])for(const z of [-.105,.105])timberBox(v,.034,.78,.034,x,.39,z,deskGroup);
    const paper=box(.18,.005,.105,linen,-.23,.826,.012,deskGroup);paper.rotation.y=-.06;
    box(.04,.008,.14,v.mat.brass,.28,.826,.015,deskGroup);desks.push({room:room.id,object:deskGroup,footprint:desk,geometryBounds:new THREE.Box3().setFromObject(deskGroup)});

    const gate=new THREE.Group();gate.name=`${room.id}-door`;gate.position.copy(world(room.door.x,room.door.z));
    gate.rotation.y=Math.atan2(room.door.inside.x-room.door.outside.x,room.door.inside.z-room.door.outside.z);moving.add(gate);
    const frame=new THREE.Group();frame.position.copy(gate.position);frame.rotation.copy(gate.rotation);fixed.add(frame);
    const height=Math.min(2.24,v.ceilingHeight-.33),opening=v.corridorWidth,leafWidth=opening/2;
    for(const side of [-1,1]){timberBox(v,.085,height+.045,.14,side*(opening/2+.035),(height+.045)/2,0,frame);timberBox(v,.028,height+.13,.055,side*(opening/2+.09),(height+.13)/2,-.015,frame);}
    timberBox(v,opening+.18,.085,.14,0,height+.045,0,frame,'x');
    const plate=roomPlate(room.room);owned.push(plate);baseEnv.push(plate.envMapIntensity);
    for(const side of [-1,1]){const number=v.mesh(new THREE.PlaneGeometry(.25,.125),plate,frame);number.position.set(0,height+.13,side*.078);if(side<0)number.rotation.y=Math.PI;}
    const leaves=[];
    for(const side of [-1,1]){
      const pivot=new THREE.Group();pivot.name=`${room.id}-leaf-${side}`;pivot.position.x=side*opening/2;gate.add(pivot);const centre=-side*leafWidth/2;
      box(leafWidth-.006,height,.038,v.mat.black,centre,height/2,0,pivot);
      for(const x of [centre-leafWidth/2+.043,centre+leafWidth/2-.043])timberBox(v,.075,height,.050,x,height/2,0,pivot);
      for(const y of [.048,1.04,height-.045])timberBox(v,leafWidth-.10,.085,.050,centre,y,0,pivot,'x');
      for(const [cy,h] of [[.53,.86],[1.64,height-1.20]]){
        timberBox(v,leafWidth-.19,h,.028,centre,cy,0,pivot,'y');
        for(const face of [-1,1]){
          for(const sx of [-1,1])timberBox(v,.015,h+.02,.014,centre+sx*(leafWidth/2-.095),cy,face*.025,pivot);
          for(const sy of [-1,1])timberBox(v,leafWidth-.185,.015,.014,centre,cy+sy*h/2,face*.025,pivot,'x');
        }
      }
      for(const face of [-1,1]){const handles=new THREE.Group();handles.rotation.y=face<0?Math.PI:0;pivot.add(handles);hardware(handles,face*(centre-side*(leafWidth/2-.10)),1.03,.031);}
      batchStaticMeshes(pivot);
      const stress=new THREE.Group();stress.name=`${room.id}-wood-stress-${side}`;stress.position.set(centre-side*(leafWidth/2-.075),1.04,0);pivot.add(stress);
      for(const face of [-1,1])for(let i=0;i<3;i++){const mark=box(.0035,.09+i*.024,.0015,v.mat.black,(i-1)*.014,(i-1)*.055,face*.027,stress);mark.rotation.z=side*(i%2?.31:-.25);mark.castShadow=false;}
      batchStaticMeshes(stress);stress.visible=false;leaves.push({object:pivot,side,stress});
    }
    doorSets.push({id:room.id,gate,leaves,progress:NaN});

    const lamp=new THREE.Group();lamp.name=`${room.id}-ceiling-light`;lamp.position.copy(world((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2,v.ceilingHeight-.047));fixed.add(lamp);ceilingBowl(v,lamp,.25);
    // A local copy allows these bulbs to follow hotel power without changing
    // the emergency room's shared bowl material.
    lamp.traverse(object=>{if(object.material?.isMeshBasicMaterial){object.material=object.material.clone();lampGlasses.push({material:object.material,color:object.material.color.clone()});}});
    const light=world((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2,v.ceilingHeight-.19);Object.assign(light,{blackoutOnly:true,guestRoom:room.id,strength:27,reach:6,angle:1.39,penumbra:.35,warmth:room.room==='201'?0xe8e4cf:0xffdfb5,isCorner:true});v.lampPositions.push(light);
  }
  const audit=batchStaticMeshes(fixed);fixed.updateMatrixWorld(true);fixed.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
  let lastPower=null;
  function update(game){
    const state=game.blackout,visual=blackoutVisualLighting(state);group.visible=Boolean(state);if(!state)return;
    if(lastPower!==visual.key){owned.forEach((m,index)=>m.envMapIntensity=baseEnv[index]*(visual.powerOn?1:visual.blackout?.005:.09));lampGlasses.forEach(({material,color})=>material.color.copy(color).multiplyScalar(visual.powerOn?1:visual.blackout?0:.006));lastPower=visual.key;}
    for(const door of doorSets){const status=state.roomDoors?.[door.id],progress=Math.max(0,Math.min(1,status?.progress??1)),impact=doorBashPose(status),damage=Math.max(0,Math.min(1,status?.bashProgress??0));for(const leaf of door.leaves){leaf.object.rotation.y=leaf.side*((1-progress)*Math.PI/2+impact.angle);leaf.object.position.z=impact.depth;leaf.stress.visible=damage>.1;leaf.stress.scale.y=Math.max(.001,damage);}
      if(progress!==door.progress||impact.depth!==door.impact){for(const light of v.lights??[])if(light.intensity>0&&light.position.distanceToSquared(door.gate.position)<64)light.shadow.needsUpdate=true;if(v.blackoutView?.flashlight.intensity>0)v.blackoutView.flashlight.shadow.needsUpdate=true;door.progress=progress;door.impact=impact.depth;}
    }
  }
  v.detailAudit.securityRooms={rooms:doorSets.length,beds:beds.length,desks:desks.length,batch:audit};return{group,fixed,moving,doors:doorSets,beds,desks,update};
}
