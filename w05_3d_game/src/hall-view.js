import * as THREE from '../vendor/three.module.js';
import {hallDimensions,hallFurniture} from './hall-layout.js';
import {timberBox,ceilingBowl} from './hotel-joinery.js';
import {applyHotelAsset} from './hotel-assets.js';

// One watertight stepped ceiling replaces the original unbroken low plane.
// The horizontal partition has no overlaps; vertical risers close raised halls.
export function createHallCeiling(halls,{width,height,unit=2.4,corridorWidth=1.8,ceilingHeight=2.7,center}){
  const areas=halls.map(h=>{const b=h.bounds,d=hallDimensions(h,corridorWidth,unit,ceilingHeight);return{minX:b.minX-corridorWidth/(2*unit),maxX:b.maxX+corridorWidth/(2*unit),minZ:b.minZ-corridorWidth/(2*unit),maxZ:b.maxZ+corridorWidth/(2*unit),height:d.height};});
  const xs=[...new Set([-.5,width-.5,...areas.flatMap(a=>[a.minX,a.maxX])])].sort((a,b)=>a-b),zs=[...new Set([-.5,height-.5,...areas.flatMap(a=>[a.minZ,a.maxZ])])].sort((a,b)=>a-b);
  const positions=[],normals=[],uvs=[],indices=[],partitions=[];
  const quad=(points,normal)=>{const first=positions.length/3;for(const [x,y,z] of points){positions.push((x-center.x)*unit,y,(z-center.z)*unit);normals.push(...normal);if(normal[1])uvs.push((x+.5)/width,(z+.5)/height);else uvs.push(((normal[0]?z:x)+.5)/width,y/(height*unit));}indices.push(first,first+1,first+2,first,first+2,first+3);};
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
    const x0=xs[xi],x1=xs[xi+1],z0=zs[zi],z1=zs[zi+1],area=areas.find(a=>(x0+x1)/2>a.minX&&(x0+x1)/2<a.maxX&&(z0+z1)/2>a.minZ&&(z0+z1)/2<a.maxZ),y=area?.height??ceilingHeight;
    quad([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],[0,-1,0]);partitions.push({x0,x1,z0,z1,y});
  }
  for(const a of areas){const x0=a.minX,x1=a.maxX,z0=a.minZ,z1=a.maxZ,y=ceilingHeight,h=a.height;
    quad([[x0,y,z0],[x1,y,z0],[x1,h,z0],[x0,h,z0]],[0,0,1]);
    quad([[x1,y,z1],[x0,y,z1],[x0,h,z1],[x1,h,z1]],[0,0,-1]);
    quad([[x0,y,z1],[x0,y,z0],[x0,h,z0],[x0,h,z1]],[1,0,0]);
    quad([[x1,y,z0],[x1,y,z1],[x1,h,z1],[x1,h,z0]],[-1,0,0]);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.partitions=partitions;geometry.userData.hallRisers=areas.length*4;return geometry;
}

function signMaterial(title,subtitle){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#282820';c.fillRect(0,0,1024,256);c.strokeStyle='#9c875b';c.lineWidth=3;c.strokeRect(14,14,996,228);c.fillStyle='#c6b68d';c.textAlign='center';c.font='54px Microsoft YaHei';c.fillText(title,512,113);c.font='22px Georgia';c.fillText(subtitle,512,181);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map,roughness:.68,metalness:.08,envMapIntensity:.3});
}

