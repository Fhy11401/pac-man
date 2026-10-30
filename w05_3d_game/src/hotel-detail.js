import * as THREE from '../vendor/three.module.js';
import {MAP,isOpen} from './world.js';

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
  c.fillStyle='#20292a';c.fillRect(67,177,122,94);
  c.beginPath();c.moveTo(52,178);c.lineTo(125,126);c.lineTo(204,178);c.fill();
  c.fillRect(86,137,14,42);c.fillRect(159,141,12,36);
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){c.fillStyle=(row+col+index)%3?'#bca477':'#26383b';c.fillRect(78+col*21,187+row*25,8,13);}
  c.fillStyle='#0f2226';for(const x of [19,33,219,238]){c.fillRect(x,158,4,158);for(let y=146;y<294;y+=18){c.beginPath();c.moveTo(x+2,y-28);c.lineTo(x-17,y+20);c.lineTo(x+21,y+20);c.fill();}}
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
  const ivory=new THREE.MeshStandardMaterial({color:0xb6a28b,roughness:.88});
  const inset=new THREE.MeshStandardMaterial({color:0x291d22,roughness:.7});
  const art=[0,1,2].map(painting),signs=[plaque('西翼 · 客房','WEST WING  /  GUEST ROOMS'),plaque('东翼 · 画廊','EAST WING  /  GALLERY')];
  const lamp=new THREE.MeshStandardMaterial({color:0xead6ac,emissive:0xffc98b,emissiveIntensity:.3,roughness:.45});
  MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
    if(tile==='#')return;
    const center=world(x,z);
    // Coffered ceiling and a fine perimeter moulding.
    for(const side of [-1,1]){
      v.box(unit,.07,.075,ivory,center.x,3.025,center.z+side*1.13);
      v.box(.075,.07,unit,ivory,center.x+side*1.13,3.025,center.z);
    }
    if((x+z)%5===0){
      const rose=v.mesh(new THREE.CylinderGeometry(.28,.28,.055,20),v.mat.brass);rose.position.set(center.x,3.02,center.z);
      const glass=v.mesh(new THREE.SphereGeometry(.23,20,10,0,Math.PI*2,0,Math.PI/2),lamp);glass.rotation.x=Math.PI;glass.position.set(center.x,2.99,center.z);glass.scale.y=.5;
      v.lampPositions.push(new THREE.Vector3(center.x,2.78,center.z));
    }
    for(const d of [{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}]){
      if(isOpen(x+d.x,z+d.z))continue;
      const hash=x*17+z*13+(d.x+1)*3+d.z,g=new THREE.Group();g.position.copy(world(x+d.x*.482,z+d.z*.482));g.rotation.y=d.a;v.scene.add(g);
      // Shallow raised joinery stays inside the player's collision clearance.
      for(const sx of [-.72,.72]){
        v.box(.60,.62,.025,inset,sx,.53,.025,g);
        for(const edge of [-1,1]){v.box(.025,.65,.04,v.mat.brass,sx+edge*.31,.53,.04,g);v.box(.64,.025,.04,v.mat.brass,sx,.53+edge*.325,.04,g);}
      }
      for(const side of [-1,1]){v.box(.10,1.76,.055,v.mat.wood,side*1.13,1.96,.015,g);v.box(.15,.075,.065,v.mat.brass,side*1.13,2.78,.02,g);}
      if(hash%7!==0&&hash%4!==0){
        if(hash%3===0){
          v.box(.77,1.04,.065,v.mat.black,0,1.95,.032,g);
          for(const side of [-1,1]){v.box(.055,1.06,.09,v.mat.brass,side*.40,1.95,.07,g);v.box(.85,.055,.09,v.mat.brass,0,1.95+side*.53,.07,g);}
          const picture=v.mesh(new THREE.PlaneGeometry(.73,.96),art[(x+z)%3],g);picture.position.set(0,1.95,.088);
        }else if(hash%5===0){
          const sign=v.mesh(new THREE.PlaneGeometry(.88,.275),signs[x<7?0:1],g);sign.position.set(0,2.09,.055);
        }
      }
      // Carpet edge follows the actual walls, including corners, rather than a square tile grid.
      v.box(unit,.006,.035,v.mat.brass,0,.012,.18,g);
    }
  }));
}
