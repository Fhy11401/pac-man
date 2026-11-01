import {enableThreatShadow} from './threat-lighting.js';
import * as THREE from '../vendor/three.module.js';
import {contactShade} from './hotel-materials.js';

const mesh=(parent,geometry,material,x=0,y=0,z=0,scale=[1,1,1])=>{
  const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);item.scale.set(...scale);item.receiveShadow=true;parent.add(item);return item;
};
const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));
const MOUTH_HALF_WIDTH=.178,MOUTH_Y=-.126,MOUTH_LIFT=.108,MOUTH_HEIGHT=.014;
const EYE_X=.076,EYE_Y=.066,EYE_RX=.049,EYE_RY=.049;
const mouthCentre=x=>MOUTH_Y+MOUTH_LIFT*(x/MOUTH_HALF_WIDTH)**2;

function fabric(){
  const size=256,data=new Uint8Array(size*size*4);
  // Height and roughness are independent linear channels, with subdued twill.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,thread=Math.sin((x+y)*Math.PI/4),cross=Math.cos(y*Math.PI);
    data[i]=128+thread*13+cross*3;data[i+1]=231+thread*9;data[i+2]=128;data[i+3]=255;
  }
  const t=detailTexture(data,size,size);t.repeat.set(3,3);t.name='uniform-twill-height-roughness';return t;
}

function detailTexture(data,width,height,color=false){
  const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true;t.anisotropy=4;t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;
}

function skinSurface(){
  const width=512,height=256,color=new Uint8Array(width*height*4),detail=new Uint8Array(width*height*4);
  let seed=71931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const u=(col+.5)/width,v=(row+.5)/height,a=u*Math.PI*2,t=(1-v)*Math.PI;
    const sy=Math.cos(t),jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
    const x=-Math.cos(a)*Math.sin(t)*.204*jaw*temple,y=sy*.258,front=Math.max(0,Math.sin(a));
    const grain=random()-.5,wear=(Math.sin(a*5+t*3)+Math.sin(a*11-t*4))*.5;
    const worn=front*(gaussian(x,y,0,.12,.12,.15)+gaussian(x,y,.11,-.02,.06,.09));
    const soil=front*(gaussian(x,y,-.116,-.105,.048,.085)*.65+gaussian(x,y,.087,.042,.05,.022)*.35);
    // Broad mottling and shadowed orbital rims remain separate from fine pores.
    const mx=x/MOUTH_HALF_WIDTH,my=(y-mouthCentre(x))/MOUTH_HEIGHT;
    const mouthEdge=Math.exp(-(((Math.hypot(mx,my)-1)/.15)**2));
    let eyeEdge=0,crease=0;
    for(const side of [-1,1]){
      const ex=(x-side*EYE_X)/EYE_RX,ey=(y-EYE_Y)/EYE_RY;
      eyeEdge+=Math.exp(-(((Math.hypot(ex,ey)-1)/.20)**2));
      const line=side*(.055+(.02-y)*.68);crease+=Math.exp(-(((x-line)/.006)**2))*Math.exp(-(((y+.050)/.069)**4));
    }
    const rubbing=gaussian(x,y,-.065,.16,.06,.048)*14+gaussian(x,y,.135,-.035,.028,.08)*14;
    const absorbed=gaussian(x,y,-.072,-.150,.052,.035)*23+gaussian(x,y,.145,.115,.044,.073)*17;
    const ageing=front*(mouthEdge*5-eyeEdge*28+rubbing*.35-absorbed*.65-crease*11);
    const dye=wear*4+grain*2+worn*9-soil*24+ageing,index=(row*width+col)*4;
    const discoloration=front*eyeEdge;
    color[index]=190+dye-discoloration*9;color[index+1]=163+dye*.94-soil*3-discoloration*20;color[index+2]=147+dye*.84-soil*5-discoloration*4;color[index+3]=255;
    // Grain changes the grazing reflection, rather than drawing black pores on the face.
    detail[index]=128+grain*26+wear*3;
    detail[index+1]=208-worn*28+soil*13+grain*8;detail[index+2]=128;detail[index+3]=255;
  }
  const map=detailTexture(color,width,height,true),micro=detailTexture(detail,width,height);
  map.name='pallid-face-color';micro.name='leather-height-roughness';micro.userData.hotelAssetOwned=true;return{map,micro};
}

