import * as THREE from '../vendor/three.module.js';
import {MAP,isOpen} from './world.js';
import {contactShade} from './hotel-materials.js';

function painting(index){
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
  return new THREE.MeshStandardMaterial({map:texture,roughness:.88});
}
function plaque(text,sub){
  const c=document.createElement('canvas');c.width=512;c.height=160;const x=c.getContext('2d');
  x.fillStyle='#20191b';x.fillRect(0,0,512,160);x.strokeStyle='#a68c5f';x.lineWidth=3;x.strokeRect(7,7,498,146);x.lineWidth=1;x.strokeRect(15,15,482,130);
  x.fillStyle='#dfcda3';x.textAlign='center';x.font='32px SimSun';x.fillText(text,256,73);x.font='16px Georgia';x.fillStyle='#b8a789';x.fillText(sub,256,114);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:t,roughness:.65});
}

// Every ornament sits against a wall or above eye level; the playable maze stays unchanged.
export function decorateHotel(v,world,unit){
  const ivory=new THREE.MeshStandardMaterial({color:0x897e6c,roughness:.88});
  const inset=new THREE.MeshStandardMaterial({color:0x302622,roughness:.7});
  const art=[0,1,2].map(painting),signs=[plaque('西翼 · 客房','WEST WING  /  GUEST ROOMS'),plaque('东翼 · 画廊','EAST WING  /  GALLERY')];
  const shade=contactShade();let luggageCount=0,paintingCount=0;
  const lamp=new THREE.MeshStandardMaterial({color:0xead6ac,emissive:0xffc98b,emissiveIntensity:.3,roughness:.45});
  MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
    if(tile==='#')return;
    const center=world(x,z);
    const horizontal=isOpen(x-1,z)||isOpen(x+1,z),vertical=isOpen(x,z-1)||isOpen(x,z+1),isCorner=horizontal&&vertical;
    // Follow the corridor with plaster ribs, rather than outlining every tile in gold.
    for(const side of [-1,1]){
      if(horizontal)v.box(unit,.045,.06,ivory,center.x,3.025,center.z+side*(1.13-v.wallInset*unit));
      if(vertical)v.box(.06,.045,unit,ivory,center.x+side*1.13,3.025,center.z);
    }
    // Every right-angle turn and junction receives its own ceiling fixture.
    if(isCorner||(x+z)%5===0){
      const rose=v.mesh(new THREE.CylinderGeometry(.28,.28,.055,20),v.mat.brass);rose.position.set(center.x,3.02,center.z);
      const glass=v.mesh(new THREE.SphereGeometry(.23,20,10,0,Math.PI*2,0,Math.PI/2),lamp);glass.rotation.x=Math.PI;glass.position.set(center.x,2.99,center.z);glass.scale.y=.5;
      const lightPosition=new THREE.Vector3(center.x,2.78,center.z);lightPosition.isCorner=isCorner;const age=(x*7+z*11)%3;lightPosition.strength=isCorner?[12.2,14.2,13.1][age]:[7.2,9.4,11.5][age];lightPosition.reach=isCorner?5.9:5.3;lightPosition.angle=isCorner?1.04:.91;lightPosition.warmth=age===0?0xe3d5bd:0xffd2a6;v.lampPositions.push(lightPosition);
    }
    for(const d of [{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}]){
      if(isOpen(x+d.x,z+d.z))continue;
      const hash=x*17+z*13+(d.x+1)*3+d.z,g=new THREE.Group();g.position.copy(world(x+d.x*(.482-v.wallInset),z+d.z*(.482-v.wallInset)));g.rotation.y=d.a;v.scene.add(g);
      // Shallow raised joinery stays inside the player's collision clearance.
      for(const sx of [-.72,.72]){
        v.box(.60,.62,.025,inset,sx,.53,.025,g);
        for(const edge of [-1,1]){v.box(.025,.65,.04,v.mat.wood,sx+edge*.31,.53,.04,g);v.box(.64,.025,.04,v.mat.wood,sx,.53+edge*.325,.04,g);}
      }
      if(hash%2===0)for(const side of [-1,1]){v.box(.065,1.76,.055,v.mat.wood,side*1.13,1.96,.015,g);v.box(.10,.055,.065,v.mat.wood,side*1.13,2.78,.02,g);}
      if(hash%7!==0&&hash%4!==0){
        if(hash%3===0){
          const frame=new THREE.Group();frame.position.set(0,1.95,0);g.add(frame);
          const variant=(x*3+z)%3;frame.scale.set(variant===1?1.12:.88,variant===1?.73:1,1);
          if(paintingCount===2||paintingCount===13){frame.rotation.z=paintingCount===2?.045:-.035;v.detailAudit.crookedPictures++;}paintingCount++;
          const shadow=v.mesh(new THREE.PlaneGeometry(.96,1.22),shade,frame);shadow.position.set(.018,-.018,.008);
          v.box(.77,1.04,.065,v.mat.black,0,0,.032,frame);
          for(const side of [-1,1]){const edge=v.box(.045,1.06,.09,v.mat.wood,side*.40,0,.07,frame);edge.castShadow=true;const rail=v.box(.85,.045,.09,v.mat.wood,0,side*.53,.07,frame);rail.castShadow=true;}
          for(const side of [-1,1])v.box(.012,.99,.012,v.mat.brass,side*.373,0,.12,frame);
          const picture=v.mesh(new THREE.PlaneGeometry(.73,.96),art[variant],frame);picture.position.set(0,0,.088);

        }else if(hash%5===0){
          const sign=v.mesh(new THREE.PlaneGeometry(.88,.275),signs[x<7?0:1],g);sign.position.set(0,2.09,.055);
        }
      }
      // Carpet edge follows the actual walls, including corners, rather than a square tile grid.
      v.box(unit,.006,.022,inset,0,.012,.12,g);
      // Only two forgotten cases, tucked entirely within the wall collision margin.
      if(isCorner&&hash%13===0&&luggageCount<2&&x>2){
        const leather=new THREE.MeshStandardMaterial({color:luggageCount?0x403a32:0x4e302c,roughness:.94});
        const bag=v.box(.42,.52,.14,leather,.45,.28,.10,g);bag.castShadow=true;
        for(const sx of [.32,.58])v.box(.022,.51,.008,v.mat.wood,sx,.28,.174,g);
        v.box(.13,.022,.035,v.mat.black,.45,.56,.10,g);
        const footShadow=v.mesh(new THREE.PlaneGeometry(.56,.25),shade,g);footShadow.rotation.x=-Math.PI/2;footShadow.position.set(.45,.014,.10);
        luggageCount++;v.detailAudit.luggage++;v.detailAudit.maxPropProjection=(.5-.482)*unit+.10+.07;
      }
    }
  }));
}
