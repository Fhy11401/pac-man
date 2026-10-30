import * as THREE from '../vendor/three.module.js';
import {contactShade} from './hotel-materials.js';

const mesh=(parent,geometry,material,x=0,y=0,z=0,scale=[1,1,1])=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(...scale);m.receiveShadow=true;parent.add(m);return m;};
function fabric(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#888888';c.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=3){c.fillStyle=i%2?'#b5b5b5':'#606060';c.fillRect(i,0,1,256);c.fillRect(0,i,256,1);}
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);t.anisotropy=4;return t;
}
function agedPorcelain(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
  let seed=71931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  c.fillStyle='#c4bfac';c.fillRect(0,0,1024,512);
  for(let i=0;i<1800;i++){
    const x=random()*1024,y=random()*512,r=2+random()*24,g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,i%3?'#534b3620':'#e4ddc51b');g.addColorStop(1,'#534b3600');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<85;i++){
    let x=random()*1024,y=random()*512;c.strokeStyle=i%3?'#4d46351d':'#4d46354a';c.lineWidth=.4+random()*.7;c.beginPath();c.moveTo(x,y);
    for(let j=0;j<3+random()*5;j++){x+=(random()-.5)*13;y+=3+random()*10;c.lineTo(x,y);}c.stroke();
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
function maskGeometry(){
  const g=new THREE.SphereGeometry(.205,64,48);g.scale(.96,1.23,.78);const p=g.attributes.position;
  const bump=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(z<=0)continue;
    const nose=.043*bump(x,y,0,-.007,.024,.062)+.009*bump(x,y,0,-.042,.041,.019);
    const bones=.011*(bump(x,y,-.108,-.02,.044,.04)+bump(x,y,.108,-.02,.044,.04));
    const brows=.008*(bump(x,y,-.073,.09,.063,.022)+bump(x,y,.073,.09,.063,.022));
    p.setZ(i,z+nose+bones+brows);
  }
  g.computeVertexNormals();return g;
}
export function attendantMaterials(){
  const weave=fabric(),porcelain=agedPorcelain();
  return {coat:new THREE.MeshStandardMaterial({color:0x422f34,bumpMap:weave,bumpScale:.0016,roughness:.87}),
    lapel:new THREE.MeshStandardMaterial({color:0x171b1d,bumpMap:weave,bumpScale:.001,roughness:.67}),
    porcelain:new THREE.MeshStandardMaterial({color:0xeee9da,map:porcelain,bumpMap:porcelain,bumpScale:.0007,roughness:.44}),
    teeth:new THREE.MeshStandardMaterial({color:0xa59a74,roughness:.63}),
    leather:new THREE.MeshStandardMaterial({color:0x181716,roughness:.47}),
    black:new THREE.MeshStandardMaterial({color:0x060709,roughness:.9}),
    brass:new THREE.MeshStandardMaterial({color:0xb59c61,metalness:.5,roughness:.46}),
    eye:new THREE.MeshBasicMaterial({color:0xd82c20,toneMapped:false})};
}
export function attendantHead(m){
  const g=new THREE.Group();
  mesh(g,new THREE.SphereGeometry(.22,32,24),m.black,0,0,-.105,[1,1.2,.9]);
  mesh(g,maskGeometry(),m.porcelain);
  for(const side of [-1,1]){
    mesh(g,new THREE.SphereGeometry(.056,24,16),m.black,side*.076,.053,.146,[1.06,.48,.38]).rotation.z=side*-.13;
    mesh(g,new THREE.SphereGeometry(.0065,16,12),m.eye,side*.076,.052,.168,[.85,1,.45]);
  }
  mesh(g,new THREE.SphereGeometry(.083,32,20),m.black,0,-.108,.128,[1.09,.46,.34]);
  for(let i=0;i<9;i++)for(const side of [-1,1]){
    const x=(i-4)*.016,y=-.108+side*(.021-Math.abs(i-4)*.0014);
    mesh(g,new THREE.CapsuleGeometry(.006,.011+(i%3)*.002,4,10),m.teeth,x,y,.153-Math.abs(i-4)*.001,[1,1,.62]).rotation.z=(i-4)*.035;
  }
  mesh(g,new THREE.CylinderGeometry(.205,.225,.105,32),m.coat,0,.235,-.06,[1,1,.88]);
  mesh(g,new THREE.CylinderGeometry(.225,.225,.013,32),m.leather,0,.183,-.06,[1,1,.92]);
  mesh(g,new THREE.TorusGeometry(.211,.006,6,32),m.brass,0,.212,-.06,[1,.88,1]).rotation.x=Math.PI/2;
  mesh(g,new THREE.SphereGeometry(.019,12,8),m.brass,0,.238,.125,[1,1,.3]);
  return g;
}
export function createAttendant(m){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const profile=[[.245,.52],[.275,.59],[.245,.80],[.226,.98],[.268,1.22],[.29,1.32],[.18,1.40]].map(([x,y])=>new THREE.Vector2(x,y));
  mesh(body,new THREE.LatheGeometry(profile,32),m.coat,0,0,0,[1,1,.73]);
  mesh(body,new THREE.CylinderGeometry(.10,.13,.12,20),m.lapel,0,1.43,0);
  for(const side of [-1,1]){
    const lapel=mesh(body,new THREE.BoxGeometry(.10,.27,.025),m.lapel,side*.083,1.28,.172);lapel.rotation.z=side*.24;
    mesh(body,new THREE.BoxGeometry(.008,.57,.009),m.brass,side*.105,.89,.181);
    for(const y of [.76,.94,1.12])mesh(body,new THREE.SphereGeometry(.015,10,8),m.brass,side*.07,y,.193,[1,1,.45]);
    mesh(body,new THREE.BoxGeometry(.12,.023,.016),m.lapel,side*.16,.77,.168).rotation.z=side*-.08;
  }
  const head=attendantHead(m);head.position.set(0,1.63,.025);body.add(head);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.28,1.30,0);body.add(arm);
    mesh(arm,new THREE.CapsuleGeometry(.068,.24,5,16),m.coat,side*.015,-.14,0);
    const elbow=new THREE.Group();elbow.position.set(side*.02,-.29,0);elbow.rotation.x=-.22;arm.add(elbow);
    mesh(elbow,new THREE.CapsuleGeometry(.056,.20,5,16),m.coat,0,-.12,0);
    mesh(elbow,new THREE.CylinderGeometry(.059,.059,.045,16),m.lapel,0,-.235,0);
    mesh(elbow,new THREE.SphereGeometry(.062,16,12),m.leather,0,-.31,.012,[.8,1.3,.65]);
    for(let i=0;i<3;i++)mesh(elbow,new THREE.CapsuleGeometry(.012,.043,3,8),m.leather,(i-1)*.024,-.373,.017);
    limbs.push({node:arm,elbow,side,leg:false});
    const leg=new THREE.Group();leg.position.set(side*.13,.61,0);root.add(leg);
    mesh(leg,new THREE.CapsuleGeometry(.085,.37,5,16),m.lapel,0,-.225,0);
    mesh(leg,new THREE.SphereGeometry(.12,20,12),m.leather,0,-.53,.058,[.74,.56,1.4]);
    limbs.push({node:leg,side,leg:true});
  }
  const shadow=mesh(root,new THREE.PlaneGeometry(.85,.65),contactShade(),0,.015,0);shadow.rotation.x=-Math.PI/2;
  return {root,body,limbs};
}