// Nonuniform skull profile: brow, cheekbones, narrow temples, squared jaw and chin.
// The eyes and mouth are cut into the front surface, not flat patches over a sphere.
function faceSurface(x,y,z){
  const front=Math.max(0,z/.17),mouthX=x/MOUTH_HALF_WIDTH,mouthY=(y-mouthCentre(x))/.039;
  const sockets=[-1,1].reduce((n,s)=>n+.038*gaussian(x,y,s*EYE_X,EYE_Y,.064,.060),0);
  const brows=[-1,1].reduce((n,s)=>n+(.006+s*.001)*gaussian(x,y,s*.073,.130+s*.003,.058,.026),0);
  const cheeks=[-1,1].reduce((n,s)=>n+.019*gaussian(x,y,s*.123,-.021,.041,.040)-.014*gaussian(x,y,s*.105,-.079,.048,.037),0);
  const nose=.037*gaussian(x,y,.003,.010,.018,.085)+.028*gaussian(x,y,.002,-.036,.025,.028);
  const philtrum=-.009*gaussian(x,y,0,-.073,.012,.023),chin=.023*gaussian(x,y,0,-.188,.070,.045);
  const mouth=Math.exp(-(mouthX**4+mouthY**4)*.6)*.015;
  const folds=[-1,1].reduce((n,s)=>{
    const line=s*(.055+(.02-y)*.68),along=Math.exp(-(((y+.050)/.069)**4));
    return n-.0045*Math.exp(-(((x-line)/.010)**2))*along;
  },0);
  const templeSeam=0;
  return z+front*(nose+brows+cheeks-sockets+philtrum+chin-mouth+folds+templeSeam);
}

function faceDepth(x,y){
  const sy=y/.258,jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
  return faceSurface(x,y,.172*Math.sqrt(Math.max(0,1-(x/(.204*jaw*temple))**2-sy*sy)));
}

function maskGeometry(){
  const g=new THREE.SphereGeometry(1,72,56),p=g.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const sy=p.getY(i),y=sy*.258;
    const jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
    const x=p.getX(i)*.204*jaw*temple,z=p.getZ(i)*.172;
    p.setXYZ(i,x,y,z>0?faceSurface(x,y,z):z);
    const socket=[-1,1].reduce((n,s)=>n+gaussian(x,y,s*EYE_X,EYE_Y,.068,.067),0);
    const cheek=[-1,1].reduce((n,s)=>n+gaussian(x,y,s*.126,-.077,.044,.045),0);
    const ao=z>0?Math.min(.55,socket*.43+cheek*.16):.12;
    colors.push(1-ao,1-ao*1.10,1-ao*1.12);
  }
  const indices=[],index=g.index;
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),d=index.getX(i+2);
    const x=(p.getX(a)+p.getX(b)+p.getX(d))/3,y=(p.getY(a)+p.getY(b)+p.getY(d))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(d))/3;
    const mouthX=x/MOUTH_HALF_WIDTH,mouthY=(y-mouthCentre(x))/MOUTH_HEIGHT;
    const mouth=mouthX*mouthX+mouthY*mouthY<1;
    const eye=[-1,1].some(s=>((x-s*EYE_X)/EYE_RX)**2+((y-EYE_Y)/EYE_RY)**2<1);
    if(!((z>.035&&mouth)||(z>.08&&eye)))indices.push(a,b,d);
  }
  // Snap cut boundaries onto the curves. Removing triangles alone leaves a saw-tooth lip.
  const edges=new Map();for(let i=0;i<indices.length;i+=3)for(const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  const rim=new Set();for(const [key,count] of edges)if(count===1)key.split(':').forEach(i=>rim.add(Number(i)));
  for(const i of rim){
    let x=p.getX(i),y=p.getY(i);if(p.getZ(i)<.035)continue;
    if(y<.012&&y>-.18&&Math.abs(x)<.20){
      const dx=x/MOUTH_HALF_WIDTH,dy=(y-mouthCentre(x))/MOUTH_HEIGHT,r=Math.hypot(dx,dy);if(r>.55&&r<1.7){x=dx/r*MOUTH_HALF_WIDTH;y=mouthCentre(x)+dy/r*MOUTH_HEIGHT;p.setXYZ(i,x,y,faceDepth(x,y));}
    }else if(y>.010&&y<.135){
      const side=Math.sign(x),cx=side*EYE_X,dx=(x-cx)/EYE_RX,dy=(y-EYE_Y)/EYE_RY,r=Math.hypot(dx,dy);
      if(r>.55&&r<1.8){x=cx+dx/r*EYE_RX;y=EYE_Y+dy/r*EYE_RY;p.setXYZ(i,x,y,faceDepth(x,y));}
    }
  }
  g.setIndex(indices);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

function curveTube(points,radius=.004,segments=20){
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,5,false);
}

