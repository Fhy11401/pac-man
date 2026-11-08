import * as THREE from '../vendor/three.module.js';
import {MAP,SAFE_ROOM,isInSafeRoom,isOpen,edgeIsOpen} from './world.js';
import {regionFor,buildLandmarkPlan} from './map-landmarks.js';
import {contactShade} from './hotel-materials.js';
import {applyHotelAsset} from './hotel-assets.js';
import {timberBox,paneledDoor,serviceCabinet,ceilingBowl} from './hotel-joinery.js';

export const createHotelDoor=(v,parent,number,options)=>paneledDoor(v,parent,number,options);

function painting(index,assetJobs){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;
  const c=canvas.getContext('2d'),sky=c.createLinearGradient(0,0,0,384);
  sky.addColorStop(0,['#253c43','#49323a','#2d344d'][index]);sky.addColorStop(.6,'#a8916c');sky.addColorStop(1,'#171e22');
  c.fillStyle=sky;c.fillRect(0,0,256,384);c.fillStyle='#d9c8a28c';c.beginPath();c.arc(166,79,28,0,Math.PI*2);c.fill();
  for(let layer=0;layer<3;layer++){
    c.fillStyle=['#526365','#35474b','#192c32'][layer];c.beginPath();c.moveTo(0,384);
    for(let x=0;x<=256;x+=8)c.lineTo(x,188+layer*46+Math.sin(x*.022+index+layer)*22+Math.sin(x*.053+layer)*10);
    c.lineTo(256,384);c.fill();
  }
  if(index===0){
    c.fillStyle='#20292a';c.fillRect(67,177,122,94);c.beginPath();c.moveTo(52,178);c.lineTo(125,126);c.lineTo(204,178);c.fill();c.fillRect(86,137,14,42);c.fillRect(159,141,12,36);
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){c.fillStyle=(row+col)%3?'#bca477':'#26383b';c.fillRect(78+col*21,187+row*25,8,13);}
  }else if(index===1){
    c.strokeStyle='#192427';c.lineWidth=6;c.beginPath();c.moveTo(80,340);c.bezierCurveTo(106,263,71,205,95,110);c.stroke();c.lineWidth=2;
    for(let i=0;i<9;i++){const y=140+i*18,side=i%2?1:-1;c.beginPath();c.moveTo(90,y+40);c.lineTo(90+side*(23+i*3),y);c.lineTo(90+side*(40+i*3),y-12);c.stroke();}
    c.fillStyle='#202d2c';c.fillRect(161,265,37,3);c.fillRect(166,267,3,17);c.fillRect(191,267,3,17);
  }else{
    c.fillStyle='#42383a';c.beginPath();c.ellipse(133,174,45,62,-.1,0,Math.PI*2);c.fill();c.fillStyle='#1c2026';c.beginPath();c.moveTo(45,384);c.bezierCurveTo(43,244,210,229,224,384);c.fill();
    c.fillStyle='#a18c7144';c.beginPath();c.ellipse(139,180,25,42,.08,0,Math.PI*2);c.fill();c.fillStyle='#172126';c.fillRect(124,164,13,4);c.fillRect(147,165,12,4);
  }
  let seed=918+index;for(let n=0;n<12000;n++){seed=(seed*1664525+1013904223)>>>0;const x=seed%256;seed=(seed*1664525+1013904223)>>>0;const y=seed%384;c.fillStyle=n%2?'#f9d99a0b':'#100b160e';c.fillRect(x,y,2+n%4,1);}
  const shade=c.createRadialGradient(128,175,40,128,175,230);shade.addColorStop(0,'#0000');shade.addColorStop(1,'#0b080ca0');c.fillStyle=shade;c.fillRect(0,0,256,384);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.68});
  assetJobs.push(applyHotelAsset(material,'art',{repeat:[1/3-.002,1],offset:[index/3+.001,0],bump:.0006}));
  return material;
}
function plaque(text,sub){
  const c=document.createElement('canvas');c.width=512;c.height=160;const x=c.getContext('2d');
  x.fillStyle='#20191b';x.fillRect(0,0,512,160);x.strokeStyle='#a68c5f';x.lineWidth=3;x.strokeRect(7,7,498,146);x.lineWidth=1;x.strokeRect(15,15,482,130);
  x.fillStyle='#dfcda3';x.textAlign='center';x.font='32px SimSun';x.fillText(text,256,73);x.font='16px Georgia';x.fillStyle='#b8a789';x.fillText(sub,256,114);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:t,roughness:.65});
}

function ceilingBounce(){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,2,64,64,64);
  g.addColorStop(0,'#f8e8b34d');g.addColorStop(.35,'#e9d8a62b');g.addColorStop(1,'#d8c79200');x.fillStyle=g;x.fillRect(0,0,128,128);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
}

