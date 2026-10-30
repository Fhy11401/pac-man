import * as THREE from '../vendor/three.module.js';
import {applyHotelAsset} from './hotel-assets.js';

function canvas(size=512){const image=document.createElement('canvas');image.width=image.height=size;return [image,image.getContext('2d')];}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function finish(image,color=true){const t=new THREE.CanvasTexture(image);if(color)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}

export function hotelTexture(kind){
  const [image,c]=canvas(),random=rng(1894);
  c.fillStyle=kind==='paper'?'#797760':kind==='carpet'?'#3c1b24':'#40332a';c.fillRect(0,0,512,512);
  if(kind==='paper'){
    // Original woven acanthus motif: denser than the old oversized four-petal outline.
    for(let y=-64;y<580;y+=64)for(let x=-64;x<580;x+=64){
      c.save();c.translate(x+(Math.round(y/64)%2)*32,y);
      for(const side of [-1,1]){
        c.save();c.scale(side,1);c.fillStyle='#3e4436a0';c.strokeStyle='#bbb48b58';c.lineWidth=.8;
        c.beginPath();c.moveTo(0,-27);c.bezierCurveTo(10,-18,5,-12,8,-8);c.bezierCurveTo(26,-27,34,-9,17,-3);c.bezierCurveTo(30,0,27,12,12,12);c.bezierCurveTo(18,21,9,24,0,29);c.bezierCurveTo(5,13,9,2,0,-5);c.closePath();c.fill();c.stroke();
        c.strokeStyle='#a8a58170';c.beginPath();c.moveTo(0,25);c.bezierCurveTo(4,11,22,2,21,-11);c.stroke();c.restore();
      }
      c.fillStyle='#bcb48a66';c.beginPath();c.ellipse(0,-9,2.2,5,0,0,Math.PI*2);c.fill();c.restore();
    }
    for(let x=0;x<512;x+=4){c.fillStyle=x%8?'#c5b79c0a':'#594c3a09';c.fillRect(x,0,1,512);}
    // Paste seams and damp bloom are subtle; no repeated large dark symbols.
    c.fillStyle='#564f4110';c.fillRect(254,0,2,512);
    for(let i=0;i<7;i++){const x=random()*512,y=random()*512,r=35+random()*70,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#51473b0c');g.addColorStop(1,'#51473b00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  }else if(kind==='carpet'){
    for(let y=0;y<512;y+=4){c.strokeStyle=y%8?'#9c6b6711':'#140a0f20';c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();}
    for(let y=0;y<512;y+=64)for(let x=0;x<512;x+=64){
      c.save();c.translate(x+32,y+32);c.strokeStyle='#b29a6425';c.lineWidth=1;
      c.beginPath();for(let k=0;k<=32;k++){const a=k*Math.PI/16,r=16+Math.cos(a*4)*4;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.stroke();
      c.fillStyle='#aa8d5928';c.fillRect(-1.5,-1.5,3,3);c.restore();
    }
  }else{
    for(let i=0;i<160;i++){const x=random()*512;c.strokeStyle=`rgba(21,14,10,${.04+random()*.18})`;c.lineWidth=.4+random()*1.1;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+random()*14,180,x-random()*12,340,x,512);c.stroke();}
    for(let i=0;i<45;i++){c.strokeStyle='#c8ac7c10';const x=random()*512,y=random()*512;c.beginPath();c.moveTo(x,y);c.lineTo(x+1,y+random()*16);c.stroke();}
  }
  for(let i=0;i<26000;i++){c.fillStyle=random()>.5?'#fff1d808':'#20181508';c.fillRect(random()*512,random()*512,1,1);}
  return finish(image);
}

export function makeHotelMaterials(assetJobs=[]){
  const [image,c]=canvas(256),random=rng(937);
  c.fillStyle='#c4c4c4';c.fillRect(0,0,256,256);
  for(let i=0;i<18000;i++){const n=155+Math.round(random()*80);c.fillStyle=`rgb(${n},${n},${n})`;c.fillRect(random()*256,random()*256,1,1);}
  const grain=finish(image,false),paper=hotelTexture('paper'),wood=hotelTexture('wood');paper.repeat.set(3,3);
  const materials={
    paper:new THREE.MeshStandardMaterial({map:paper,bumpMap:grain,bumpScale:.0013,roughnessMap:grain,roughness:1}),
    wood:new THREE.MeshStandardMaterial({map:wood,bumpMap:wood,bumpScale:.0025,roughnessMap:grain,roughness:.68}),
    panel:new THREE.MeshStandardMaterial({color:0x777365,bumpMap:grain,bumpScale:.002,roughness:.82}),
    trim:new THREE.MeshStandardMaterial({color:0xaba18a,bumpMap:grain,bumpScale:.001,roughness:.64}),
    ceiling:new THREE.MeshStandardMaterial({color:0x777568,bumpMap:grain,bumpScale:.001,roughness:.5}),
    brass:new THREE.MeshStandardMaterial({color:0x9c855d,metalness:.45,roughnessMap:grain,roughness:.58}),
    black:new THREE.MeshStandardMaterial({color:0x171314,roughness:.94}),
    glow:new THREE.MeshBasicMaterial({color:0xffecc4,toneMapped:false}),
    cloth:new THREE.MeshStandardMaterial({color:0xc2ac87,bumpMap:grain,bumpScale:.0025,roughness:1,emissive:0x7a4e27,emissiveIntensity:.055}),
  };
  assetJobs.push(applyHotelAsset(materials.paper,'paper',{repeat:[3,3],bump:.0015}),applyHotelAsset(materials.wood,'wood',{repeat:[1,1],bump:.0025}));
  return materials;
}

export function contactShade(){
  const [image,c]=canvas(64),g=c.createRadialGradient(32,32,8,32,32,32);
  g.addColorStop(0,'#0009');g.addColorStop(.6,'#0006');g.addColorStop(1,'#0000');c.fillStyle=g;c.fillRect(0,0,64,64);
  return new THREE.MeshBasicMaterial({map:finish(image),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
}
