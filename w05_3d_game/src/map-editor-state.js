import {cloneMapDocument,isProtectedCell,isProtectedEdge} from './map-document.js';

const same=(a,b)=>a.x===b.x&&a.z===b.z;
export const inBounds=(d,p)=>Number.isInteger(p?.x)&&Number.isInteger(p?.z)&&p.x>=0&&p.z>=0&&p.x<d.width&&p.z<d.height;
export const edgeKey=(a,b)=>[`${a.x},${a.z}`,`${b.x},${b.z}`].sort().join('|');
export const hasBarrier=(d,a,b)=>d.barriers.some(e=>edgeKey(e.a,e.b)===edgeKey(a,b));
const changeTile=(d,p,tile)=>{if(d.tiles[p.z][p.x]===tile)return false;d.tiles[p.z]=d.tiles[p.z].slice(0,p.x)+tile+d.tiles[p.z].slice(p.x+1);return true;};

export function paintCell(d,p,tool,autoShards=true){
 if(!inBounds(d,p))return {changed:false};
 if(isProtectedCell(d,p))return {changed:false,message:'安全屋、木板入口和外边界已锁定。'};
 const old=d.tiles[p.z][p.x];let tile=old;
 if(tool==='wall'){
  if(['start','enemy','exit'].some(k=>same(d[k],p)))return {changed:false,message:'先移动这里的标记，再封闭通道。'};
  tile='#';
 }else if(tool==='path'||tool==='line')tile=old==='#'?(autoShards?'*':'.'):old;
 else if(tool==='shard'){if(old==='#')return {changed:false,message:'先画通道，再放水晶。'};tile='*';}
 else if(tool==='erase-shard'){if(old==='#')return {changed:false};tile='.';}
 const changed=changeTile(d,p,tile);
 if(changed&&tile==='#')d.barriers=d.barriers.filter(e=>!same(e.a,p)&&!same(e.b,p));
 return {changed};
}

export function setBarrier(d,a,b,present){
 if(!inBounds(d,a)||!inBounds(d,b)||Math.abs(a.x-b.x)+Math.abs(a.z-b.z)!==1)return {changed:false};
 if(isProtectedEdge(d,a,b))return {changed:false,message:'安全屋入口由可破坏木板控制，不能添加固定隔墙。'};
 if(d.tiles[a.z][a.x]==='#'||d.tiles[b.z][b.x]==='#')return {changed:false,message:'隔墙只能放在两格相邻通道之间。'};
 const k=edgeKey(a,b),exists=hasBarrier(d,a,b);if(exists===present)return {changed:false};
 if(present)d.barriers.push({a:{...a},b:{...b}});else d.barriers=d.barriers.filter(e=>edgeKey(e.a,e.b)!==k);
 return {changed:true};
}

export function placeMarker(d,p,kind){
 if(!['start','enemy','exit'].includes(kind))return {changed:false,message:'不支持此标记类型。'};
 if(!inBounds(d,p)||d.tiles[p.z][p.x]==='#')return {changed:false,message:'请把标记放在可走通道上。'};
 if(['start','enemy','exit'].some(k=>k!==kind&&same(d[k],p)))return {changed:false,message:'出生点、敌人和出口不能重叠。'};
 const r=d.safeRoom,inside=p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;
 const entrance=same(p,d.entryGate.inside);
 if(kind==='start'&&!inside)return {changed:false,message:'出生点须留在安全屋内；可以拖到屋内其他格。'};
 if(kind!=='start'&&(inside||entrance))return {changed:false,message:'敌人和出口应放在安全屋外。'};
 if(kind==='exit'&&![[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>d.tiles[p.z+z]?.[p.x+x]==='#'))return {changed:false,message:'出口需要靠着一面实体墙。'};
 if(same(d[kind],p))return {changed:false};d[kind]={...p};return {changed:true};
}

// Fill every sampled cell between pointer events, even during a quick stroke.
export function strokeCells(a,b,straight=false){
 b={...b};if(straight){if(Math.abs(b.x-a.x)>=Math.abs(b.z-a.z))b.z=a.z;else b.x=a.x;}
 const points=[],dx=Math.abs(b.x-a.x),dz=Math.abs(b.z-a.z),sx=a.x<b.x?1:-1,sz=a.z<b.z?1:-1;
 let x=a.x,z=a.z,error=dx-dz;
 for(;;){points.push({x,z});if(x===b.x&&z===b.z)break;const e=error*2,previousX=x,previousZ=z;if(e>-dz){error-=dz;x+=sx;}if(e<dx){error+=dx;z+=sz;}if(x!==previousX&&z!==previousZ)points.push({x,z:previousZ});}
 return points;
}

export class EditorHistory{
 constructor(document){this.document=cloneMapDocument(document);this.past=[];this.future=[];this.pending=null;this.revision=0;}
 begin(label){if(!this.pending)this.pending={label,document:cloneMapDocument(this.document)};}
 finish(){
  const previous=this.pending;this.pending=null;if(!previous||JSON.stringify(previous.document)===JSON.stringify(this.document))return false;
  this.past.push(previous);if(this.past.length>80)this.past.shift();this.future=[];this.revision++;return true;
 }
 cancel(){if(this.pending)this.document=this.pending.document;this.pending=null;}
 replace(document,label='载入地图'){this.begin(label);this.document=cloneMapDocument(document);return this.finish();}
 undo(){this.finish();const entry=this.past.pop();if(!entry)return null;this.future.push({label:entry.label,document:cloneMapDocument(this.document)});this.document=entry.document;this.revision++;return entry.label;}
 redo(){this.finish();const entry=this.future.pop();if(!entry)return null;this.past.push({label:entry.label,document:cloneMapDocument(this.document)});this.document=entry.document;this.revision++;return entry.label;}
}
