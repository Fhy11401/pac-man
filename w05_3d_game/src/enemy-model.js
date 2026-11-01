import * as THREE from '../vendor/three.module.js';
import {contactShade} from './hotel-materials.js';

const mesh=(parent,geometry,material,x=0,y=0,z=0,scale=[1,1,1])=>{
  const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);item.scale.set(...scale);item.receiveShadow=true;parent.add(item);return item;
};
const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2));

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

function leatherSurface(){
  const width=512,height=256,color=new Uint8Array(width*height*4),detail=new Uint8Array(width*height*4);
  let seed=71931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const u=(col+.5)/width,v=(row+.5)/height,a=u*Math.PI*2,t=(1-v)*Math.PI;
    const sy=Math.cos(t),jaw=1-.20*Math.exp(-(((sy+.70)/.34)**2)),temple=1-.09*Math.exp(-(((sy-.30)/.25)**2));
    const x=-Math.cos(a)*Math.sin(t)*.204*jaw*temple,y=sy*.258,front=Math.max(0,Math.sin(a));
    const grain=random()-.5,wear=(Math.sin(a*5+t*3)+Math.sin(a*11-t*4))*.5;
    const worn=front*(gaussian(x,y,0,.12,.12,.15)+gaussian(x,y,.11,-.02,.06,.09));
    const soil=front*(gaussian(x,y,-.116,-.105,.048,.085)*.65+gaussian(x,y,.087,.042,.05,.022)*.35);
    // Wear follows cut edges, the repair and the parts touched by hands. Broad
    // absorbed stains remain separate from the fine physical grain.
    const seamX=-.146+.006*Math.sin(y*13),seamHalo=gaussian(x,y,seamX,-.005,.014,.144),seamDirt=gaussian(x,y,seamX,-.005,.0035,.132);
    const mx=x/.104,my=(y+.112-.030*mx*mx)/.025;
    const mouthEdge=Math.exp(-(((Math.hypot(mx,my)-1)/.15)**2));
    let eyeEdge=0,crease=0;
    for(const side of [-1,1]){
      const ex=(x-side*.076)/.046,ey=(y-.055-side*(x-side*.076)*.16)/.019;
      eyeEdge+=Math.exp(-(((Math.hypot(ex,ey)-1)/.20)**2));
      const line=side*(.055+(.02-y)*.68);crease+=Math.exp(-(((x-line)/.006)**2))*Math.exp(-(((y+.050)/.069)**4));
    }
    const rubbing=gaussian(x,y,-.065,.16,.06,.048)*14+gaussian(x,y,.135,-.035,.028,.08)*14;
    const absorbed=gaussian(x,y,-.072,-.150,.052,.035)*23+gaussian(x,y,.145,.115,.044,.073)*17;
    const ageing=front*(mouthEdge*16+eyeEdge*9+seamHalo*13-seamDirt*22+rubbing-absorbed-crease*9);
    const dye=wear*4+grain*2+worn*9-soil*24+ageing,index=(row*width+col)*4;
    color[index]=153+dye;color[index+1]=143+dye*.94-soil*3;color[index+2]=126+dye*.84-soil*5;color[index+3]=255;
    // Grain changes the grazing reflection, rather than drawing black pores on the face.
    detail[index]=128+grain*26+wear*3;
    detail[index+1]=208-worn*28+soil*13+grain*8;detail[index+2]=128;detail[index+3]=255;
  }
  const map=detailTexture(color,width,height,true),micro=detailTexture(detail,width,height);
  map.name='aged-mask-color';micro.name='leather-height-roughness';micro.userData.hotelAssetOwned=true;return{map,micro};
}