function archGeometry(width,height){
  const half=width/2+.015,s=new THREE.Shape();
  s.moveTo(-half-.06,height-.02);s.lineTo(half+.06,height-.02);s.lineTo(half+.06,height-.34);s.lineTo(half-.025,height-.34);
  s.quadraticCurveTo(half-.025,height-.16,half-.22,height-.13);s.lineTo(-half+.22,height-.13);
  s.quadraticCurveTo(-half+.025,height-.16,-half+.025,height-.34);s.lineTo(-half-.06,height-.34);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.085,bevelEnabled:false,curveSegments:8});
}

const linked=(x,z,dx,dz)=>edgeIsOpen({x,z},{x:x+dx,z:z+dz});
const cornerAt=(x,z)=>isOpen(x,z)&&(linked(x,z,-1,0)||linked(x,z,1,0))&&(linked(x,z,0,-1)||linked(x,z,0,1));

// Every ornament sits against a wall or above eye level; the playable maze stays unchanged.
export function decorateHotel(v,world,unit){
  const ivory=v.mat.trim,height=v.ceilingHeight;
  const woodBox=(w,h,d,x,y,z,parent)=>timberBox(v,w,h,d,x,y,z,parent,w>h?'x':'y');
  const art=[0,1,2].map(i=>painting(i,v.assetJobs)),signs=[plaque('西翼 · 客房','WEST WING  /  GUEST ROOMS'),plaque('中央 · 大厅','CENTRAL HALL'),plaque('东翼 · 画廊','EAST WING  /  GALLERY')];
  const shade=contactShade();let luggageCount=0,paintingCount=0,cabinetCount=0;
  const bounce=ceilingBounce(),arch=archGeometry(v.corridorWidth,height);v.detailAudit.arches=0;v.detailAudit.squareLamps=0;v.detailAudit.roundLamps=0;v.detailAudit.raisedWallPanels=0;
  const mouldingGeometry=new THREE.CylinderGeometry(.007,.007,unit,6,1),pictureBead=new THREE.CylinderGeometry(.005,.005,1,6,1),frameStud=new THREE.SphereGeometry(.0075,8,4);
  const signSites=buildLandmarkPlan(),signCounts=[0,0,0],archRegions=new Set();let roomLampPlaced=false;
  MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
    if(tile==='#'||v.hallAt?.(x,z))return;
    const center=world(x,z),region=regionFor(x),roomCell=x>=SAFE_ROOM.minX&&x<=SAFE_ROOM.maxX&&z>=SAFE_ROOM.minZ&&z<=SAFE_ROOM.maxZ;
    const horizontal=linked(x,z,-1,0)||linked(x,z,1,0),vertical=linked(x,z,0,-1)||linked(x,z,0,1),isCorner=horizontal&&vertical;
    // Cornices belong to the walls. Crossbars at every floor cell exposed the
    // grid and made the ceiling look like a low-poly cage.
    if(!isInSafeRoom({x,z})&&!isCorner&&!archRegions.has(region)&&Math.abs(z-MAP.length/2)<2&&((horizontal&&linked(x,z,-1,0)&&linked(x,z,1,0))||(vertical&&linked(x,z,0,-1)&&linked(x,z,0,1)))){
      archRegions.add(region);
      const portal=v.mesh(arch,ivory);portal.position.copy(center);if(horizontal)portal.rotation.y=Math.PI/2;portal.castShadow=true;v.detailAudit.arches++;
    }
    const nextToCorner=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>linked(x,z,dx,dz)&&cornerAt(x+dx,z+dz));
    // Corners always have a lamp. Straight runs add a spaced rhythm without clusters.
    if(roomCell?!roomLampPlaced:isCorner||((x+z)%2===0&&!nextToCorner)){
      const lampCenter=roomCell?world((SAFE_ROOM.minX+SAFE_ROOM.maxX)/2,(SAFE_ROOM.minZ+SAFE_ROOM.maxZ)/2):center;
      if(roomCell)roomLampPlaced=true;
      const lamp=new THREE.Group();lamp.position.set(lampCenter.x,height-.047,lampCenter.z);v.scene.add(lamp);
      ceilingBowl(v,lamp,roomCell?.26:.218);
      v.detailAudit.roundLamps++;
      const wash=v.mesh(new THREE.PlaneGeometry(roomCell?2.9:1.8,roomCell?2.9:1.8),bounce);wash.rotation.x=Math.PI/2;wash.position.set(lampCenter.x,height-.006,lampCenter.z);
      const lightPosition=new THREE.Vector3(lampCenter.x,height-.21,lampCenter.z);lightPosition.isCorner=roomCell||isCorner;const age=(x*7+z*11)%3;lightPosition.strength=roomCell?22.4:isCorner?[16.2,17.4,16.8][age]:15.8;lightPosition.reach=roomCell?6:5.5;lightPosition.angle=roomCell?1.16:1.12;lightPosition.warmth=roomCell?0xffe0ad:age===0?0xf3e8ce:0xffe4b5;v.lampPositions.push(lightPosition);
    }
    for(const d of [{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}]){
      const next={x:x+d.x,z:z+d.z};
      if(edgeIsOpen({x,z},next)||isOpen(next.x,next.z))continue;
      const hash=x*17+z*13+(d.x+1)*3+d.z,g=new THREE.Group();g.position.copy(world(x+d.x*(.482-v.wallInset),z+d.z*(.482-v.wallInset)));g.rotation.y=d.a;v.scene.add(g);
      // Continuous plaster/stone wainscot is supplied by mat.panel in the wall shell.
      // Restrained shadow grooves and rounded beads replace repeated raised rectangles.
      woodBox(unit,.010,.018,0,.936,-.022,g);
      woodBox(unit,.018,.035,0,.128,-.015,g);
      woodBox(unit,.009,.024,0,height-.173,-.018,g);
      for(const y of [height-.115,height-.181]){const bead=v.mesh(mouldingGeometry,ivory,g);bead.rotation.z=Math.PI/2;bead.position.set(0,y,-.012);}
      if(isInSafeRoom({x,z}))continue;
      if(hash%7!==0&&hash%4!==0){
        if(hash%3===0){
          const frame=new THREE.Group();frame.position.set(0,1.82,0);g.add(frame);
          const variant=(x*3+z)%3;frame.scale.set(variant===1?1.12:.88,variant===1?.73:1,1);
          if(paintingCount===2||paintingCount===13){frame.rotation.z=paintingCount===2?.045:-.035;v.detailAudit.crookedPictures++;}paintingCount++;
          const shadow=v.mesh(new THREE.PlaneGeometry(.96,1.22),shade,frame);shadow.position.set(.018,-.018,.008);
          v.box(.83,1.10,.035,v.mat.black,0,0,.025,frame);
          for(const side of [-1,1]){
            woodBox(.027,1.10,.035,side*.423,0,.040,frame);
            woodBox(.819,.027,.035,0,side*.5365,.040,frame);
            const edge=v.box(.026,1.065,.027,v.mat.brass,side*.400,0,.062,frame);edge.castShadow=true;
            const rail=v.box(.774,.026,.027,v.mat.brass,0,side*.5195,.062,frame);rail.castShadow=true;
            v.box(.012,1.015,.012,v.mat.black,side*.379,0,.072,frame);v.box(.752,.012,.012,v.mat.black,0,side*.502,.072,frame);
            const vertical=v.mesh(pictureBead,v.mat.brass,frame);vertical.position.set(side*.385,0,.080);vertical.scale.y=1.035;
            const horizontal=v.mesh(pictureBead,v.mat.brass,frame);horizontal.rotation.z=Math.PI/2;horizontal.scale.y=.779;horizontal.position.set(0,side*.514,.080);
            for(const other of [-1,1]){const stud=v.mesh(frameStud,v.mat.brass,frame);stud.position.set(side*.400,other*.530,.081);stud.scale.z=.5;}
          }
          const picture=v.mesh(new THREE.PlaneGeometry(.73,.96),art[variant],frame);picture.position.set(0,0,.074);

        }else if(hash%5===0&&signCounts[region]<3&&signSites.every(p=>Math.abs(p.x-x)+Math.abs(p.z-z)>=6)){
          const sign=v.mesh(new THREE.PlaneGeometry(.88,.275),signs[region],g);sign.position.set(0,2.09,.055);signSites.push({x,z});signCounts[region]++;
        }
      }
      if(!isCorner&&hash%7!==0&&hash%4!==0&&hash%3!==0&&hash%5!==0&&hash%11===0&&cabinetCount<2){serviceCabinet(v,g);cabinetCount++;}
      // Carpet edge follows the actual walls, including corners, rather than a square tile grid.
      woodBox(unit,.006,.018,0,.012,.10,g);
      // Only two forgotten cases, tucked entirely within the wall collision margin.
      if(isCorner&&hash%13===0&&luggageCount<2&&x>2){
        const leather=new THREE.MeshStandardMaterial({color:luggageCount?0x403a32:0x4e302c,roughness:.94});
        const bag=v.box(.42,.52,.14,leather,.45,.28,.10,g);bag.castShadow=true;
        for(const sx of [.32,.58])woodBox(.022,.51,.008,sx,.28,.174,g);
        v.box(.13,.022,.035,v.mat.black,.45,.56,.10,g);
        v.box(.408,.006,.002,v.mat.black,.45,.442,.171,g);
        for(const sx of [.30,.60]){
          v.box(.028,.033,.005,v.mat.brass,sx,.443,.1755,g);
          for(const y of [.037,.519])v.box(.039,.026,.008,v.mat.brass,sx,y,.174,g);
        }
        const footShadow=v.mesh(new THREE.PlaneGeometry(.56,.25),shade,g);footShadow.rotation.x=-Math.PI/2;footShadow.position.set(.45,.014,.10);
        luggageCount++;v.detailAudit.luggage++;v.detailAudit.maxPropProjection=(.5-.482)*unit+.178;
      }
    }
  }));
}