function toothGeometry(width,height,skew=0,kind='incisor',row=1){
  // Broad cutting faces and narrow roots, rather than uniformly oval beads.
  const g=new THREE.SphereGeometry(1,8,6),p=g.attributes.position,colors=[];
  const square=(value,power)=>Math.sign(value)*Math.abs(value)**power;
  for(let i=0;i<p.count;i++){
    const sx=square(p.getX(i),.36),sy=square(p.getY(i),.30),root=(sy*row+1)/2;
    const taper=kind==='incisor'?.98-root*.25:.97-root*.19;
    const tip=kind==='canine'?(1-Math.abs(sx))*.16:kind==='premolar'||kind==='molar'?(Math.cos(sx*Math.PI*2)*.5+.5)*.045:0;
    const y=sy*height*.5-row*tip*height*(1-root)**5;
    p.setXYZ(i,sx*width*.5*taper+skew*root,y,square(p.getZ(i),.65)*.008*(.94+.06*(1-sx*sx)));
    const stain=root**2;colors.push(1-stain*.23,1-stain*.32,1-stain*.43);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
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
  const weave=fabric(),hide=skinSurface();
  // Loading a real mask normal/roughness may dispose its fallback handle. The
  // gloves keep a distinct handle sharing the same source pixels and GPU image.
  const garmentLeather=hide.micro.clone();garmentLeather.name='garment-leather-height-roughness';garmentLeather.userData.hotelAssetOwned=false;
  const materials={
    coat:new THREE.MeshStandardMaterial({color:0x211c1e,bumpMap:weave,bumpScale:.0008,roughnessMap:weave,roughness:1,envMapIntensity:.16}),
    lapel:new THREE.MeshStandardMaterial({color:0x191c1b,bumpMap:weave,bumpScale:.0006,roughnessMap:weave,roughness:.86,envMapIntensity:.18}),
    // Preserve the public porcelain key used by the world and jumpscare model.
    porcelain:new THREE.MeshStandardMaterial({color:0xeee0d7,map:hide.map,bumpMap:hide.micro,bumpScale:.00045,roughnessMap:hide.micro,roughness:.98,vertexColors:true,envMapIntensity:.14}),
    lip:new THREE.MeshStandardMaterial({color:0x754c4b,roughness:.91}),
    teeth:new THREE.MeshStandardMaterial({color:0x827765,roughness:.62,vertexColors:true,envMapIntensity:.22}),
    leather:new THREE.MeshStandardMaterial({color:0x191b18,bumpMap:garmentLeather,bumpScale:.0004,roughnessMap:garmentLeather,roughness:.65,envMapIntensity:.25}),
    hair:new THREE.MeshStandardMaterial({color:0x141211,bumpMap:garmentLeather,bumpScale:.0003,roughnessMap:garmentLeather,roughness:.78,side:THREE.DoubleSide,envMapIntensity:.20}),
    black:new THREE.MeshStandardMaterial({color:0x050606,roughness:.87}),
    brass:new THREE.MeshStandardMaterial({color:0x9e895e,metalness:.68,roughness:.42,envMapIntensity:.55}),
    eye:new THREE.MeshStandardMaterial({color:0x3b3e30,emissive:0x000000,emissiveIntensity:0,roughness:.34,envMapIntensity:.20}),
    wet:new THREE.MeshPhysicalMaterial({color:0xc8c9ad,roughness:.31,clearcoat:.25,clearcoatRoughness:.16,envMapIntensity:.22}),
    shirt:new THREE.MeshStandardMaterial({color:0xa9a395,bumpMap:weave,bumpScale:.0004,roughnessMap:weave,roughness:.94})
  };
  for(const key of ['porcelain','lip','teeth','eye','wet'])enableThreatShadow(materials[key]);
  return materials;
}

// Bake a common anatomical deformation into every rigid surface, including
// eyelids, teeth and seams, so openings stay aligned without extra draw calls.
function refineHeadAnatomy(head){
  const warp=(x,y,z,out)=>{let nx=x,ny=y,nz=z;
      const front=Math.max(0,Math.min(1,(z-.035)/.045));
      // Keep the broad smile continuous with the cut surface and both tooth rows.
      const mouth=front*gaussian(x,y,0,-.085,.19,.075);
      ny+=.004*(x/MOUTH_HALF_WIDTH)*mouth;
      for(const side of [-1,1]){
        const eye=front*gaussian(x,y,side*EYE_X,EYE_Y,.061,.052);
        ny+=side*.0025*eye;
      }
      const hollow=front*gaussian(x,y,Math.sign(x)*.124,-.067,.045,.058);
      nz-=.025*hollow;
      nx*=1-.18*Math.exp(-(((y+.16)/.085)**2));
      ny-=.013*front*gaussian(x,y,0,-.22,.06,.045);
      return out.set(nx*.62,ny*.66,nz*.76);
  };
  const base=new THREE.Vector3(),dx=new THREE.Vector3(),dy=new THREE.Vector3(),dz=new THREE.Vector3(),normal=new THREE.Vector3(),jacobian=new THREE.Matrix3(),epsilon=.00001;
  head.traverse(item=>{if(!item.isMesh)return;const geometry=item.geometry;item.updateMatrix();geometry.applyMatrix4(item.matrix);item.position.set(0,0,0);item.quaternion.identity();item.scale.setScalar(1);const p=geometry.attributes.position,n=geometry.attributes.normal;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);warp(x,y,z,base);
      warp(x+epsilon,y,z,dx).sub(base).divideScalar(epsilon);warp(x,y+epsilon,z,dy).sub(base).divideScalar(epsilon);warp(x,y,z+epsilon,dz).sub(base).divideScalar(epsilon);
      jacobian.set(dx.x,dy.x,dz.x,dx.y,dy.y,dz.y,dx.z,dy.z,dz.z).invert().transpose();
      normal.fromBufferAttribute(n,i).applyMatrix3(jacobian).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);p.setXYZ(i,base.x,base.y,base.z);
    }
    // Preserve the smooth source normals across the batched triangle seams.
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
  });
}