// Nonuniform skull profile: brow, cheekbones, narrow temples, squared jaw and chin.
// The eyes and mouth are cut into the front surface, not flat patches over a sphere.
function faceSurface(x,y,z){
  const front=Math.max(0,z/.17),mouthX=x/.112,mouthY=(y-(-.112+.034*mouthX*mouthX))/.031;
  const sockets=[-1,1].reduce((n,s)=>n+.025*gaussian(x,y,s*.076,.055,.051,.032),0);
  const brows=[-1,1].reduce((n,s)=>n+(.018+s*.002)*gaussian(x,y,s*.073,.102+s*.003,.058,.026),0);
  const cheeks=[-1,1].reduce((n,s)=>n+.019*gaussian(x,y,s*.123,-.021,.041,.040)-.014*gaussian(x,y,s*.105,-.079,.048,.037),0);
  const nose=.045*gaussian(x,y,.003,.010,.023,.075)+.034*gaussian(x,y,.002,-.033,.035,.024);
  const philtrum=-.009*gaussian(x,y,0,-.073,.012,.023),chin=.023*gaussian(x,y,0,-.188,.070,.045);
  const mouth=Math.exp(-(mouthX**4+mouthY**4)*.6)*.015;
  const folds=[-1,1].reduce((n,s)=>{
    const line=s*(.055+(.02-y)*.68),along=Math.exp(-(((y+.050)/.069)**4));
    return n-.0045*Math.exp(-(((x-line)/.010)**2))*along;
  },0);
  const templeSeam=-.0025*gaussian(x,y,-.146,.015,.009,.13);
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

function toothGeometry(width,height,skew=0,kind='incisor',row=1){
  // Broad cutting faces and narrow roots, rather than uniformly oval beads.
  const g=new THREE.SphereGeometry(1,10,8),p=g.attributes.position,colors=[];
  const square=(value,power)=>Math.sign(value)*Math.abs(value)**power;
  for(let i=0;i<p.count;i++){
    const sx=square(p.getX(i),.26),sy=square(p.getY(i),.27),root=(sy*row+1)/2;
    const taper=kind==='incisor'?.98-root*.15:.97-root*.10;
    const tip=kind==='canine'?(1-Math.abs(sx))*.16:kind==='premolar'||kind==='molar'?(Math.cos(sx*Math.PI*2)*.5+.5)*.045:0;
    const y=sy*height*.5-row*tip*height*(1-root)**5;
    p.setXYZ(i,sx*width*.5*taper+skew*root,y,square(p.getZ(i),.32)*.008*(.94+.06*(1-sx*sx)));
    const stain=root**3;colors.push(1-stain*.16,1-stain*.22,1-stain*.30);
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
  const weave=fabric(),hide=leatherSurface();
  // Loading a real mask normal/roughness may dispose its fallback handle. The
  // gloves keep a distinct handle sharing the same source pixels and GPU image.
  const garmentLeather=hide.micro.clone();garmentLeather.name='garment-leather-height-roughness';garmentLeather.userData.hotelAssetOwned=false;
  return {
    coat:new THREE.MeshStandardMaterial({color:0x322d2b,bumpMap:weave,bumpScale:.0008,roughnessMap:weave,roughness:1,envMapIntensity:.16}),
    lapel:new THREE.MeshStandardMaterial({color:0x191c1b,bumpMap:weave,bumpScale:.0006,roughnessMap:weave,roughness:.86,envMapIntensity:.18}),
    // Preserve the public porcelain key used by the world and jumpscare model.
    porcelain:new THREE.MeshStandardMaterial({color:0xe6dfd1,map:hide.map,bumpMap:hide.micro,bumpScale:.0012,roughnessMap:hide.micro,roughness:.91,vertexColors:true,envMapIntensity:.26}),
    lip:new THREE.MeshStandardMaterial({color:0x56483b,roughness:.88}),
    teeth:new THREE.MeshStandardMaterial({color:0xbfb59c,roughness:.40,vertexColors:true,envMapIntensity:.22}),
    leather:new THREE.MeshStandardMaterial({color:0x191b18,bumpMap:garmentLeather,bumpScale:.0004,roughnessMap:garmentLeather,roughness:.65,envMapIntensity:.25}),
    black:new THREE.MeshStandardMaterial({color:0x050606,roughness:.87}),
    brass:new THREE.MeshStandardMaterial({color:0x9e895e,metalness:.68,roughness:.42,envMapIntensity:.55}),
    eye:new THREE.MeshStandardMaterial({color:0x80603f,emissive:0x80220d,emissiveIntensity:.18,roughness:.30,envMapIntensity:.35}),
    wet:new THREE.MeshPhysicalMaterial({color:0x191d18,roughness:.20,clearcoat:.65,clearcoatRoughness:.08,envMapIntensity:.40}),
    shirt:new THREE.MeshStandardMaterial({color:0xa9a395,bumpMap:weave,bumpScale:.0004,roughnessMap:weave,roughness:.94})
  };
}

export function attendantHead(m){
  const g=new THREE.Group();g.name='attendant-head';
  mesh(g,new THREE.SphereGeometry(.206,28,20),m.black,0,0,-.062,[.98,1.22,.88]);
  mesh(g,maskGeometry(),m.porcelain);
  // Separate recessed eyeballs, upper lids, lower bags and nostrils read under grazing light.
  for(const side of [-1,1]){
    mesh(g,new THREE.SphereGeometry(.027,20,12),m.wet,side*.076,.054,.112,[.96,.72,.82]);
    mesh(g,new THREE.SphereGeometry(.0066,12,8),m.eye,side*.076,.053,.134,[1,1,.20]);
    mesh(g,new THREE.SphereGeometry(.0031,10,6),m.black,side*.076,.053,.1355,[1,1,.20]);
    const upper=[],lower=[];
    for(let i=0;i<=12;i++){
      const t=i/12*Math.PI,x=side*.076+Math.cos(t)*.047;
      const uy=.055+Math.sin(t)*.020+side*(x-side*.076)*.16,ly=.055-Math.sin(t)*.019+side*(x-side*.076)*.16;
      upper.push([x,uy,faceDepth(x,uy)+.0007]);lower.push([x,ly,faceDepth(x,ly)+.0005]);
    }
    mesh(g,curveTube(upper,.0029,16),m.porcelain);mesh(g,curveTube(lower,.0021,16),m.lip);
    mesh(g,new THREE.SphereGeometry(.0065,12,8),m.black,side*.016,-.047,faceDepth(side*.016,-.047)+.0007,[.9,.42,.20]);
    mesh(g,new THREE.SphereGeometry(.026,16,12),m.leather,side*.198,-.006,-.028,[.52,1.48,.70]);
    mesh(g,new THREE.SphereGeometry(.013,12,8),m.lip,side*.207,-.009,-.013,[.30,1.40,.45]);
    mesh(g,curveTube([[side*.185,.078,.020],[side*.200,.068,-.064],[side*.155,.059,-.160]],.006,10),m.leather);
  }
  // A stitched repair and its recessed line make this read as a physical mask.
  const seam=[];for(let i=0;i<=16;i++){const y=-.129+i*.015,x=-.146+.006*Math.sin(y*13);seam.push([x,y,faceDepth(x,y)+.001]);}
  mesh(g,curveTube(seam,.0012,16),m.lip);
  for(let i=0;i<11;i++){
    const y=-.12+i*.022,x=-.146+.006*Math.sin(y*13),points=[[-.0035,-.001],[0,.0007],[.0035,.0018]].map(([dx,dy])=>[x+dx,y+dy,faceDepth(x+dx,y+dy)+.002]);
    mesh(g,curveTube(points,.0008,2),m.lip);
  }
  // The cavity sits behind the cut mesh, and the smile follows its shallow curved opening.
  mesh(g,new THREE.SphereGeometry(.115,28,14),m.black,0,-.108,.097,[1,.34,.26]);
  for(const side of [-1,1]){
    const lip=[];
    for(let i=0;i<=20;i++){const t=-1+i/10,x=t*.104,y=-.112+.030*t*t+side*.025*Math.sqrt(Math.max(0,1-t*t));lip.push([x,y,faceDepth(x,y)+.0004]);}
    mesh(g,curveTube(lip,side>0?.0025:.003,24),m.lip);
    const positions=[.0093,.0272,.0442,.0602,.0750,.0882],widths=[.0180,.0168,.0156,.0152,.0141,.0122];
    const kinds=['incisor','incisor','canine','premolar','premolar','molar'],offsets=[-.00035,.00050,-.00020,.00035,0,-.00030];
    for(const half of [-1,1])for(let i=0;i<positions.length;i++){
      const x=half*positions[i]+offsets[i]*(half>0?1:-.65)+(side<0?.0008:0),t=x/.087,mx=x/.104;
      const opening=.025*Math.sqrt(1-mx*mx),y=-.112+.030*mx*mx+side*opening*.48+offsets[(i+2)%offsets.length];
      const crown=kinds[i]==='canine'?1.06:i>=3?.89:1,h=opening*(side>0?.93:.78)*crown,w=widths[i]*(side>0?1:.97);
      const tooth=mesh(g,toothGeometry(w,h,offsets[i]*.6,kinds[i],side),m.teeth,x,y,.134-Math.abs(t)*.0105+offsets[i]*.8);
      tooth.rotation.z=side*t*.11+(i%2?-.018:.023)*half;tooth.rotation.y=-t*.26+(side<0?.015:-.01);
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
  const stations=[[.225,.62],[.251,.65],[.245,.72],[.230,.88],[.228,1.00],[.259,1.20],[.286,1.31],[.258,1.36],[.137,1.43]],profile=[];
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

function collarGeometry(side){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
    side*.012,1.445,.087, side*.086,1.413,.113, side*.094,1.336,.188, side*.022,1.383,.149,
  ],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));
  g.setIndex(side>0?[0,2,1,0,3,2]:[0,1,2,0,2,3]);g.computeVertexNormals();return g;
}

function lapelGeometry(side){
  const s=new THREE.Shape();s.moveTo(0,.14);s.lineTo(side*.105,.06);s.lineTo(side*.065,-.04);s.lineTo(side*.112,-.10);s.lineTo(0,-.26);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.012,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.003,bevelThickness:.003});
}

