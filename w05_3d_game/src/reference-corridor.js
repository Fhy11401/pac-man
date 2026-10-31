import * as THREE from '../vendor/three.module.js';
import {isOpen} from './world.js';
import {applyHotelAsset} from './hotel-assets.js';
import {contactShade} from './hotel-materials.js';
import {createReferencePhotoMaterial} from './reference-photo.js';

const cornerAt=(x,z)=>isOpen(x,z)&&(isOpen(x-1,z)||isOpen(x+1,z))&&(isOpen(x,z-1)||isOpen(x,z+1));

// Keep texture density in metres and the wood's longitudinal grain on the long
// axis of each member; a tall pilaster and a horizontal rail cannot share box UVs.
function woodUV(geometry,axis='y'){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  if(!uv)return;geometry.computeBoundingBox();const min=geometry.boundingBox.min;
  for(let i=0;i<p.count;i++){
    const along=axis==='x'?p.getX(i)-min.x:p.getY(i)-min.y;
    const cross=axis==='x'?(Math.abs(n.getY(i))>.5?p.getZ(i)-min.z:p.getY(i)-min.y):(Math.abs(n.getX(i))>.5?p.getZ(i)-min.z:p.getX(i)-min.x);
    uv.setXY(i,cross/.36,along/1.9);
  }
  uv.needsUpdate=true;
}

function headerGeometry(width,height,depth=.17){
  const half=width/2,s=new THREE.Shape();
  s.moveTo(-half-.05,height);s.lineTo(half+.05,height);s.lineTo(half+.05,height-.50);s.lineTo(half-.095,height-.50);
  s.bezierCurveTo(half-.095,height-.28,half-.25,height-.20,half-.34,height-.19);s.lineTo(-half+.34,height-.19);
  s.bezierCurveTo(-half+.25,height-.20,-half+.095,height-.28,-half+.095,height-.50);s.lineTo(-half-.05,height-.50);s.closePath();
  const geometry=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:8});woodUV(geometry,'x');return geometry;
}

function corbelGeometry(){
  // Carved ogee bracket with a solid silhouette and a recessed waist, not beads.
  const s=new THREE.Shape();s.moveTo(0,.20);s.lineTo(.155,.20);s.lineTo(.155,.145);
  s.bezierCurveTo(.15,.075,.057,.064,.065,-.018);s.bezierCurveTo(.072,-.09,.138,-.108,.108,-.16);
  s.quadraticCurveTo(.080,-.209,.025,-.20);s.lineTo(0,-.20);s.closePath();
  const geometry=new THREE.ExtrudeGeometry(s,{depth:.105,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:1,curveSegments:8});
  geometry.rotateY(-Math.PI/2);geometry.translate(.0525,0,0);woodUV(geometry);return geometry;
}

function leafGeometry(){
  const s=new THREE.Shape();s.moveTo(0,-.045);s.bezierCurveTo(.027,-.022,.027,.013,0,.045);s.bezierCurveTo(-.014,.018,-.020,-.018,0,-.045);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.004,bevelEnabled:true,bevelSize:.0015,bevelThickness:.002,bevelSegments:1,curveSegments:5});
}

function roomNumber(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d');
  c.fillStyle='#241f18';c.fillRect(0,0,256,128);c.strokeStyle='#8c7953';c.lineWidth=5;c.strokeRect(7,7,242,114);c.lineWidth=1;c.strokeRect(16,16,224,96);
  c.fillStyle='#c8b985';c.textAlign='center';c.font='56px Georgia';c.fillText('???',128,85);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:texture,roughness:.57,metalness:.18,envMapIntensity:.26});
}

