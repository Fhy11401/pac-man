import {resolvePowerLayout,materializePowerPanels} from './power-layout.js';
import {cloneHotelDocument,createDefaultHotelDocument,validateHotelDocument} from './hotel-document.js';

export class HotelEditorState {
  constructor(document=createDefaultHotelDocument()){this.document=materializePowerPanels(cloneHotelDocument(document));this.undoStack=[];this.redoStack=[];this.before=null;}
  begin(){this.before??=JSON.stringify(this.document);}
  commit(){if(this.before)materializePowerPanels(this.document);const before=this.before;this.before=null;if(before&&before!==JSON.stringify(this.document)){this.undoStack.push(before);if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];return true;}return false;}
  change(fn){this.begin();try{fn(this.document);return this.commit();}catch(error){this.document=JSON.parse(this.before);this.before=null;throw error;}}
  undo(){this.commit();if(!this.undoStack.length)return false;this.redoStack.push(JSON.stringify(this.document));this.document=JSON.parse(this.undoStack.pop());return true;}
  redo(){this.commit();if(!this.redoStack.length)return false;this.undoStack.push(JSON.stringify(this.document));this.document=JSON.parse(this.redoStack.pop());return true;}
  replace(document){const next=materializePowerPanels(cloneHotelDocument(document));this.commit();return this.change(()=>{this.document=next;});}
  validate(){return validateHotelDocument(this.document);}
}
export function setHotelCell(doc,x,z,value){
  if(!Number.isInteger(x)||!Number.isInteger(z)||!['#','.','*'].includes(value))throw new TypeError('地形坐标须为整数，地形须为 #、. 或 *。');
  if(x<1||z<1||x>=doc.map.width-1||z>=doc.map.height-1)return false;
  const row=doc.map.tiles[z];doc.map.tiles[z]=row.slice(0,x)+value+row.slice(x+1);
  return row!==doc.map.tiles[z];
}
export function fillHotelRectangle(doc,a,b,value='*'){
  if(![a?.x,a?.z,b?.x,b?.z].every(Number.isSafeInteger)||!['#','.','*'].includes(value))throw new TypeError('矩形范围或地形类型无效。');
  const minX=Math.max(1,Math.min(a.x,b.x)),maxX=Math.min(doc.map.width-2,Math.max(a.x,b.x));
  const minZ=Math.max(1,Math.min(a.z,b.z)),maxZ=Math.min(doc.map.height-2,Math.max(a.z,b.z));
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++)setHotelCell(doc,x,z,value);
}
export function resizeHotel(doc,width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height))throw new TypeError('酒店尺寸须为有限数值。');
  width=Math.max(32,Math.min(80,Math.round(width)));height=Math.max(27,Math.min(64,Math.round(height)));
  doc.map.tiles=Array.from({length:height},(_,z)=>Array.from({length:width},(_,x)=>x===0||z===0||x===width-1||z===height-1?'#':doc.map.tiles[z]?.[x]??'#').join(''));
  Object.assign(doc.map,{width,height});
}
export function hotelEntities(doc){
  const f=doc.facilities;
  return [{kind:'start',id:'start',label:'出生点',value:doc.map.start},{kind:'enemy',id:'enemy',label:'敌人起点',value:doc.map.enemy},
    ...resolvePowerLayout(doc).sectors.map(p=>({kind:'power',id:p.id,label:`P${p.number} · ${p.label}配电箱`,number:p.number,sector:p.sector,value:f.powerPanels?.find(v=>v.id===p.id)??p})),{kind:'console',id:f.console.id,label:'监控台',value:f.console},
    ...['phones','batteries','cameras','patrol','rooms','halls'].flatMap(kind=>f[kind].map((value,index)=>({kind,id:value.id??String(index),index,label:value.label??(kind==='rooms'?`客房 ${value.room}`:kind==='phones'?`电话 ${value.room}`:kind==='batteries'?'备用电池':kind==='patrol'?`巡逻点 ${index+1}`:value.id),value})))];
}
export function entityPosition(entity){const v=entity.value;return v.position??(v.bounds?{x:(v.bounds.minX+v.bounds.maxX)/2,z:(v.bounds.minZ+v.bounds.maxZ)/2}:v);}
export function moveHotelEntity(doc,entity,dx,dz){
  if(!Number.isFinite(dx)||!Number.isFinite(dz)||(entity.kind!=='cameras'&&(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dz))))throw new TypeError('物件移动距离无效。');
  if(!dx&&!dz)return false;
  const v=entity.value;
  if(entity.kind==='rooms'){
    const old={...v.bounds},terrain=[];
    for(let z=Math.max(1,old.minZ);z<=Math.min(doc.map.height-2,old.maxZ);z++)for(let x=Math.max(1,old.minX);x<=Math.min(doc.map.width-2,old.maxX);x++)terrain.push({x,z,tile:doc.map.tiles[z][x]});
    fillHotelRectangle(doc,{x:old.minX,z:old.minZ},{x:old.maxX,z:old.maxZ},'#');
    for(const key of ['minX','maxX'])v.bounds[key]+=dx;for(const key of ['minZ','maxZ'])v.bounds[key]+=dz;
    for(const point of [v.door,v.door.inside,v.door.outside]){point.x+=dx;point.z+=dz;}
    for(const p of [...doc.facilities.phones.filter(p=>p.room===v.room),...doc.facilities.batteries.filter(p=>p.x>=old.minX&&p.x<=old.maxX&&p.z>=old.minZ&&p.z<=old.maxZ)]){p.x+=dx;p.z+=dz;}
    for(const p of terrain)setHotelCell(doc,p.x+dx,p.z+dz,p.tile);setHotelCell(doc,v.door.outside.x,v.door.outside.z,'*');
  }else if(entity.kind==='halls'){
    for(const key of ['minX','maxX'])v.bounds[key]+=dx;for(const key of ['minZ','maxZ'])v.bounds[key]+=dz;
    fillHotelRectangle(doc,{x:v.bounds.minX,z:v.bounds.minZ},{x:v.bounds.maxX,z:v.bounds.maxZ});
  }else if(v.position){v.position.x+=dx;v.position.z+=dz;v.target.x+=dx;v.target.z+=dz;}
  else{v.x+=dx;v.z+=dz;if(entity.kind==='power'&&v.id===doc.facilities.power.id)Object.assign(doc.facilities.power,{x:v.x,z:v.z,wall:{...v.wall}});}
  return true;
}
