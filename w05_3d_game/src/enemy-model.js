import * as THREE from '../vendor/three.module.js';
import {contactShade} from './hotel-materials.js';

const mesh=(parent,geometry,material,x=0,y=0,z=0,scale=[1,1,1])=>{
  const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);item.scale.set(...scale);item.receiveShadow=true;parent.add(item);return item;
};
const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));

function fabric(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#919191';c.fillRect(0,0,256,256);
  // A fine diagonal twill, rather than a high-contrast checkerboard over the suit.
  for(let y=0;y<256;y+=2)for(let x=0;x<256;x+=2){const a=((x+y)%8)/8;c.fillStyle=`rgba(${a>.4?'220,220,220':'40,40,40'},.13)`;c.fillRect(x,y,2,1);}
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);t.anisotropy=4;return t;
}

function agedPorcelain(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
  let seed=71931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  c.fillStyle='#c9c3af';c.fillRect(0,0,1024,512);
  for(let i=0;i<1400;i++){
    const x=random()*1024,y=random()*512,r=2+random()*21,g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,i%3?'#58492c15':'#eee7d01a');g.addColorStop(1,'#58492c00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<70;i++){
    let x=random()*1024,y=random()*512;c.strokeStyle=i%3?'#4d46351d':'#4d463550';c.lineWidth=.35+random()*.6;c.beginPath();c.moveTo(x,y);
    const steps=3+Math.floor(random()*5);
    for(let j=0;j<steps;j++){x+=(random()-.5)*11;y+=3+random()*9;c.lineTo(x,y);}c.stroke();
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}

// Nonuniform skull profile: brow, cheekbones, narrow temples, squared jaw and chin.
// The eyes and mouth are cut into the front surface, not flat patches over a sphere.
function faceSurface(x,y,z){
  const front=Math.max(0,z/.17),mouthX=x/.112,mouthY=(y-(-.112+.034*mouthX*mouthX))/.031;
  const sockets=[-1,1].reduce((n,s)=>n+.025*gaussian(x,y,s*.076,.055,.051,.032),0);
  const brows=[-1,1].reduce((n,s)=>n+.023*gaussian(x,y,s*.073,.102,.058,.026),0);
  const cheeks=[-1,1].reduce((n,s)=>n+.026*gaussian(x,y,s*.123,-.021,.041,.040)-.012*gaussian(x,y,s*.105,-.079,.048,.037),0);
  const nose=.058*gaussian(x,y,0,.010,.022,.075)+.042*gaussian(x,y,0,-.033,.035,.024);
  const philtrum=-.009*gaussian(x,y,0,-.073,.012,.023),chin=.023*gaussian(x,y,0,-.188,.070,.045);
  const mouth=Math.exp(-(mouthX**4+mouthY**4)*.6)*.015;
  return z+front*(nose+brows+cheeks-sockets+philtrum+chin-mouth);
}

function faceDepth(x,y){
  const sy=y/.258,jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
  return faceSurface(x,y,.172*Math.sqrt(Math.max(0,1-(x/(.204*jaw*temple))**2-sy*sy)));
}

function maskGeometry(){
  const g=new THREE.SphereGeometry(1,80,64),p=g.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const sy=p.getY(i),y=sy*.258;
    const jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
    const x=p.getX(i)*.204*jaw*temple,z=p.getZ(i)*.172;
    p.setXYZ(i,x,y,z>0?faceSurface(x,y,z):z);
    const socket=[-1,1].reduce((n,s)=>n+gaussian(x,y,s*.076,.055,.065,.049),0);
    const cheek=[-1,1].reduce((n,s)=>n+gaussian(x,y,s*.126,-.077,.044,.045),0);
    const ao=z>0?Math.min(.55,socket*.43+cheek*.16):.12;
    colors.push(1-ao,1-ao*1.10,1-ao*1.12);
  }
  const indices=[],index=g.index;
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),d=index.getX(i+2);
    const x=(p.getX(a)+p.getX(b)+p.getX(d))/3,y=(p.getY(a)+p.getY(b)+p.getY(d))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(d))/3;
    const mouthX=x/.104,mouthY=(y-(-.112+.030*mouthX*mouthX))/.025;
    const mouth=mouthX*mouthX+mouthY*mouthY<1;
    const eye=[-1,1].some(s=>((x-s*.076)/.046)**2+((y-(.055+s*(x-s*.076)*.16))/.019)**2<1);
    if(!(z>.08&&(mouth||eye)))indices.push(a,b,d);
  }
  // Snap cut boundaries onto the curves. Removing triangles alone leaves a saw-tooth lip.
  const edges=new Map();for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  const rim=new Set();for(const [key,count] of edges)if(count===1)key.split(':').forEach(i=>rim.add(Number(i)));
  for(const i of rim){
    let x=p.getX(i),y=p.getY(i);if(p.getZ(i)<.08)continue;
    if(y<-.053&&y>-.17&&Math.abs(x)<.13){
      const dx=x/.104,dy=(y+.112-.030*dx*dx)/.025,r=Math.hypot(dx,dy);if(r>.55&&r<1.7){x=dx/r*.104;y=-.112+.030*(dx/r)**2+dy/r*.025;p.setXYZ(i,x,y,faceDepth(x,y));}
    }else if(y>.018&&y<.092){
      const side=Math.sign(x),cx=side*.076,dx=(x-cx)/.046,dy=(y-.055-side*(x-cx)*.16)/.019,r=Math.hypot(dx,dy);
      if(r>.55&&r<1.8){x=cx+dx/r*.046;y=.055+dy/r*.019+side*(x-cx)*.16;p.setXYZ(i,x,y,faceDepth(x,y));}
    }
  }
  g.setIndex(indices);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

