import * as THREE from '../vendor/three.module.js';

// Timber coordinates are measured in metres; the V axis follows the member.
// End grain uses the two cross axes, keeping every face's UV basis nondegenerate.
export function timberUV(geometry,axis='y'){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  if(!uv)return geometry;geometry.computeBoundingBox();
  const min=geometry.boundingBox.min.toArray(),along={x:0,y:1,z:2}[axis];
  for(let i=0;i<p.count;i++){
    const q=[p.getX(i)-min[0],p.getY(i)-min[1],p.getZ(i)-min[2]],normal=[Math.abs(n.getX(i)),Math.abs(n.getY(i)),Math.abs(n.getZ(i))];
    const face=normal.indexOf(Math.max(...normal));
    if(face===along){const cross=[0,1,2].filter(a=>a!==along);uv.setXY(i,q[cross[0]]/.36,q[cross[1]]/.36);}
    else uv.setXY(i,q[3-face-along]/.36,q[along]/1.9);
  }
  uv.needsUpdate=true;return geometry;
}

export function timberBox(v,w,h,d,x,y,z,parent,axis='y'){
  const mesh=v.box(w,h,d,v.mat.wood,x,y,z,parent);timberUV(mesh.geometry,axis);mesh.castShadow=true;return mesh;
}

export function flutedPilaster(v,parent,width,height,depth,x,z){
  const half=width/2,front=depth/2,shape=new THREE.Shape();shape.moveTo(-half,-front);
  for(const centre of [-width*.274,width*.274]){
    shape.lineTo(centre-.008,-front);shape.lineTo(centre-.005,-front+.006);
    shape.lineTo(centre+.005,-front+.006);shape.lineTo(centre+.008,-front);
  }
  shape.lineTo(half,-front);shape.lineTo(half,front);shape.lineTo(-half,front);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:1,steps:1});
  geometry.rotateX(-Math.PI/2);timberUV(geometry,'y');const mesh=v.mesh(geometry,v.mat.wood,parent);mesh.position.set(x,.0015,z);mesh.castShadow=true;return mesh;
}

function pin(v,parent,r,length,x,y,z,axis='y',material=v.mat.brass){
  const mesh=v.mesh(new THREE.CylinderGeometry(r,r,length,r>.1?32:r<.005?6:8,1),material,parent);mesh.position.set(x,y,z);
  if(axis==='x')mesh.rotation.z=Math.PI/2;if(axis==='z')mesh.rotation.x=Math.PI/2;return mesh;
}

function screw(v,parent,x,y,z){
  pin(v,parent,.0034,.002,x,y,z,'z');
  v.box(.0047,.0009,.0008,v.mat.black,x,y,z+.0012,parent);
}

function insetPanel(v,parent,x,y,w,h){
  // A flat floating panel is held behind a narrow stepped rebate, not pasted on a slab.
  v.box(w+.022,h+.022,.007,v.mat.black,x,y,.042,parent);
  timberBox(v,w-.013,h-.013,.016,x,y,.049,parent);
  for(const s of [-1,1]){
    timberBox(v,.016,h+.028,.022,x+s*(w/2+.006),y,.057,parent);
    timberBox(v,w-.004,.016,.022,x,y+s*(h/2+.006),.057,parent,'x');
  }
}

const numberMaterials=new WeakMap();
function numberMaterial(v,number){
  let cache=numberMaterials.get(v);if(!cache){cache=new Map();numberMaterials.set(v,cache);}if(cache.has(number))return cache.get(number);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const c=canvas.getContext('2d');
  c.fillStyle='#231e17';c.fillRect(0,0,256,128);c.strokeStyle='#897454';c.lineWidth=3;c.strokeRect(7,7,242,114);
  c.fillStyle='#cdbb8c';c.textAlign='center';c.font='54px Georgia';c.fillText(String(number),128,83);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map,roughness:.56,metalness:.18,envMapIntensity:.30});cache.set(number,material);return material;
}