export function buildHalls(v,world,unit,halls,isOpen){
  const group=new THREE.Group();group.name='hotel-halls';v.scene.add(group);
  const stone=new THREE.MeshStandardMaterial({color:0x75796d,roughness:.68,envMapIntensity:.35});
  const seat=new THREE.MeshStandardMaterial({color:0x424a43,roughness:.92,envMapIntensity:.16});
  const carpet=new THREE.MeshStandardMaterial({color:0x6c4042,roughness:.98,envMapIntensity:.08});
  const glass=new THREE.MeshBasicMaterial({color:new THREE.Color(4.3,3.7,2.8),toneMapped:false});
  if(halls.length)v.assetJobs.push(applyHotelAsset(stone,'plaster',{repeat:[8,8],normalScale:.06}),applyHotelAsset(seat,'fabric',{repeat:[2,2],normalScale:.2}),applyHotelAsset(carpet,'carpet',{repeat:[5,5],normalScale:.16}));
  const objects=[],lamps=[],hallGroups=[],portals=[],furniture=hallFurniture(halls,v.corridorWidth,unit,isOpen);
  const box=(w,h,d,mat,x,y,z,parent)=>{const mesh=v.box(w,h,d,mat,x,y,z,parent);mesh.castShadow=true;return mesh;};
  const strip=(w,d,mat,x,z,parent,y=.018)=>{const p=v.mesh(new THREE.PlaneGeometry(w,d),mat,parent);p.rotation.x=-Math.PI/2;p.position.set(x,y,z);return p;};
  for(const hall of halls){
    const d=hallDimensions(hall,v.corridorWidth,unit,v.ceilingHeight),root=new THREE.Group();root.name=`hall-${hall.id}`;root.position.copy(world(d.x,d.z));group.add(root);hallGroups.push({hall,root,dimensions:d});
    const stoneFloor=d.kind==='reception'||d.kind==='atrium';strip(d.width-.025,d.depth-.025,stoneFloor?stone:carpet,0,0,root,.009);
    const inset=Math.min(d.width,d.depth)*.15,rw=d.width-inset*2,rd=d.depth-inset*2;
    for(const side of [-1,1]){strip(rw,.035,v.mat.brass,0,side*rd/2,root);strip(.035,rd,v.mat.brass,side*rw/2,0,root);strip(rw+.15,.025,v.mat.trim,0,side*(rd/2+.09),root);strip(.025,rd+.15,v.mat.trim,side*(rw/2+.09),0,root);}
    if(d.kind==='banquet'){
      for(const z of [-rd*.30,0,rd*.30]){const medallion=v.mesh(new THREE.RingGeometry(.55,.59,32),v.mat.brass,root);medallion.rotation.x=-Math.PI/2;medallion.position.set(0,.020,z);const diamond=strip(.54,.54,v.mat.trim,0,z,root,.019);diamond.rotation.z=Math.PI/4;}
    }else if(d.kind==='atrium'){
      for(const x of [-rw*.28,rw*.28])strip(.035,rd,v.mat.brass,x,0,root,.020);
      for(const z of [-rd*.25,rd*.25])strip(rw,.035,v.mat.brass,0,z,root,.020);
    }
    // Thin perimeter mouldings and deep raised coffers describe the volume;
    // nothing crosses the central route below the original corridor ceiling.
    for(const side of [-1,1]){
      box(d.width,.12,.16,v.mat.trim,0,d.height-.10,side*(d.depth/2-.08),root);
      box(.16,.12,d.depth,v.mat.trim,side*(d.width/2-.08),d.height-.10,0,root);
      box(d.width,.045,.04,v.mat.brass,0,v.ceilingHeight+.03,side*(d.depth/2-.025),root);
      box(.04,.045,d.depth,v.mat.brass,side*(d.width/2-.025),v.ceilingHeight+.03,0,root);
    }
    // Frame actual openings only. Shallow jambs remain in the existing wall's
    // capsule clearance; no additional pillars obstruct the door aperture.
    for(const normal of [{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}]){
      const b=hall.bounds,alongX=normal.x===0,lo=alongX?b.minX:b.minZ,hi=alongX?b.maxX:b.maxZ,edge=alongX?(normal.z<0?b.minZ:b.maxZ):(normal.x<0?b.minX:b.maxX);
      const openings=[];let first=null;for(let t=lo;t<=hi+1;t++){const open=t<=hi&&isOpen(alongX?t:edge+normal.x,alongX?edge+normal.z:t);if(open&&first===null)first=t;if(!open&&first!==null){openings.push([first,t-1]);first=null;}}
      for(const [from,to] of openings){
        const tangent=(from+to)/2,span=(to-from)*unit+v.corridorWidth,portal=new THREE.Group(),x=alongX?tangent:edge+normal.x*v.corridorWidth/(2*unit),z=alongX?edge+normal.z*v.corridorWidth/(2*unit):tangent;
        portal.name=`${hall.id}-open-portal`;portal.position.copy(world(x,z));portal.rotation.y=Math.atan2(-normal.x,-normal.z);group.add(portal);
        for(const side of [-1,1]){box(.12,v.ceilingHeight,.07,d.kind==='atrium'?stone:v.mat.wood,side*(span/2+.075),v.ceilingHeight/2,.025,portal);box(.018,v.ceilingHeight-.16,.015,v.mat.brass,side*(span/2+.052),v.ceilingHeight/2,.068,portal);}
        box(span+.28,.14,.15,d.kind==='atrium'?stone:v.mat.wood,0,v.ceilingHeight+.065,.035,portal);box(span+.34,.025,.17,v.mat.brass,0,v.ceilingHeight+.145,.035,portal);
        portals.push({hall:hall.id,span,object:portal});
      }
    }
    const columns=d.width>18?3:2,rows=d.depth>19?3:2;
    for(let ix=0;ix<columns;ix++)for(let iz=0;iz<rows;iz++){
      const x=(ix+.5)*d.width/columns-d.width/2,z=(iz+.5)*d.depth/rows-d.depth/2,lamp=new THREE.Group();lamp.name=`${hall.id}-light-${ix}-${iz}`;lamp.position.set(x,d.height-.10,z);root.add(lamp);
      if(d.kind==='banquet'){
        box(.045,.34,.045,v.mat.brass,0,-.17,0,lamp);
        for(const radius of [.58,.65]){const ring=v.mesh(new THREE.TorusGeometry(radius,.018,6,32),v.mat.brass,lamp);ring.rotation.x=Math.PI/2;ring.position.y=-.45;ring.castShadow=true;}
        for(let i=0;i<6;i++){const a=i*Math.PI/3,cx=Math.cos(a)*.60,cz=Math.sin(a)*.60;box(.018,.25,.018,v.mat.brass,cx,-.325,cz,lamp);const shade=v.mesh(new THREE.CylinderGeometry(.08,.105,.16,12),glass,lamp);shade.position.set(cx,-.48,cz);}
      }else if(d.kind==='atrium'){
        box(1.15,.11,.34,v.mat.brass,0,-.10,0,lamp);box(1.07,.045,.28,glass,0,-.175,0,lamp);for(const sx of [-.35,0,.35])box(.016,.052,.29,v.mat.brass,sx,-.178,0,lamp);
      }else ceilingBowl(v,lamp,d.kind==='reception'?.34:.29);
      const position=world(d.x+x/unit,d.z+z/unit,d.height-(d.kind==='banquet'?.65:.26));
      Object.assign(position,{hall:hall.id,strength:d.kind==='banquet'?34:29,reach:10,angle:1.30,penumbra:.42,warmth:d.kind==='atrium'?0xe2e8d5:0xffe2b6,normalBias:.018});v.lampPositions.push(position);lamps.push(position);
    }
  }
  for(const item of furniture){
    const root=new THREE.Group();root.name=item.id;root.position.copy(world(item.x,item.z));root.rotation.y=item.angle;group.add(root);const w=item.width,d=item.depth;
    if(item.kind==='counter'){
      timberBox(v,w-.04,.94,d-.02,0,.47,0,root,'x');box(w,.065,d,stone,0,1.045,0,root);
      for(const sx of [-.33,.33]){box(.012,.67,.012,v.mat.brass,sx,.53,d/2-.007,root);}
      box(w-.10,.018,.012,v.mat.brass,0,.18,d/2-.007,root);box(.28,.015,.12,v.mat.black,.25,1.086,0,root);
      const sign=v.mesh(new THREE.PlaneGeometry(w-.08,.43),signMaterial('回声旅馆','ECHO ARCHIVE  /  RECEPTION'),root);sign.position.set(0,2.08,-d/2+.025);
      box(w,.49,.022,v.mat.wood,0,2.08,-d/2+.012,root);
    }else if(item.kind==='sofa'){
      for(const x of [-w/2+.09,w/2-.09])for(const z of [-d/2+.08,d/2-.08])timberBox(v,.055,.16,.055,x,.08,z,root);
      box(w-.04,.15,d-.035,v.mat.wood,0,.22,0,root);
      box(w-.09,.38,.14,seat,0,.65,-d/2+.08,root);
      for(const side of [-1,1]){box(w/2-.075,.13,d-.17,seat,side*(w/4-.02),.385,.045,root);box(.09,.39,d-.02,seat,side*(w/2-.05),.50,0,root);}
    }else if(item.kind==='floor-lamp'){
      box(.32,.035,.32,v.mat.black,0,.018,0,root);box(.035,1.50,.035,v.mat.brass,0,.77,0,root);
      const shade=v.mesh(new THREE.CylinderGeometry(.13,.165,.34,16),seat,root);shade.position.y=1.63;
      const diffuser=v.mesh(new THREE.CircleGeometry(.145,16),glass,root);diffuser.rotation.x=Math.PI/2;diffuser.position.y=1.465;
      const pos=world(item.x,item.z,1.45);Object.assign(pos,{hall:item.hall,strength:3.8,reach:3,angle:.95,penumbra:.6,warmth:0xffdfad});v.lampPositions.push(pos);lamps.push(pos);
    }else if(item.kind==='pilaster'){
      const hall=halls.find(h=>h.id===item.hall),height=hallDimensions(hall,v.corridorWidth,unit,v.ceilingHeight).height;
      box(w-.10,height-.30,d-.03,stone,0,(height-.30)/2+.15,0,root);for(const y of [.085,height-.08])box(w,.16,d,v.mat.trim,0,y,0,root);
      for(const x of [-.085,.085])box(.018,height-.42,.012,v.mat.brass,x,height/2,d/2-.007,root);
    }else{
      box(w-.07,1.03,d-.025,stone,0,.515,0,root);box(w,.065,d,v.mat.black,0,1.065,0,root);
      const sculpture=v.mesh(new THREE.TorusGeometry(.15,.025,8,24),v.mat.brass,root);sculpture.position.y=1.40;sculpture.castShadow=true;box(.035,.15,.035,v.mat.brass,0,1.16,0,root);
    }
    root.updateMatrixWorld(true);objects.push({spec:item,bounds:new THREE.Box3().setFromObject(root)});
  }
  v.detailAudit.halls={count:halls.length,furniture:objects.length,lamps:lamps.length,portals:portals.length};return{group,halls:hallGroups,furniture:objects,lamps,portals};
}