export function createAttendant(m){
  const root=new THREE.Group(),body=new THREE.Group();body.name='attendant-body';root.add(body);
  mesh(body,coatGeometry(),m.coat);
  mesh(body,new THREE.CylinderGeometry(.092,.115,.15,20),m.shirt,0,1.42,0,[1,1,.8]);
  for(const side of [-1,1]){
    mesh(body,collarGeometry(side),m.shirt);
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
    const arm=new THREE.Group();arm.name=`attendant-arm-${side}`;arm.position.set(side*.276,1.30,0);body.add(arm);
    const upper=mesh(arm,sleeveGeometry(true),m.coat,side*.019,0,-.004);upper.rotation.z=side*.045;
    mesh(arm,curveTube([[side*.061,-.04,0],[side*.070,-.14,.004],[side*.049,-.25,.006]],.002,9),m.lapel);
    batchRigid(arm);
    const elbow=new THREE.Group();elbow.name=`attendant-elbow-${side}`;elbow.position.set(side*.024,-.29,0);elbow.rotation.x=-.22;arm.add(elbow);
    mesh(elbow,sleeveGeometry(false),m.coat);
    mesh(elbow,new THREE.CylinderGeometry(.057,.055,.043,16),m.lapel,0,-.235,0);
    for(const y of [-.221,-.242])mesh(elbow,new THREE.SphereGeometry(.005,8,6),m.brass,side*.053,y,.015);
    mesh(elbow,new THREE.SphereGeometry(.052,16,12),m.leather,0,-.307,.008,[.89,1.33,.57]);
    for(let i=0;i<4;i++){
      const finger=mesh(elbow,new THREE.CapsuleGeometry(.009,.046-(i===3?.011:0),3,8),m.leather,(i-1.5)*.021,-.369+(i===3?.006:0),.015);finger.rotation.z=(i-1.5)*.055;
    }
    mesh(elbow,new THREE.CapsuleGeometry(.012,.025,3,8),m.leather,side*.046,-.318,.022).rotation.z=side*.48;
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