function curveTube(points,radius=.004,segments=20){
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,5,false);
}

function toothGeometry(width,height,skew=0){
  // Rounded square incisors with a small taper; avoids capsule-shaped bead teeth.
  const g=new THREE.BoxGeometry(width,height,.016,3,4,2),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),t=(y/height+.5);
    p.setXYZ(i,x*(.82+.18*Math.sin(t*Math.PI))+skew*t,y,z*(.72+.28*Math.sin(t*Math.PI)));
  }
  g.computeVertexNormals();return g;
}

// Collapse only rigid children. Animated shoulders/elbows/hips keep their own pivots.
// Material batches amortize facial features and tailoring into a small number of draws.
function batchRigid(group){
  const batches=new Map();group.updateMatrixWorld(true);
  for(const child of [...group.children]){
    if(!child.isMesh)continue;
    child.updateMatrix();if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(child);
  }
  for(const [material,items] of batches){
    if(items.length<2)continue;
    const attrs={position:[],normal:[],uv:[],color:[]};
    for(const item of items){
      const g=item.geometry.index?item.geometry.toNonIndexed():item.geometry.clone();g.applyMatrix4(item.matrix);
      const count=g.attributes.position.count;
      for(const name of ['position','normal','uv','color']){
        const a=g.attributes[name],size=name==='uv'?2:3;
        if(a)for(let i=0;i<a.array.length;i++)attrs[name].push(a.array[i]);
        else for(let i=0;i<count*size;i++)attrs[name].push(name==='color'?1:0);
      }
      g.dispose();item.geometry.dispose();group.remove(item);
    }
    const merged=new THREE.BufferGeometry();
    for(const name of Object.keys(attrs))merged.setAttribute(name,new THREE.Float32BufferAttribute(attrs[name],name==='uv'?2:3));
    merged.computeBoundingSphere();mesh(group,merged,material);
  }
}

export function attendantMaterials(){
  const weave=fabric(),porcelain=agedPorcelain();
  return {
    coat:new THREE.MeshStandardMaterial({color:0x36292c,bumpMap:weave,bumpScale:.0012,roughness:.85,envMapIntensity:.18}),
    lapel:new THREE.MeshStandardMaterial({color:0x161b1c,bumpMap:weave,bumpScale:.0008,roughness:.64,envMapIntensity:.20}),
    porcelain:new THREE.MeshStandardMaterial({color:0xede6d4,map:porcelain,bumpMap:porcelain,bumpScale:.00045,roughness:.39,vertexColors:true,envMapIntensity:.40}),
    lip:new THREE.MeshStandardMaterial({color:0x514236,roughness:.69}),
    teeth:new THREE.MeshStandardMaterial({color:0xbfb191,roughness:.43}),
    leather:new THREE.MeshStandardMaterial({color:0x141716,roughness:.39,envMapIntensity:.24}),
    black:new THREE.MeshStandardMaterial({color:0x050606,roughness:.87}),
    brass:new THREE.MeshStandardMaterial({color:0x9e895e,metalness:.68,roughness:.42,envMapIntensity:.55}),
    eye:new THREE.MeshStandardMaterial({color:0x992c19,emissive:0xa4210e,emissiveIntensity:.60,roughness:.22}),
    wet:new THREE.MeshStandardMaterial({color:0x111312,roughness:.26}),
    shirt:new THREE.MeshStandardMaterial({color:0x979182,bumpMap:weave,bumpScale:.0005,roughness:.80})
  };
}

