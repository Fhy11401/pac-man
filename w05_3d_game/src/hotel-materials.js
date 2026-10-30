import * as THREE from '../vendor/three.module.js';

function canvas(size=512){const image=document.createElement('canvas');image.width=image.height=size;return [image,image.getContext('2d')];}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function finish(image,color=true){const t=new THREE.CanvasTexture(image);if(color)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}

export function hotelTexture(kind){
  const [image,c]=canvas(),random=rng(1894);
  c.fillStyle=kind==='paper'?'#a19480':kind==='carpet'?'#49232c':'#5b4738';c.fillRect(0,0,512,512);
  if(kind==='paper'){
    // Small woven damask: quiet at distance, visible only in a nearby pool of light.
    for(let y=-48;y<560;y+=48)for(let x=-48;x<560;x+=48){
      c.save();c.translate(x+(Math.round(y/48)%2)*24,y);c.strokeStyle='#766b5d60';c.lineWidth=.8;
      for(let petal=0;petal<4;petal++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(0,-2);c.bezierCurveTo(8,-13,12,-14,8,-3);c.bezierCurveTo(4,3,2,2,0,-2);c.stroke();}
      c.fillStyle='#d9c8aa20';c.fillRect(-.5,-18,1,3);c.restore();
    }
    for(let x=0;x<512;x+=4){c.fillStyle=x%8?'#c5b79c0a':'#594c3a09';c.fillRect(x,0,1,512);}
    // Paste seams and damp bloom are subtle; no repeated large dark symbols.
    c.fillStyle='#564f4110';c.fillRect(254,0,2,512);
    for(let i=0;i<7;i++){const x=random()*512,y=random()*512,r=35+random()*70,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#51473b0c');g.addColorStop(1,'#51473b00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  }else if(kind==='carpet'){
    for(let y=0;y<512;y+=4){c.strokeStyle=y%8?'#9c6b6711':'#140a0f20';c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();}
    c.save();c.translate(256,256);c.strokeStyle='#a180681c';c.lineWidth=1;
    for(const r of [112,170]){c.beginPath();for(let k=0;k<=64;k++){const a=k*Math.PI/32,rr=r+Math.cos(a*8)*7;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();}c.restore();
  }else{
    for(let i=0;i<160;i++){const x=random()*512;c.strokeStyle=`rgba(21,14,10,${.04+random()*.18})`;c.lineWidth=.4+random()*1.1;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+random()*14,180,x-random()*12,340,x,512);c.stroke();}
    for(let i=0;i<45;i++){c.strokeStyle='#c8ac7c10';const x=random()*512,y=random()*512;c.beginPath();c.moveTo(x,y);c.lineTo(x+1,y+random()*16);c.stroke();}
  }
  for(let i=0;i<26000;i++){c.fillStyle=random()>.5?'#fff1d808':'#20181508';c.fillRect(random()*512,random()*512,1,1);}
  return finish(image);
}

export function makeHotelMaterials(){
  const [image,c]=canvas(256),random=rng(937);
  c.fillStyle='#c4c4c4';c.fillRect(0,0,256,256);
  for(let i=0;i<18000;i++){const n=155+Math.round(random()*80);c.fillStyle=`rgb(${n},${n},${n})`;c.fillRect(random()*256,random()*256,1,1);}
  const grain=finish(image,false),paper=hotelTexture('paper'),wood=hotelTexture('wood');
  return {
    paper:new THREE.MeshStandardMaterial({map:paper,bumpMap:grain,bumpScale:.0013,roughnessMap:grain,roughness:1}),
    wood:new THREE.MeshStandardMaterial({map:wood,bumpMap:wood,bumpScale:.0025,roughnessMap:grain,roughness:.83}),
    brass:new THREE.MeshStandardMaterial({color:0x79684c,metalness:.68,roughnessMap:grain,roughness:.72}),
    black:new THREE.MeshStandardMaterial({color:0x171314,roughness:.94}),
    glow:new THREE.MeshBasicMaterial({color:0xffd7ae}),
    cloth:new THREE.MeshStandardMaterial({color:0xc2ac87,bumpMap:grain,bumpScale:.0025,roughness:1,emissive:0x7a4e27,emissiveIntensity:.055}),
  };
}

export function contactShade(){
  const [image,c]=canvas(64),g=c.createRadialGradient(32,32,8,32,32,32);
  g.addColorStop(0,'#0009');g.addColorStop(.6,'#0006');g.addColorStop(1,'#0000');c.fillStyle=g;c.fillRect(0,0,64,64);
  return new THREE.MeshBasicMaterial({map:finish(image),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
}
