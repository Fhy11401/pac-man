import * as THREE from '../vendor/three.module.js';
import {MAP,START,EXIT,isInSafeRoom,isOpen,edgeIsOpen,neighbors,pathTo} from './world.js';

const faces=[{x:1,z:0,a:-Math.PI/2},{x:-1,z:0,a:Math.PI/2},{x:0,z:1,a:Math.PI},{x:0,z:-1,a:0}];
const regions=[{title:'西翼 · 客房',sub:'WEST WING',glyph:'I',colour:'#8a6157'},{title:'中央 · 大厅',sub:'CENTRAL HALL',glyph:'II',colour:'#a18c58'},{title:'东翼 · 画廊',sub:'EAST WING',glyph:'III',colour:'#597a79'}];
export const regionFor=x=>Math.min(2,Math.max(0,Math.floor(x/MAP[0].length*3)));
const tag=p=>`${p.x},${p.z}`;
const apart=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.z-b.z);

function bareFaces(p,allowAreaPlaque=false){
  return faces.filter(d=>{
    const next={x:p.x+d.x,z:p.z+d.z},hash=p.x*17+p.z*13+(d.x+1)*3+d.z;
    // A wall between two traversable cells is an internal divider, not a
    // full-cell exterior wall face. Keep signs off those thin divider walls.
    return !edgeIsOpen(p,next)&&!isOpen(next.x,next.z)&&(isInSafeRoom(p)||(hash%7!==0&&hash%4!==0&&hash%3!==0&&(allowAreaPlaque||hash%5!==0)&&hash%11!==0));
  });
}

export function buildLandmarkPlan(){
  const plan=[],reserved=new Set(),cells=[];
  MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{if(tile!=='#')cells.push({x,z});}));
  const add=(p,face,style,kind,extra={})=>{if(!face)return false;plan.push({...p,face,...style,kind,...extra});reserved.add(tag(p));return true;};
  const special=(goal,style,kind)=>{
    const here={x:Math.round(goal.x),z:Math.round(goal.z)},face=bareFaces(here)[0];
    if(face){add(here,face,style,kind);return;}
    const wall=faces.find(d=>!edgeIsOpen(here,{x:here.x+d.x,z:here.z+d.z})&&!isOpen(here.x+d.x,here.z+d.z));
    // The label stays at the actual destination even if other decoration must
    // share that wall; a nearby room must never be presented as the exit.
    if(wall)add(here,wall,{...style,high:true},kind);
  };
  special(START,{title:'接待处',sub:'RECEPTION',glyph:'R',colour:'#a18c58',caption:'开场安全屋 / START ROOM'},'reception');
  special(EXIT,{title:'出口',sub:'EXIT',glyph:'X',colour:'#68816f',caption:'集齐后开放 / OPENS AFTER COLLECTION'},'exit');
  for(let region=0;region<3;region++){
    const target={x:(region+.5)*MAP[0].length/3,z:MAP.length/2};
    const candidates=cells.filter(p=>!isInSafeRoom(p)&&regionFor(p.x)===region&&!reserved.has(tag(p))&&bareFaces(p).length&&plan.every(q=>apart(p,q)>=4)&&pathTo(START,p).length);
    candidates.sort((a,b)=>apart(a,target)-apart(b,target)||a.z-b.z||a.x-b.x);
    if(candidates.length)add(candidates[0],bareFaces(candidates[0])[0],regions[region],'region');
  }
  const route=pathTo(START,EXIT);let last=-12,guides=0;
  for(let i=2;i<route.length-3&&guides<4;i++){
    const p=route[i],next=route[i+1],nearJunction=[route[i-1],p,next].some(q=>neighbors(q).length>=3);if(isInSafeRoom(p)||i-last<8||reserved.has(tag(p))||!nearJunction||plan.some(q=>apart(p,q)<2))continue;
    if(!edgeIsOpen(p,next))continue;
    // A wall-parallel arrow is unambiguous from either approach. Never point an
    // arrow into a wall or use a straight-line bearing through the maze.
    const dx=next.x-p.x,dz=next.z-p.z,face=bareFaces(p,true).find(d=>Math.abs(dx*d.x+dz*d.z)<.1);
    if(!face)continue;const localX=dx*Math.cos(face.a)-dz*Math.sin(face.a);
    add(p,face,{title:'出口方向',sub:'EXIT ROUTE',glyph:localX>0?'→':'←',colour:'#68816f',caption:'集齐后返回出口 / RETURN AFTER COLLECTION'},'guide',{next:{...next},routeIndex:i});last=i;guides++;
  }
  return plan;
}

function signMaterial(label){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#201d18';c.fillRect(0,0,512,256);c.fillStyle=label.colour;c.fillRect(18,23,7,210);
  c.strokeStyle='#8f7957';c.lineWidth=2;c.strokeRect(8,8,496,240);
  c.fillStyle=label.colour;c.font='78px Georgia';c.textAlign='center';c.fillText(label.glyph,77,145);
  c.fillStyle='#e1d4b3';c.textAlign='left';c.font='38px SimSun';c.fillText(label.title,132,103);
  c.fillStyle='#bfaf8d';c.font='20px Georgia';c.fillText(label.sub,132,148);
  if(label.caption){c.font='13px SimSun';c.fillStyle='#a89e86';c.fillText(label.caption,132,188);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map,roughness:.69,metalness:.10,envMapIntensity:.18});
}

export function decorateMapLandmarks(v,world,unit){
  const plan=buildLandmarkPlan(),materials=new Map();
  for(const label of plan){
    const d=label.face,g=new THREE.Group();g.name=`map-${label.kind}`;
    g.position.copy(world(label.x+d.x*v.corridorWidth/(2*unit),label.z+d.z*v.corridorWidth/(2*unit)));
    g.rotation.y=d.a;v.scene.add(g);g.userData.landmark={kind:label.kind,cell:{x:label.x,z:label.z},next:label.next};
    const width=label.kind==='guide'?.82:.94,h=width/2,height=label.high?v.ceilingHeight-(h+.034)/2-.02:1.88;
    v.box(width+.034,h+.034,.025,v.mat.wood,0,height,.026,g);
    const key=[label.title,label.glyph,label.caption].join('|');if(!materials.has(key))materials.set(key,signMaterial(label));
    const sign=v.mesh(new THREE.PlaneGeometry(width,h),materials.get(key),g);sign.position.set(0,height,.041);
    for(const x of [-width/2+.018,width/2-.018])v.box(.005,.005,.003,v.mat.brass,x,height,.044,g);
  }
  v.detailAudit.landmarks=plan.map(({kind,x,z,next})=>({kind,x,z,...(next?{next}:{})}));return plan;
}