export function attendantHead(m){
  const g=new THREE.Group();g.name='attendant-head';
  mesh(g,new THREE.SphereGeometry(.206,28,20),m.black,0,0,-.062,[.98,1.22,.88]);
  mesh(g,maskGeometry(),m.porcelain);
  // Separate recessed eyeballs, upper lids, lower bags and nostrils read under grazing light.
  for(const side of [-1,1]){
    mesh(g,new THREE.SphereGeometry(.030,20,12),m.wet,side*.076,.054,.113,[1,.66,.75]);
    mesh(g,new THREE.SphereGeometry(.0048,12,8),m.eye,side*.076,.053,.136,[.72,1,.4]);
    const upper=[],lower=[];
    for(let i=0;i<=12;i++){
      const t=i/12*Math.PI,x=side*.076+Math.cos(t)*.047;
      const uy=.055+Math.sin(t)*.020+side*(x-side*.076)*.16,ly=.055-Math.sin(t)*.019+side*(x-side*.076)*.16;
      upper.push([x,uy,faceDepth(x,uy)+.0007]);lower.push([x,ly,faceDepth(x,ly)+.0005]);
    }
    mesh(g,curveTube(upper,.004,16),m.porcelain);mesh(g,curveTube(lower,.0026,16),m.lip);
    mesh(g,new THREE.SphereGeometry(.0065,12,8),m.black,side*.016,-.047,.228,[.9,.42,.28]);
    mesh(g,new THREE.SphereGeometry(.031,16,12),m.porcelain,side*.198,-.006,-.018,[.52,1.55,.8]);
    mesh(g,new THREE.SphereGeometry(.016,12,8),m.lip,side*.207,-.009,.002,[.35,1.45,.5]);
  }
  // The cavity sits behind the cut mesh, and the smile follows its shallow curved opening.
  mesh(g,new THREE.SphereGeometry(.115,28,14),m.black,0,-.108,.097,[1,.34,.26]);
  for(const side of [-1,1]){
    const lip=[];
    for(let i=0;i<=20;i++){const t=-1+i/10,x=t*.104,y=-.112+.030*t*t+side*.025*Math.sqrt(Math.max(0,1-t*t));lip.push([x,y,faceDepth(x,y)+.0004]);}
    mesh(g,curveTube(lip,side>0?.0025:.003,24),m.lip);
    for(let i=0;i<11;i++){
      const t=(i-5)/5,x=t*.087,mx=x/.104,opening=.025*Math.sqrt(1-mx*mx),y=-.112+.030*mx*mx+side*opening*.48;
      const h=opening*.87,w=.0135-Math.abs(t)*.001;
      const tooth=mesh(g,toothGeometry(w,h,((i%3)-1)*.001),m.teeth,x,y,.135-Math.abs(t)*.011);
      tooth.rotation.z=side*t*.16+(i%2?-.025:.025);tooth.rotation.y=-t*.29;
    }
  }
  // Bellhop cap has a curved crown and compressed leather band, not a straight cylinder.
  const capProfile=[[.207,.187],[.214,.206],[.214,.242],[.19,.267],[.13,.278],[0,.275]].map(p=>new THREE.Vector2(...p));
  mesh(g,new THREE.LatheGeometry(capProfile,40),m.coat,0,0,-.052,[1,1,.86]);
  mesh(g,new THREE.CylinderGeometry(.213,.210,.024,32),m.leather,0,.194,-.052,[1,1,.88]);
  const piping=mesh(g,new THREE.TorusGeometry(.212,.0028,5,40),m.brass,0,.212,-.052,[1,.86,1]);piping.rotation.x=Math.PI/2;
  mesh(g,new THREE.SphereGeometry(.018,16,10),m.brass,0,.235,.134,[.78,1,.20]);
  const badge=mesh(g,new THREE.BoxGeometry(.014,.003,.004),m.black,0,.235,.139);badge.rotation.z=-.35;
  batchRigid(g);return g;
}

function coatGeometry(){
  const profile=[[.225,.62],[.251,.65],[.245,.72],[.230,.88],[.228,1.00],[.259,1.20],[.286,1.31],[.258,1.36],[.137,1.43]].map(p=>new THREE.Vector2(...p));
  const g=new THREE.LatheGeometry(profile,40),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(x,z);
    const folds=(Math.sin(a*9+y*13)*.003+Math.sin(a*15-y*5)*.0015)*Math.max(0,1-(y-.5));
    p.setXYZ(i,x+Math.sin(a)*folds,y,z*.69+Math.cos(a)*folds);
  }
  g.computeVertexNormals();return g;
}

function lapelGeometry(side){
  const s=new THREE.Shape();s.moveTo(0,.14);s.lineTo(side*.105,.06);s.lineTo(side*.065,-.04);s.lineTo(side*.112,-.10);s.lineTo(0,-.26);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.012,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.003,bevelThickness:.003});
}