// All coordinates lie inside the existing wall collision clearance. The hinge
// opens only a small angle; neither the frame nor the hardware blocks the route.
export function paneledDoor(v,parent,number,{height=Math.min(2.27,v.ceilingHeight-.23),ajar=false}={}){
  const width=.91,base=.025,brass=v.mat.brass,black=v.mat.black;
  parent.name='hotel-room-door';
  v.box(1.10,height+.03,.014,black,0,base+height/2,.004,parent);
  for(const s of [-1,1]){
    timberBox(v,.085,height+.025,.130,s*.511,(height+.025)/2,.070,parent);
    timberBox(v,.025,height+.108,.045,s*.568,(height+.108)/2,.038,parent);
    timberBox(v,.122,.175,.142,s*.511,.0875,.074,parent,'x');
    timberBox(v,.012,height+.015,.015,s*.460,base+height/2,.108,parent);
  }
  timberBox(v,1.107,.083,.130,0,height+.0665,.070,parent,'x');
  timberBox(v,1.165,.025,.050,0,height+.1205,.040,parent,'x');
  const leaf=new THREE.Group();leaf.name='hotel-door-leaf';leaf.position.set(-width/2,base,.023);leaf.rotation.y=ajar?-.025:0;parent.add(leaf);
  v.box(width,height,.018,black,width/2,height/2,.022,leaf);
  const stile=.083,middle=.064,lower=.13,top=.105,railY=.96,railH=.14;
  for(const x of [stile/2,width-stile/2])timberBox(v,stile,height,.038,x,height/2,.052,leaf);
  for(const [y,h] of [[lower/2,lower],[height-top/2,top],[railY,railH]])timberBox(v,width-2*stile,h,.038,width/2,y,.052,leaf,'x');
  for(const [bottom,end] of [[lower,railY-railH/2],[railY+railH/2,height-top]])timberBox(v,middle,end-bottom,.038,width/2,(bottom+end)/2,.052,leaf);
  const panelWidth=(width-2*stile-middle)/2-.033;
  for(const x of [(stile+(width-middle)/2)/2,((width+middle)/2+width-stile)/2]){
    const upperBottom=railY+railH/2+.025,upperTop=height-top-.025,lowerBottom=lower+.025,lowerTop=railY-railH/2-.025;
    insetPanel(v,leaf,x,(upperBottom+upperTop)/2,panelWidth,upperTop-upperBottom);
    insetPanel(v,leaf,x,(lowerBottom+lowerTop)/2,panelWidth,lowerTop-lowerBottom);
  }
  for(const y of [.22,height*.51,height-.23]){
    v.box(.023,.082,.006,brass,-.430,base+y,.076,parent);pin(v,parent,.006,.086,-.451,base+y,.090);
    // Hinge leaves sit on the rebate, with a visible knuckle and two fixing heads.
    v.box(.028,.077,.006,brass,-.473,base+y,.085,parent);
    screw(v,parent,-.474,base+y-.025,.089);screw(v,parent,-.474,base+y+.025,.089);
  }
  const lockX=width-.095;
  v.box(.040,.156,.010,brass,lockX,1.005,.077,leaf);pin(v,leaf,.016,.013,lockX,1.04,.091,'z');
  const lever=v.mesh(new THREE.CapsuleGeometry(.008,.086,3,8),brass,leaf);lever.rotation.z=Math.PI/2;lever.position.set(lockX-.040,1.04,.110);
  pin(v,leaf,.011,.029,lockX,1.04,.102,'z');pin(v,leaf,.005,.002,lockX,.971,.083,'z',black);
  v.box(.004,.011,.002,black,lockX,.965,.084,leaf);
  for(const y of [.944,1.065])screw(v,leaf,lockX,y,.084);
  const plate=v.mesh(new THREE.PlaneGeometry(.206,.103),numberMaterial(v,number),leaf);plate.position.set(width/2,Math.min(1.67,height-.36),.080);
  for(const x of [width/2-.092,width/2+.092])screw(v,leaf,x,Math.min(1.67,height-.36),.082);
  if(ajar)v.detailAudit.ajarDoors++;
  v.detailAudit.roomJoinery=(v.detailAudit.roomJoinery??0)+1;
  return parent;
}

export function serviceCabinet(v,parent){
  const g=new THREE.Group();g.position.set(0,1.37,0);g.name='hotel-service-cabinet';parent.add(g);
  v.box(.64,1.02,.012,v.mat.black,0,0,.010,g);
  for(const x of [-.307,.307])timberBox(v,.038,1.04,.075,x,0,.049,g);
  for(const y of [-.50,.50])timberBox(v,.58,.039,.075,0,y,.049,g,'x');
  for(const side of [-1,1]){
    const x=side*.147;timberBox(v,.282,.938,.021,x,0,.052,g);
    for(const dx of [-.115,.115])timberBox(v,.025,.927,.026,x+dx,0,.072,g);
    for(const y of [-.445,.445])timberBox(v,.205,.024,.026,x,y,.072,g,'x');
    pin(v,g,.012,.012,side*.035,-.09,.086,'z');
    for(const y of [-.32,.32])pin(v,g,.004,.046,side*.285,y,.084);
  }
  v.detailAudit.serviceCabinets=(v.detailAudit.serviceCabinets??0)+1;return g;
}

const bowlCache=new WeakMap();
export function ceilingBowl(v,parent,radius=.235){
  let assets=bowlCache.get(v);if(!assets){assets={material:new THREE.MeshBasicMaterial({color:new THREE.Color(2.55,2.55,2.55),vertexColors:true,toneMapped:false}),geometry:new Map()};bowlCache.set(v,assets);}
  if(!assets.geometry.has(radius)){
    const g=new THREE.SphereGeometry(radius,24,10,0,Math.PI*2,0,Math.PI/2),p=g.attributes.position,colours=[];
    const edge=new THREE.Color('#9d927d'),centre=new THREE.Color('#fff4df'),c=new THREE.Color();
    for(let i=0;i<p.count;i++){c.copy(edge).lerp(centre,Math.sqrt(Math.max(0,p.getY(i)/radius)));colours.push(c.r,c.g,c.b);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.rotateX(Math.PI);g.scale(1,.43,1);assets.geometry.set(radius,g);
  }
  pin(v,parent,radius+.018,.020,0,.034,0,'y',v.mat.black);pin(v,parent,radius+.012,.018,0,.017,0);
  v.mesh(assets.geometry.get(radius),assets.material,parent);
  const rim=v.mesh(new THREE.TorusGeometry(radius+.003,.007,5,28),v.mat.brass,parent);rim.rotation.x=Math.PI/2;
  for(let k=0;k<3;k++){
    const a=k*Math.PI*2/3,x=Math.cos(a)*(radius+.005),z=Math.sin(a)*(radius+.005);
    const clip=v.box(.017,.033,.012,v.mat.brass,x,-.005,z,parent);clip.rotation.y=-a;
  }
  pin(v,parent,.014,.019,0,-radius*.43-.006,0);
  return parent;
}
