import * as THREE from '../vendor/three.module.js';
import {SAFE_ROOM,ENTRY_GATE} from './world.js';
import {timberBox} from './hotel-joinery.js';
import {applyHotelAsset} from './hotel-assets.js';
import {batchStaticMeshes} from './static-batch.js';

export const ENTRY_BREAK_SECONDS=.8;

// Both halves share the same cut profile and physical UV origin. The wood grain
// continues across the seam before the pieces separate.
export function splitBoardGeometry(length,height,depth=.045,seed=0){
  const cut=[[-.5,.018],[-.34,-.046],[-.20,.052],[-.02,-.024],[.15,.061],[.31,-.039],[.5,.012]].map(([y,x])=>({x:x+(seed%3-1)*.012,y:y*height}));
  return [-1,1].map(side=>{
    const shape=new THREE.Shape(),points=side<0?[{x:-length/2,y:-height/2},...cut,{x:-length/2,y:height/2}]:[{x:length/2,y:height/2},...cut.toReversed(),{x:length/2,y:-height/2}];
    shape.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))shape.lineTo(p.x,p.y);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,bevelSize:.001,bevelThickness:.001,steps:1});geometry.translate(0,0,-depth/2);
    const positions=geometry.attributes.position,normals=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      if(Math.abs(normals.getX(i))>.7)uv.setXY(i,(z+depth/2)/.36,(y+height/2)/.36);
      else uv.setXY(i,(Math.abs(normals.getZ(i))>.7?y+height/2:z+depth/2)/.36,(x+length/2)/1.9);
    }
    const pivot=side*length*.26;geometry.translate(-pivot,0,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();return{geometry,pivot,side};
  });
}

function doorLabel(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;const c=canvas.getContext('2d');
  c.fillStyle='#262019';c.fillRect(0,0,512,112);c.strokeStyle='#a18b5f';c.lineWidth=2;c.strokeRect(5,5,502,102);
  c.fillStyle='#ddcea9';c.textAlign='center';c.font='30px SimSun';c.fillText('客 房 区',256,44);c.font='17px Georgia';c.fillStyle='#b9a681';c.fillText('GUEST WING',256,82);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:.82,metalness:.12});
}