function bowlGeometry(){
  const g=new THREE.SphereGeometry(.245,28,12,0,Math.PI*2,0,Math.PI/2),p=g.attributes.position,colours=[];
  const edge=new THREE.Color('#c8b98d'),centre=new THREE.Color('#fff4d5'),colour=new THREE.Color();
  for(let i=0;i<p.count;i++){colour.copy(edge).lerp(centre,Math.sqrt(Math.max(0,p.getY(i)/.245)));colours.push(colour.r,colour.g,colour.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.rotateX(Math.PI);g.scale(1,.47,1);return g;
}

// A hand-built, walkable entrance composition. Everything is attached to an
// existing solid wall or above eye height; no gameplay tile or collider changes.
export function decorateReferenceCorridor(v,world,unit){
  const height=v.ceilingHeight,wood=v.mat.wood,brass=v.mat.brass,black=v.mat.black,half=v.corridorWidth/2;
  const root=new THREE.Group();root.name='reference-entrance-corridor';v.scene.add(root);
  const shade=contactShade(),corbel=corbelGeometry(),leaf=leafGeometry();
  const wb=(w,h,d,x,y,z,parent=root,axis='y')=>{const m=v.box(w,h,d,wood,x,y,z,parent);woodUV(m.geometry,axis);m.castShadow=true;return m;};
  const wall=(x,side)=>{const g=new THREE.Group();g.position.copy(world(x,1+side*half/unit));if(side>0)g.rotation.y=Math.PI;root.add(g);return g;};
  const contact=(parent,w,h,x,y,z=.006)=>{const m=v.mesh(new THREE.PlaneGeometry(w,h),shade,parent);m.position.set(x,y,z);return m;};
  const cylinder=(parent,radius,length,material,x,y,z,horizontal=false)=>{const m=v.mesh(new THREE.CylinderGeometry(radius,radius,length,8,1),material,parent);m.position.set(x,y,z);if(horizontal)m.rotation.z=Math.PI/2;return m;};

  // Foreground left: blocked gallery opening with deep joinery and diagonal brace.
  const bay=wall(1.48,-1),bayWidth=2.12,bayTop=height-.035;
  contact(bay,bayWidth+.16,height-.10,0,height/2,.008);
  // One narrow recess keeps actual pixels from the supplied photograph. The
  // neighboring wallpaper uses the separately rebuilt seamless material.
  const photoBottom=.999,photoHeight=Math.min(1.65,height-1.045),photoWidth=photoHeight*.75/1.65,photoY=photoBottom+photoHeight/2;
  const photo=v.mesh(new THREE.PlaneGeometry(photoWidth,photoHeight),createReferencePhotoMaterial(v.assetJobs),bay);
  photo.name='original-reference-wallpaper-recess';photo.position.set(0,photoY,.004);
  for(const side of [-1,1]){
    wb(.028,photoHeight+.054,.028,side*(photoWidth/2+.012),photoY,.025,bay);
    wb(photoWidth+.052,.028,.028,0,photoY+side*(photoHeight/2+.012),.025,bay,'x');
  }
  for(const side of [-1,1]){
    const px=side*bayWidth/2;
    wb(.175,height-.22,.135,px,(height-.22)/2,.082,bay);
    wb(.225,.17,.18,px,.095,.10,bay,'x');wb(.205,.035,.192,px,.195,.101,bay,'x');
    wb(.235,.052,.19,px,.77,.101,bay,'x');wb(.19,.045,.155,px,.815,.085,bay,'x');
    // Paired recessed flutes remain inside the column's maximum .20 m projection.
    for(const offset of [-.048,.048])cylinder(bay,.006,height-1.06,black,px+offset,(height-1.06)/2+.86,.153);
    wb(.245,.07,.19,px,height-.34,.101,bay,'x');wb(.225,.045,.17,px,height-.28,.09,bay,'x');
    const bracket=v.mesh(corbel,wood,bay);bracket.position.set(px,height-.53,.031);bracket.castShadow=true;
  }
  for(const [y,w] of [[.58,1.97],[1.18,1.97],[1.89,1.97]]){
    wb(w,.105,.085,0,y,.103,bay,'x');wb(w,.016,.095,0,y+.051,.106,bay,'x');
  }
  const brace=wb(1.99,.112,.07,0,.69,.15,bay,'x');brace.rotation.z=.23;
  const bayHeader=v.mesh(headerGeometry(bayWidth,bayTop,.16),wood,bay);bayHeader.position.z=.025;bayHeader.castShadow=true;

  // Mid-ground right: a closed timber leaf sits well behind layered jambs.
  const door=wall(1.80,1),doorHeight=Math.min(2.31,height-.23);
  v.box(1.06,doorHeight+.04,.018,black,0,doorHeight/2,.012,door);
  wb(.94,doorHeight,.048,0,doorHeight/2,.041,door);
  for(const side of [-1,1]){
    wb(.13,doorHeight+.085,.15,side*.535,(doorHeight+.085)/2,.104,door);
    wb(.036,doorHeight+.16,.060,side*.621,(doorHeight+.16)/2,.047,door);
    wb(.175,.22,.18,side*.535,.11,.105,door,'x');
    cylinder(door,.008,doorHeight+.04,wood,side*.466,(doorHeight+.04)/2,.185);
  }
  wb(1.205,.115,.18,0,doorHeight+.053,.106,door,'x');wb(1.30,.032,.075,0,doorHeight+.124,.055,door,'x');
  for(const [centreY,panelHeight] of [[doorHeight*.67,doorHeight*.52],[doorHeight*.20,doorHeight*.25]]){
    v.box(.735,panelHeight,.012,black,0,centreY,.070,door);wb(.679,panelHeight-.058,.017,0,centreY,.079,door);
    for(const side of [-1,1]){wb(.024,panelHeight+.012,.034,side*.362,centreY,.087,door);wb(.74,.024,.034,0,centreY+side*panelHeight/2,.087,door,'x');}
  }
  const number=v.mesh(new THREE.PlaneGeometry(.267,.133),roomNumber(),door);number.position.set(0,doorHeight*.735,.100);
  v.box(.044,.16,.018,brass,.327,.98,.091,door);const handle=v.mesh(new THREE.CapsuleGeometry(.012,.103,4,10),brass,door);handle.rotation.z=Math.PI/2;handle.position.set(.281,.98,.128);

  // Shared artwork sources, with a shallow carved crest instead of gold blocks.
  const artMaterials=[0,1,2].map(index=>{const material=new THREE.MeshStandardMaterial({color:0xd2c4a8,roughness:.69,envMapIntensity:.08});v.assetJobs.push(applyHotelAsset(material,'art',{repeat:[1/3-.002,1],offset:[index/3+.001,0]}));return material;});
  const picture=(x,side,index,w=.62,h=.88)=>{
    const g=wall(x,side);g.position.y=1.72;contact(g,w+.26,h+.26,0,0,.009);
    wb(w+.14,h+.14,.045,0,0,.034,g);v.box(w+.065,h+.065,.016,black,0,0,.065,g);
    for(const sign of [-1,1]){
      const edge=v.box(.028,h+.12,.041,brass,sign*(w/2+.045),0,.081,g);edge.castShadow=true;
      const rail=v.box(w+.118,.028,.041,brass,0,sign*(h/2+.045),.081,g);rail.castShadow=true;
      cylinder(g,.006,h+.045,brass,sign*(w/2+.015),0,.108);cylinder(g,.006,w+.04,brass,0,sign*(h/2+.015),.108,true);
      for(const sx of [-1,1]){const ornament=v.mesh(leaf,brass,g);ornament.position.set(sx*(w/2+.033),sign*(h/2+.035),.109);ornament.rotation.z=-sx*sign*.58;}
    }
    const image=v.mesh(new THREE.PlaneGeometry(w,h),artMaterials[index],g);image.position.z=.087;
  };
  picture(2.50,-1,1,.62,.90);picture(2.68,1,2,.56,.79);picture(4.20,-1,0,.59,.84);

  // A deep portal sits where both sides are solid. The later header is overhead
  // only, leaving the southern intersection at x=4..5 entirely walkable.
  for(const [x,posts] of [[2.95,true],[4.65,false]]){
    const portal=new THREE.Group();portal.position.copy(world(x,1));portal.rotation.y=Math.PI/2;root.add(portal);
    const lintel=v.mesh(headerGeometry(v.corridorWidth,height-.015,.17),wood,portal);lintel.position.z=-.085;lintel.castShadow=true;
    if(posts)for(const side of [-1,1]){
      const px=side*(half-.057);wb(.142,height-.31,.145,px,(height-.31)/2,0,portal);
      wb(.208,.15,.19,px,.08,0,portal,'x');wb(.195,.045,.18,px,.78,0,portal,'x');
      wb(.216,.07,.19,px,height-.44,0,portal,'x');
      const bracket=v.mesh(corbel,wood,portal);bracket.position.set(px,height-.65,-.02);bracket.castShadow=true;
    }
  }

  // Long thin mouldings follow existing solid wall faces; never span open exits.
  for(let x=1;x<=5;x++)for(const side of [-1,1]){
    if(isOpen(x,1+side))continue;const g=wall(x,side);
    wb(unit,.023,.043,0,.96,.030,g,'x');wb(unit,.014,.035,0,.995,.027,g,'x');wb(unit,.024,.055,0,.126,.034,g,'x');
    for(const [y,d] of [[height-.100,.070],[height-.147,.055],[height-.183,.035]]){wb(unit,.022,d,0,y,d/2+.006,g,'x');cylinder(g,.006,unit,wood,0,y-.017,d+.006,true);}
  }

  const glass=bowlGeometry(),glassMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(3.6,3.6,3.6),vertexColors:true,toneMapped:false});
  let domeCount=0;
  for(const x of [1,2.7,4,5]){
    const isCorner=Number.isInteger(x)&&cornerAt(x,1);
    const c=world(x,1),lamp=new THREE.Group();lamp.position.set(c.x,height-.065,c.z);root.add(lamp);
    const rose=v.mesh(new THREE.CylinderGeometry(.262,.262,.027,28),brass,lamp);rose.position.y=.024;
    v.mesh(glass,glassMaterial,lamp);
    for(const [radius,tube,y] of [[.249,.010,0],[.257,.005,.016]]){const rim=v.mesh(new THREE.TorusGeometry(radius,tube,6,32),brass,lamp);rim.rotation.x=Math.PI/2;rim.position.y=y;}
    for(let k=0;k<3;k++){
      const angle=k*Math.PI*2/3,points=[];for(let i=0;i<=8;i++){const a=i/8*Math.PI/2,r=.246*Math.cos(a);points.push(new THREE.Vector3(Math.cos(angle)*r,-.118*Math.sin(a),Math.sin(angle)*r));}
      v.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.0045,5,false),brass,lamp);
    }
    const finial=v.mesh(new THREE.CylinderGeometry(.020,.012,.022,12),brass,lamp);finial.position.y=-.124;
    // The parent may retain or skip the old fixture registration; never duplicate it.
    let position=v.lampPositions.find(p=>Math.abs(p.x-c.x)<.001&&Math.abs(p.z-c.z)<.001);
    if(!position){position=new THREE.Vector3(c.x,height-.13,c.z);v.lampPositions.push(position);}
    position.y=height-.13;position.isCorner=isCorner;position.strength=18;position.reach=5.5;position.angle=1.36;position.warmth=0xffe9c2;position.normalBias=.06;
    domeCount++;
  }
  v.detailAudit.referenceCorridor={woodBay:1,doors:1,pictures:3,portals:2,domes:domeCount,maxProjection:.20,originalPhotoRecesses:1};
  return root;
}