function addHair(group,material){
  // Tapered, ridged strands retain a readable silhouette without alpha overdraw.
  const crown=new THREE.SphereGeometry(1,32,12,0,Math.PI*2,0,1.65),p=crown.attributes.position;
  for(let i=0;i<p.count;i++){
    const theta=Math.acos(Math.max(-1,Math.min(1,p.getY(i)))),azimuth=Math.atan2(p.getZ(i),p.getX(i));
    const front=Math.max(0,Math.sin(azimuth)),angle=theta/1.65*(1.65-.88*front*front);
    p.setXYZ(i,Math.sin(angle)*Math.cos(azimuth)*.209,Math.cos(angle)*.266,Math.sin(angle)*Math.sin(azimuth)*.235-.025);
  }
  crown.computeVertexNormals();mesh(group,crown,material);
  const back=[],backUV=[],backIndices=[];
  for(let i=0;i<=24;i++)for(let j=0;j<=6;j++){
    const angle=-1.5+i/24*3,t=j/6,width=.19+.012*Math.sin(t*Math.PI),wave=.003*Math.sin(i*2.1+t*6);
    back.push(Math.sin(angle)*(width+wave),.12-t*(.46+.018*Math.sin(i*1.8)),-Math.cos(angle)*(.18+wave)-.016);
    backUV.push(i/24*4,t*5);
    if(i<24&&j<6){const a=i*7+j;backIndices.push(a,a+7,a+1,a+1,a+7,a+8);}
  }
  const curtain=new THREE.BufferGeometry();curtain.setAttribute('position',new THREE.Float32BufferAttribute(back,3));curtain.setAttribute('uv',new THREE.Float32BufferAttribute(backUV,2));curtain.setIndex(backIndices);curtain.computeVertexNormals();mesh(group,curtain,material);
  const positions=[],uv=[],indices=[];
  const strand=(point,width)=>{
    const base=positions.length/3;
    for(let i=0;i<=8;i++){
      const t=i/8,[x,y,z]=point(t),w=width*(1-t*.94);
      for(const lane of [-1,0,1]){positions.push(x+lane*w,y,z+(lane===0?.0025:0));uv.push((lane+1)/2,t*3);}
      if(i<8)for(let lane=0;lane<2;lane++){const a=base+i*3+lane;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
    }
  };
  for(let i=0;i<26;i++){
    const root=-.142+i*.0113,tipY=.095+.065*(.5+.5*Math.sin(i*2.7)),bend=.018*Math.sin(i*1.9);
    strand(t=>{const x=root+bend*t,y=.218+(.004*Math.sin(i))-t*(.218-tipY);return[x,y,Math.max(.035,faceDepth(x,y))+.007+.004*Math.sin(t*Math.PI)];},.0025+.0015*(.5+.5*Math.sin(i*5)));
  }
  for(const side of [-1,1])for(let i=0;i<18;i++){
    const phase=i*.45,depth=.070-i*.0105,length=.48+.1*(.5+.5*Math.sin(i*2.3));
    strand(t=>[side*(.155+.040*Math.sin(t*Math.PI*.8)+.004*Math.sin(t*10+phase)),.205-t*length,depth+.012*Math.sin(t*7+phase)],.006+.003*(.5+.5*Math.cos(i*3)));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(group,geometry,material);
}

function mouthCavityGeometry(){
  const positions=[],indices=[];
  for(let i=0;i<=36;i++){
    const t=-1+i/18,x=t*MOUTH_HALF_WIDTH,opening=MOUTH_HEIGHT*Math.sqrt(Math.max(0,1-t*t));
    for(let j=0;j<=4;j++){
      const y=mouthCentre(x)+(-1+j/2)*opening;positions.push(x,y,faceDepth(x,y)-.035);
      if(i<36&&j<4){const a=i*5+j;indices.push(a,a+5,a+1,a+1,a+5,a+6);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function attendantHead(m){
  const g=new THREE.Group();g.name='attendant-head';
  mesh(g,new THREE.SphereGeometry(.206,24,16),m.black,0,0,-.062,[.98,1.22,.88]);
  mesh(g,maskGeometry(),m.porcelain);
  mesh(g,new THREE.CylinderGeometry(.067,.078,.16,16,1,true),m.porcelain,0,-.25,-.025);
  // Separate recessed eyeballs, upper lids, lower bags and nostrils read under grazing light.
  for(const side of [-1,1]){
    mesh(g,new THREE.SphereGeometry(.047,24,16),m.wet,side*EYE_X,EYE_Y,.133,[1,1,.9]);
    mesh(g,new THREE.SphereGeometry(.019,20,12),m.eye,side*EYE_X+side*.001,EYE_Y-.001,.175,[1,1,.22]);
    mesh(g,new THREE.SphereGeometry(.014,16,10),m.black,side*EYE_X+side*.001,EYE_Y-.001,.1785,[1,1,.15]);
    const upper=[],lower=[];
    for(let i=0;i<=16;i++){
      const t=i/16*Math.PI,x=side*EYE_X+Math.cos(t)*EYE_RX;
      const uy=EYE_Y+Math.sin(t)*EYE_RY,ly=EYE_Y-Math.sin(t)*EYE_RY;
      upper.push([x,uy,faceDepth(x,uy)+.001]);lower.push([x,ly,faceDepth(x,ly)+.001]);
    }
    mesh(g,curveTube(upper,.0036,20),m.lip);mesh(g,curveTube(lower,.0042,20),m.lip);
    mesh(g,new THREE.SphereGeometry(.0065,12,8),m.black,side*.016,-.047,faceDepth(side*.016,-.047)+.0007,[.72,.72,.22]);
    mesh(g,new THREE.SphereGeometry(.026,16,12),m.leather,side*.198,-.006,-.028,[.52,1.48,.70]);
    mesh(g,new THREE.SphereGeometry(.013,12,8),m.lip,side*.207,-.009,-.013,[.30,1.40,.45]);
    mesh(g,curveTube([[side*.185,.078,.020],[side*.200,.068,-.064],[side*.155,.059,-.160]],.006,10),m.leather);
  }
  // Recessed oral cavity; the lips and dental arches wrap toward the ears.
  mesh(g,mouthCavityGeometry(),m.black);
  for(const side of [-1,1]){
    const lip=[],gum=[];
    for(let i=0;i<=20;i++){const t=-1+i/10,x=t*MOUTH_HALF_WIDTH,y=mouthCentre(x)+side*MOUTH_HEIGHT*Math.sqrt(Math.max(0,1-t*t));lip.push([x,y,faceDepth(x,y)+.0004]);}
    mesh(g,curveTube(lip,side>0?.0032:.0048,24),m.lip);
    for(let i=0;i<=20;i++){const x=(-1+i/10)*.165,y=mouthCentre(x)+side*MOUTH_HEIGHT*Math.sqrt(1-(x/MOUTH_HALF_WIDTH)**2)*.80;gum.push([x,y,faceDepth(x,y)-.017]);}
    mesh(g,curveTube(gum,.002,16),m.lip);
    const positions=[.0093,.0272,.0442,.061,.078,.095,.112,.129,.146,.160],widths=[.018,.0168,.0156,.017,.017,.017,.017,.017,.017,.012];
    const kinds=['incisor','incisor','canine','premolar','premolar','molar','molar','molar','molar','molar'],offsets=[-.00035,.00050,-.00020,.00035,0,-.00030,.00025,-.0002,.0001,0];
    for(const half of [-1,1])for(let i=0;i<positions.length;i++){
      const x=half*positions[i]+offsets[i]*(half>0?1:-.65)+(side<0?.0008:0),t=x/.16,mx=x/MOUTH_HALF_WIDTH;
      const opening=MOUTH_HEIGHT*Math.sqrt(1-mx*mx),y=mouthCentre(x)+side*opening*.48+offsets[(i+2)%offsets.length];
      if(side<0||i>4||half<0&&i===3)continue;
      const crown=kinds[i]==='canine'?1.06:i>=3?.89:1,h=opening*.45*crown*(1+.13*Math.sin(i*2.7+half)),w=widths[i]*(side>0?.99:.96);
      const tooth=mesh(g,toothGeometry(w,h,offsets[i]*.6,kinds[i],side),m.teeth,x,y,faceDepth(x,y)-.028+offsets[i]*.8);
      tooth.rotation.z=Math.atan(2*MOUTH_LIFT*x/(MOUTH_HALF_WIDTH**2))+(i%2?-.085:.065)*half;tooth.rotation.y=-t*.65+(side<0?.015:-.01);
    }
  }
  addHair(g,m.hair);
  batchRigid(g);refineHeadAnatomy(g);return g;
}

function coatGeometry(){
  const stations=[[.305,.40],[.295,.46],[.245,.72],[.192,.88],[.187,1.00],[.222,1.20],[.242,1.31],[.208,1.36],[.090,1.43]],profile=[];
  for(let i=0;i<stations.length-1;i++)for(let k=0;k<2;k++){const t=k/2;profile.push(new THREE.Vector2(stations[i][0]*(1-t)+stations[i+1][0]*t,stations[i][1]*(1-t)+stations[i+1][1]*t));}
  profile.push(new THREE.Vector2(...stations.at(-1)));
  const g=new THREE.LatheGeometry(profile,32),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(x,z);
    const sides=Math.abs(Math.sin(a)),hem=Math.max(0,1-(y-.62)/.65);
    const drape=Math.sin(a*7+.2)*.006*hem;
    const underarm=-.010*Math.exp(-(((y-(1.24-.13*sides))/.036)**2))*sides**4;
    const waist=.006*Math.sin((y-.9)*42+sides*2)*Math.exp(-(((y-.91)/.12)**2))*sides**2;
    const folds=drape+underarm+waist;
    p.setXYZ(i,x+Math.sin(a)*folds,y,z*.69+Math.cos(a)*folds);
  }
  g.computeVertexNormals();return g;
}

function sleeveGeometry(upper){
  const stations=upper?[[0,.044],[.047,.035],[.070,.006],[.074,-.06],[.067,-.145],[.060,-.23],[.054,-.291]]:[[.052,.033],[.058,-.012],[.055,-.083],[.051,-.15],[.050,-.227],[.053,-.254]];
  const profile=[];for(let i=0;i<stations.length-1;i++)for(let k=0;k<2;k++){const t=k/2;profile.push(new THREE.Vector2(stations[i][0]*(1-t)+stations[i+1][0]*t,stations[i][1]*(1-t)+stations[i+1][1]*t));}profile.push(new THREE.Vector2(...stations.at(-1)));
  const g=new THREE.LatheGeometry(profile.reverse(),16),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(x,z),centre=upper?-.22:-.045;
    const fold=.004*Math.sin(y*90+a*1.4)*Math.exp(-(((y-centre)/.07)**2)),long=.002*Math.cos(a*5)*Math.exp(-(((y+.15)/.12)**2));
    p.setXYZ(i,x+Math.sin(a)*(fold+long),y,z*.90+Math.cos(a)*(fold+long));
  }
  g.computeVertexNormals();return g;
}

export function createAttendant(m){
  const root=new THREE.Group(),body=new THREE.Group();body.name='attendant-body';root.add(body);
  mesh(body,coatGeometry(),m.coat);
  mesh(body,new THREE.CylinderGeometry(.070,.082,.15,20),m.porcelain,0,1.42,0,[1,1,.8]);
  for(const side of [-1,1]){
    mesh(body,curveTube([[side*.20,.42,.18],[side*.15,.70,.16],[side*.11,1.02,.12],[side*.16,1.28,.13]],.002,18),m.lapel);
    mesh(body,curveTube([[side*.065,1.43,.040],[side*.09,1.397,.075],[0,1.38,.085]],.0035,12),m.lapel);
  }
  batchRigid(body);
  const head=attendantHead(m);head.position.set(0,1.64,.026);body.add(head);
  const limbs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.name=`attendant-arm-${side}`;arm.position.set(side*.238,1.30,0);body.add(arm);
    const upper=mesh(arm,sleeveGeometry(true),m.coat,side*.019,0,-.004);upper.rotation.z=side*.045;
    mesh(arm,curveTube([[side*.061,-.04,0],[side*.070,-.14,.004],[side*.049,-.25,.006]],.002,9),m.lapel);
    batchRigid(arm);
    const elbow=new THREE.Group();elbow.name=`attendant-elbow-${side}`;elbow.position.set(side*.024,-.29,0);elbow.rotation.x=-.22;arm.add(elbow);
    mesh(elbow,sleeveGeometry(false),m.coat);
    mesh(elbow,new THREE.CylinderGeometry(.057,.055,.043,16),m.lapel,0,-.235,0);
    mesh(elbow,new THREE.SphereGeometry(.052,16,12),m.porcelain,0,-.307,.008,[.79,1.33,.57]);
    for(let i=0;i<4;i++){
      const finger=mesh(elbow,new THREE.CapsuleGeometry(.009,.063-(i===3?.011:0),3,8),m.porcelain,(i-1.5)*.019,-.378+(i===3?.006:0),.015);finger.rotation.z=(i-1.5)*.055;
    }
    mesh(elbow,new THREE.CapsuleGeometry(.012,.025,3,8),m.porcelain,side*.043,-.318,.022).rotation.z=side*.48;
    batchRigid(elbow);limbs.push({node:arm,elbow,side,leg:false});
    const leg=new THREE.Group();leg.name=`attendant-hip-${side}`;leg.position.set(side*.13,.80,0);root.add(leg);
    const upperProfile=[[.073,-.401],[.077,-.34],[.083,-.12],[.079,0]].map(p=>new THREE.Vector2(...p));
    mesh(leg,new THREE.LatheGeometry(upperProfile,16),m.lapel,0,0,-.004,[1,1,.92]);
    mesh(leg,curveTube([[0,-.055,.067],[0,-.23,.071],[0,-.37,.067]],.0025,8),m.lapel);batchRigid(leg);
    const knee=new THREE.Group();knee.name=`attendant-knee-${side}`;knee.position.y=-.38;leg.add(knee);
    mesh(knee,new THREE.SphereGeometry(.074,12,8),m.lapel,0,0,-.004,[1,1,.92]);
    const lowerProfile=[[.064,-.34],[.068,-.27],[.072,-.08],[.074,.023]].map(p=>new THREE.Vector2(...p));
    mesh(knee,new THREE.LatheGeometry(lowerProfile,16),m.lapel,0,0,-.004,[1,1,.92]);
    mesh(knee,curveTube([[0,.005,.068],[0,-.15,.062],[0,-.32,.050]],.0025,8),m.lapel);batchRigid(knee);
    const ankle=new THREE.Group();ankle.name=`attendant-ankle-${side}`;ankle.position.y=-.38;knee.add(ankle);
    mesh(ankle,new THREE.SphereGeometry(.115,20,12),m.leather,0,.007,.057,[.77,.52,1.43]);
    mesh(ankle,new THREE.BoxGeometry(.143,.023,.243),m.black,0,-.0415,.05);
    batchRigid(ankle);limbs.push({node:leg,knee,ankle,side,leg:true});
  }
  const shadow=mesh(root,new THREE.PlaneGeometry(.85,.65),contactShade(),0,.015,0);shadow.rotation.x=-Math.PI/2;
  return {root,body,head,limbs};
}

// Independent joints share the exact enemy surfaces and geometry with the game.
export function cloneAttendant(model){
  const root=model.root.clone(true),copy=node=>node?root.getObjectByName(node.name):undefined;
  return{root,body:copy(model.body),head:copy(model.head),limbs:model.limbs.map(l=>({...l,node:copy(l.node),elbow:copy(l.elbow),knee:copy(l.knee),ankle:copy(l.ankle)}))};
}