export function createAttendant(m){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  mesh(body,coatGeometry(),m.coat);
  mesh(body,new THREE.CylinderGeometry(.092,.115,.15,20),m.shirt,0,1.42,0,[1,1,.8]);
  for(const side of [-1,1]){
    mesh(body,lapelGeometry(side),m.lapel,side*.031,1.28,.163);
    for(const y of [.76,.94,1.12])mesh(body,new THREE.SphereGeometry(.012,12,8),m.brass,side*.065,y,.176,[1,1,.40]);
    mesh(body,curveTube([[side*.13,.58,.146],[side*.125,.8,.160],[side*.11,1.06,.16],[side*.16,1.26,.155]],.002,14),m.lapel);
    const pocket=mesh(body,new THREE.BoxGeometry(.117,.023,.014),m.lapel,side*.155,.78,.147);pocket.rotation.z=side*-.09;
    mesh(body,new THREE.BoxGeometry(.083,.009,.016),m.coat,side*.155,.785,.153).rotation.z=side*-.09;
    // Shoulder welt catches a subdued edge of light on the dark uniform.
    mesh(body,curveTube([[side*.14,1.381,.050],[side*.235,1.365,.061],[side*.282,1.322,.018]],.0035,10),m.lapel);
  }
  mesh(body,new THREE.BoxGeometry(.070,.026,.007),m.brass,-.12,1.205,.171);
  mesh(body,new THREE.SphereGeometry(.025,12,8),m.lapel,0,1.395,.096,[1,.68,.46]);
  for(const side of [-1,1])mesh(body,new THREE.SphereGeometry(.036,12,8),m.lapel,side*.035,1.395,.091,[1,.57,.30]).rotation.z=side*.18;
  batchRigid(body);
  const head=attendantHead(m);head.position.set(0,1.64,.026);body.add(head);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.276,1.30,0);body.add(arm);
    const upper=mesh(arm,new THREE.CapsuleGeometry(.071,.23,5,16),m.coat,side*.019,-.145,-.004,[1,1,.89]);upper.rotation.z=side*.045;
    mesh(arm,curveTube([[side*.061,-.04,0],[side*.070,-.14,.004],[side*.049,-.25,.006]],.002,9),m.lapel);
    batchRigid(arm);
    const elbow=new THREE.Group();elbow.position.set(side*.024,-.29,0);elbow.rotation.x=-.22;arm.add(elbow);
    mesh(elbow,new THREE.CapsuleGeometry(.054,.20,5,16),m.coat,0,-.12,0,[1,1,.9]);
    mesh(elbow,new THREE.CylinderGeometry(.057,.055,.043,16),m.lapel,0,-.235,0);
    for(const y of [-.221,-.242])mesh(elbow,new THREE.SphereGeometry(.005,8,6),m.brass,side*.053,y,.015);
    mesh(elbow,new THREE.SphereGeometry(.052,16,12),m.leather,0,-.307,.008,[.89,1.33,.57]);
    for(let i=0;i<4;i++){
      const finger=mesh(elbow,new THREE.CapsuleGeometry(.009,.046-(i===3?.011:0),3,8),m.leather,(i-1.5)*.021,-.369+(i===3?.006:0),.015);finger.rotation.z=(i-1.5)*.055;
    }
    mesh(elbow,new THREE.CapsuleGeometry(.012,.025,3,8),m.leather,side*.046,-.318,.022).rotation.z=side*.48;
    batchRigid(elbow);limbs.push({node:arm,elbow,side,leg:false});
    const leg=new THREE.Group();leg.position.set(side*.13,.80,0);root.add(leg);
    const trouserProfile=[[.064,-.70],[.068,-.62],[.070,-.45],[.076,-.33],[.083,-.12],[.079,0]].map(p=>new THREE.Vector2(...p));
    mesh(leg,new THREE.LatheGeometry(trouserProfile,20),m.lapel,0,0,-.004,[1,1,.92]);
    mesh(leg,curveTube([[0,-.055,.067],[0,-.35,.068],[0,-.65,.050]],.0025,10),m.coat);
    mesh(leg,new THREE.SphereGeometry(.115,20,12),m.leather,0,-.715,.057,[.77,.52,1.43]);
    mesh(leg,new THREE.BoxGeometry(.143,.023,.243),m.black,0,-.764,.05);
    batchRigid(leg);limbs.push({node:leg,side,leg:true});
  }
  const shadow=mesh(root,new THREE.PlaneGeometry(.85,.65),contactShade(),0,.015,0);shadow.rotation.x=-Math.PI/2;
  return {root,body,limbs};
}