export function buildSafeRoom(v,world,unit){
  const group=new THREE.Group();group.name='safe-room';v.scene.add(group);
  const fixed=new THREE.Group();fixed.name='safe-room-fixed-details';group.add(fixed);
  const gate=new THREE.Group();gate.name='safe-room-entry';gate.position.copy(world(ENTRY_GATE.x,ENTRY_GATE.z));group.add(gate);
  const frame=new THREE.Group();frame.position.copy(gate.position);fixed.add(frame);
  const opening=v.corridorWidth,head=Math.min(2.27,v.ceilingHeight-.22);
  for(const side of [-1,1]){
    timberBox(v,.08,head,.12,side*(opening/2+.016),head/2,0,frame);
    timberBox(v,.025,head+.075,.045,side*(opening/2+.066),(head+.075)/2,.055,frame);
  }
  timberBox(v,opening+.16,.085,.12,0,head+.032,0,frame,'x');
  const label=v.mesh(new THREE.PlaneGeometry(.77,.168),doorLabel(),frame);label.position.set(0,Math.min(head+.15,v.ceilingHeight-.10),.076);

  const wood=new THREE.MeshStandardMaterial({map:v.mat.wood.map?.clone()??null,color:0xc6b291,roughness:.91,envMapIntensity:.34});
  v.assetJobs.push(applyHotelAsset(wood,'referenceWood',{repeat:[1,1],normalScale:.34}));
  const iron=new THREE.MeshStandardMaterial({color:0x685c4c,metalness:.68,roughness:.80,envMapIntensity:.26});
  const nailGeometry=new THREE.CylinderGeometry(.009,.009,.005,7,1);nailGeometry.rotateX(Math.PI/2);
  const barrier=new THREE.Group();barrier.name='breakable-entry-boards';gate.add(barrier);
  const fragments=[],shadowMeshes=[];
  const rows=[{y:.43,angle:.045,h:.19},{y:.88,angle:-.075,h:.23},{y:1.38,angle:.055,h:.20},{y:1.94,angle:-.04,h:.18},{y:1.20,angle:.49,h:.145}];
  for(const [index,row] of rows.entries()){
    const length=(opening+.13)/Math.cos(row.angle),board=new THREE.Group();board.name=`entry-board-${index}`;board.position.set(0,row.y,index===4?.091:index*.009);board.rotation.z=row.angle;barrier.add(board);
    for(const {geometry,pivot,side} of splitBoardGeometry(length,row.h,.045,index)){
      const fragment=new THREE.Group();fragment.name=`entry-board-half-${index}-${side}`;fragment.position.x=pivot;board.add(fragment);
      const mesh=v.mesh(geometry,wood,fragment);mesh.castShadow=true;shadowMeshes.push(mesh);
      for(const y of [-row.h*.23,row.h*.23]){const nail=v.mesh(nailGeometry,iron,fragment);nail.position.set(side*length*.43-pivot,y,.027);}
      fragments.push({mesh,object:fragment,home:fragment.position.clone(),side,index,angle:row.angle,height:row.y});
    }
  }
  const chipShape=new THREE.Shape();chipShape.moveTo(-.022,-.052);chipShape.lineTo(.019,.041);chipShape.lineTo(.008,.067);chipShape.lineTo(-.009,.025);chipShape.closePath();
  const chipGeometry=new THREE.ExtrudeGeometry(chipShape,{depth:.008,bevelEnabled:false});
  const chips=new THREE.InstancedMesh(chipGeometry,wood,10);chips.name='entry-wood-splinters';chips.visible=false;chips.frustumCulled=false;gate.add(chips);
  const scratch=new THREE.Object3D();

  // A shallow wall console remains inside the player's normal wall clearance.
  // Its position follows the room, leaving the entrance axis entirely open.
  const consoleGroup=new THREE.Group();consoleGroup.name='safe-room-wall-console';
  consoleGroup.position.copy(world(SAFE_ROOM.minX-v.corridorWidth/(2*unit),(SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2));consoleGroup.rotation.y=Math.PI/2;fixed.add(consoleGroup);
  timberBox(v,1.18,.047,.23,0,.91,.12,consoleGroup,'x');
  timberBox(v,1.12,.15,.035,0,.815,.030,consoleGroup,'x');
  for(const x of [-.45,.45]){timberBox(v,.035,.30,.036,x,.73,.038,consoleGroup);const brace=timberBox(v,.028,.26,.028,x,.78,.12,consoleGroup);brace.rotation.x=-.48;}
  const ledger=v.box(.24,.027,.125,v.mat.cloth,-.19,.948,.13,consoleGroup);ledger.rotation.y=-.10;
  v.box(.247,.010,.132,v.mat.wood,-.19,.965,.13,consoleGroup);
  const bellBase=v.mesh(new THREE.CylinderGeometry(.050,.058,.014,20),v.mat.black,consoleGroup);bellBase.position.set(.33,.943,.13);
  const bell=v.mesh(new THREE.SphereGeometry(.048,16,8,0,Math.PI*2,0,Math.PI/2),v.mat.brass,consoleGroup);bell.position.set(.33,.950,.13);bell.scale.y=.65;
  const bellButton=v.mesh(new THREE.CylinderGeometry(.010,.008,.012,8),v.mat.brass,consoleGroup);bellButton.position.set(.33,.987,.13);

  // Light the player-facing side of the boards. The pooled spotlight aims past
  // the threshold at floor level, crossing the timber around chest height.
  const sconce=new THREE.Group();sconce.name='safe-room-entry-sconce';
  sconce.position.copy(gate.position).add(new THREE.Vector3(-opening/2,0,1.05));sconce.rotation.y=Math.PI/2;fixed.add(sconce);
  v.box(.115,.225,.025,v.mat.black,0,2.14,.018,sconce);
  v.box(.075,.17,.015,v.mat.brass,0,2.14,.038,sconce);
  v.box(.012,.018,.115,v.mat.brass,0,2.095,.101,sconce);
  const shade=v.mesh(new THREE.CylinderGeometry(.044,.097,.12,18,1,true),v.mat.brass,sconce);shade.position.set(0,2.15,.166);
  const bulb=v.mesh(new THREE.SphereGeometry(.035,12,8),v.mat.glow,sconce);bulb.position.set(0,2.09,.166);bulb.scale.y=.68;
  const entryLight=gate.position.clone().add(new THREE.Vector3(-opening/2+.18,2.105,1.05));
  entryLight.strength=6.5;entryLight.reach=3.8;entryLight.angle=.86;entryLight.warmth=0xffdfae;
  entryLight.aimX=.88;entryLight.aimZ=-2.85;entryLight.normalBias=.014;
  v.lampPositions.push(entryLight);
  batchStaticMeshes(fixed);fixed.updateMatrixWorld(true);
  fixed.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});

  let wasOpen=false;
  function update(game,dt){
    const opened=Boolean(game.entryOpened),time=opened?Math.max(0,Math.min(ENTRY_BREAK_SECONDS,game.entryBreakTime??0)):0;
    if(opened!==wasOpen){
      for(const mesh of shadowMeshes)mesh.castShadow=!opened;
      for(const light of v.lights??[])if(light.position.distanceToSquared(gate.position)<64)light.shadow.needsUpdate=true;
      wasOpen=opened;
    }
    barrier.visible=!opened||time<ENTRY_BREAK_SECONDS;chips.visible=opened&&time>0&&time<.64;
    if(!barrier.visible)return;
    const progress=time/ENTRY_BREAK_SECONDS,ease=1-Math.pow(1-progress,3);
    for(const part of fragments){
      const p=part.object;p.position.copy(part.home);p.rotation.set(0,0,0);
      if(opened){p.position.x+=part.side*(.15+part.index*.028)*ease;p.position.y-=part.height*progress*progress+progress*.12;p.position.z-=.18*ease+progress*.08;p.rotation.y=part.side*(1.25+part.index*.08)*ease;p.rotation.z=part.side*(.45+part.index*.07)*ease;p.rotation.x=-.20*ease;}
    }
    if(chips.visible){for(let i=0;i<chips.count;i++){
      const side=i%2?1:-1;scratch.position.set(side*(.04+time*(.36+(i%3)*.16)),.48+(i%5)*.33+time*.22-4.9*time*time,.08-time*(.10+(i%3)*.07));scratch.rotation.set(time*(2+i*.3),side*time*4,time*(i-4));scratch.scale.setScalar(.7+(i%3)*.2);scratch.updateMatrix();chips.setMatrixAt(i,scratch.matrix);
    }chips.instanceMatrix.needsUpdate=true;}
  }
  v.detailAudit.safeRoom={boards:rows.length,halves:fragments.length,breakSeconds:ENTRY_BREAK_SECONDS,consoleProjection:.235};
  return{group,gate,barrier,fragments,chips,update,duration:ENTRY_BREAK_SECONDS};
}
