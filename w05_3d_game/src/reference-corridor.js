import * as THREE from '../vendor/three.module.js';
import {isOpen,edgeIsOpen,START} from './world.js';
import {applyHotelAsset} from './hotel-assets.js';
import {contactShade} from './hotel-materials.js';
import {timberUV as woodUV,timberBox,paneledDoor,ceilingBowl,flutedPilaster} from './hotel-joinery.js';

const linked=(x,z,dx,dz)=>edgeIsOpen({x,z},{x:x+dx,z:z+dz});
const cornerAt=(x,z)=>isOpen(x,z)&&(linked(x,z,-1,0)||linked(x,z,1,0))&&(linked(x,z,0,-1)||linked(x,z,0,1));

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

// A hand-built, walkable entrance composition. Everything is attached to an
// existing solid wall or above eye height; no gameplay tile or collider changes.
export function decorateReferenceCorridor(v,world,unit){
  if(START.x!==1||START.z!==1)return null;
  const height=v.ceilingHeight,wood=v.mat.wood,brass=v.mat.brass,black=v.mat.black,half=v.corridorWidth/2;
  const root=new THREE.Group();root.name='reference-entrance-corridor';v.scene.add(root);
  const shade=contactShade(),corbel=corbelGeometry(),leaf=leafGeometry();
  const wb=(w,h,d,x,y,z,parent=root,axis='y')=>timberBox(v,w,h,d,x,y,z,parent,axis);
  const wall=(x,side)=>{const g=new THREE.Group();g.position.copy(world(x,1+side*half/unit));if(side>0)g.rotation.y=Math.PI;root.add(g);return g;};
  const contact=(parent,w,h,x,y,z=.006)=>{const m=v.mesh(new THREE.PlaneGeometry(w,h),shade,parent);m.position.set(x,y,z);return m;};
  const cylinder=(parent,radius,length,material,x,y,z,horizontal=false)=>{const m=v.mesh(new THREE.CylinderGeometry(radius,radius,length,8,1),material,parent);m.position.set(x,y,z);if(horizontal)m.rotation.z=Math.PI/2;return m;};

  // Foreground left: blocked gallery opening with deep joinery and diagonal brace.
  const bay=wall(1.48,-1),bayWidth=2.12,bayTop=height-.035;
  // The narrow recess is made from the same lit wallpaper as the wall shell.
  const paperBottom=.999,paperHeight=Math.min(1.65,height-1.045),paperWidth=paperHeight*.75/1.65,paperY=paperBottom+paperHeight/2;
  const paperGeometry=new THREE.PlaneGeometry(paperWidth,paperHeight),uv=paperGeometry.attributes.uv,p=paperGeometry.attributes.position;
  for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+paperWidth/2)/unit,(p.getY(i)+paperY)/height);uv.needsUpdate=true;
  const panel=v.mesh(paperGeometry,v.mat.paper,bay);panel.name='wallpaper-recess';panel.position.set(0,paperY,.004);
  for(const side of [-1,1]){
    wb(.028,paperHeight+.054,.028,side*(paperWidth/2+.012),paperY,.025,bay);
    wb(paperWidth+.052,.028,.028,0,paperY+side*(paperHeight/2+.012),.025,bay,'x');
  }
  for(const side of [-1,1]){
    const px=side*bayWidth/2;
    flutedPilaster(v,bay,.175,height-.22,.135,px,.082);
    wb(.225,.17,.18,px,.095,.10,bay,'x');wb(.205,.035,.192,px,.195,.101,bay,'x');
    wb(.235,.052,.19,px,.77,.101,bay,'x');wb(.19,.045,.155,px,.815,.085,bay,'x');
    wb(.245,.07,.19,px,height-.34,.101,bay,'x');wb(.225,.045,.17,px,height-.28,.09,bay,'x');
    const bracket=v.mesh(corbel,wood,bay);bracket.position.set(px,height-.53,.031);bracket.castShadow=true;
  }
  for(const [y,w] of [[.58,1.97],[1.18,1.97],[1.89,1.97]]){
    wb(w,.105,.085,0,y,.103,bay,'x');wb(w,.016,.095,0,y+.051,.106,bay,'x');
  }
  const brace=wb(1.99,.112,.07,0,.69,.15,bay,'x');brace.rotation.z=.23;
  const bayHeader=v.mesh(headerGeometry(bayWidth,bayTop,.16),wood,bay);bayHeader.position.z=.025;bayHeader.castShadow=true;

  // The entrance uses the same joinery proportions and working hardware as the guest rooms.
  const door=wall(1.80,1);paneledDoor(v,door,217,{height:Math.min(2.27,height-.23)});

  // Shared artwork sources, with a shallow carved crest instead of gold blocks.
  const artMaterials=[0,1,2].map(index=>{const material=new THREE.MeshStandardMaterial({color:0xd2c4a8,roughness:.69,envMapIntensity:.08});v.assetJobs.push(applyHotelAsset(material,'art',{repeat:[1/3-.002,1],offset:[index/3+.001,0]}));return material;});
  const picture=(x,side,index,w=.62,h=.88)=>{
    const g=wall(x,side);g.position.y=1.72;contact(g,w+.26,h+.26,0,0,.009);
    v.box(w+.14,h+.14,.020,black,0,0,.027,g);v.box(w+.065,h+.065,.016,black,0,0,.065,g);
    for(const sign of [-1,1]){
      wb(.055,h+.14,.045,sign*(w/2+.0425),0,.034,g);wb(w+.03,.055,.045,0,sign*(h/2+.0425),.034,g,'x');
      const edge=v.box(.028,h+.12,.041,brass,sign*(w/2+.045),0,.081,g);edge.castShadow=true;
      const rail=v.box(w+.062,.028,.041,brass,0,sign*(h/2+.046),.081,g);rail.castShadow=true;
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
    if(linked(x,1,0,side)||isOpen(x,1+side))continue;const g=wall(x,side);
    wb(unit,.023,.043,0,.96,.030,g,'x');wb(unit,.014,.035,0,.995,.027,g,'x');wb(unit,.024,.055,0,.126,.034,g,'x');
    for(const [y,d] of [[height-.100,.070],[height-.147,.055],[height-.183,.035]]){wb(unit,.022,d,0,y,d/2+.006,g,'x');cylinder(g,.006,unit,wood,0,y-.017,d+.006,true);}
  }

  let domeCount=0;
  for(const x of [1,2.7,4,5]){
    const isCorner=Number.isInteger(x)&&cornerAt(x,1);
    const c=world(x,1),lamp=new THREE.Group();lamp.position.set(c.x,height-.047,c.z);root.add(lamp);
    ceilingBowl(v,lamp,.245);
    // Reuse fixture registration at intersections; the shared light pool stays fixed.
    let position=v.lampPositions.find(p=>Math.abs(p.x-c.x)<.001&&Math.abs(p.z-c.z)<.001);
    if(!position){position=new THREE.Vector3(c.x,height-.13,c.z);v.lampPositions.push(position);}
    position.y=height-.13;position.isCorner=isCorner;position.strength=18;position.reach=5.5;position.angle=1.36;position.warmth=0xffe9c2;position.normalBias=.06;
    domeCount++;
  }
  v.detailAudit.referenceCorridor={woodBay:1,doors:1,pictures:3,portals:2,domes:domeCount,maxProjection:.20,wallpaperRecesses:1};
  return root;
}
