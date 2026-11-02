import {resolvePowerLayout} from './power-layout.js';
import {HOTEL_DEFAULT_DOCUMENT} from './hotel-default-data.js';
import {analyzeMap} from './map-analysis.js';

export const HOTEL_DOCUMENT_FORMAT='night-hotel-layout',HOTEL_DOCUMENT_VERSION=1;
export const HALL_TYPES=Object.freeze(['reception','lounge','banquet','atrium']);
const key=p=>`${p.x},${p.z}`,copy=p=>({x:p.x,z:p.z}),edge=(a,b)=>[key(a),key(b)].sort().join('|');
const adjacent=p=>[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
const inside=(b,p)=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ;
const open=(map,p)=>Number.isInteger(p.x)&&Number.isInteger(p.z)&&map.tiles[p.z]?.[p.x]!==undefined&&map.tiles[p.z][p.x]!=='#';
function fields(value,required,optional=[],label='对象'){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError(`${label}必须是普通对象。`);
  if(required.some(name=>!Object.hasOwn(value,name))||Object.keys(value).some(name=>!required.includes(name)&&!optional.includes(name)))throw new TypeError(`${label}字段不完整或包含不支持的字段。`);
}
function text(value,label,max=100){if(typeof value!=='string'||value.length>max)throw new TypeError(`${label}必须是不超过 ${max} 字的文本。`);return value.trim();}
function number(value,label,integer=false){if(!Number.isFinite(value)||(integer&&!Number.isSafeInteger(value)))throw new TypeError(`${label}坐标或数值无效。`);return value;}
function point(raw,label,integer=true){fields(raw,['x','z'],[],label);return{x:number(raw.x,label,integer),z:number(raw.z,label,integer)};}
function bounds(raw,label){fields(raw,['minX','maxX','minZ','maxZ'],[],label);return Object.fromEntries(['minX','maxX','minZ','maxZ'].map(k=>[k,number(raw[k],label,true)]));}
function list(raw,label,max=128){if(!Array.isArray(raw)||raw.length>max)throw new TypeError(`${label}列表无效或过长。`);return raw;}
function fixture(raw,label,{wall=false,phone=false}={}){
  fields(raw,['id','x','z',...(wall?['wall']:[]),...(phone?['room']:[])],['label'],label);
  return{id:text(raw.id,`${label} ID`,64),x:number(raw.x,label,true),z:number(raw.z,label,true),...(wall?{wall:point(raw.wall,`${label}朝向`)}:{}),...(phone?{room:text(raw.room,'房号',40)}:{}),...(raw.label===undefined?{}:{label:text(raw.label,'名称')})};
}
function mapDocument(raw){
  fields(raw,['format','version','name','width','height','tiles','start','enemy','exit','barriers','safeRoom','entryGate'],[],'地形');
  if(raw.format!=='night-hotel-map'||raw.version!==1)throw new TypeError('不支持的地形格式。');
  if(!Number.isInteger(raw.width)||raw.width<32||raw.width>80||!Number.isInteger(raw.height)||raw.height<27||raw.height>64)throw new TypeError('酒店尺寸须为 32–80 列、27–64 行。');
  if(!Array.isArray(raw.tiles)||raw.tiles.length!==raw.height||raw.tiles.some(row=>typeof row!=='string'||row.length!==raw.width||!/^[#.*]+$/.test(row)))throw new TypeError('地形须为等宽的 #、.、* 字符行。');
  fields(raw.entryGate,['x','z','inside','outside'],[],'机械门');
  return{format:'night-hotel-map',version:1,name:text(raw.name,'地图名',80)||'未命名地图',width:raw.width,height:raw.height,tiles:[...raw.tiles],start:point(raw.start,'出生点'),enemy:point(raw.enemy,'敌人'),exit:point(raw.exit,'出口'),
    barriers:list(raw.barriers,'隔断',10240).map(b=>{fields(b,['a','b'],[],'隔断');return{a:point(b.a,'隔断'),b:point(b.b,'隔断')};}),safeRoom:bounds(raw.safeRoom,'监控室'),
    entryGate:{x:number(raw.entryGate.x,'机械门'),z:number(raw.entryGate.z,'机械门'),inside:point(raw.entryGate.inside,'门内'),outside:point(raw.entryGate.outside,'门外')}};
}
export function normalizeHotelDocument(raw){
  fields(raw,['format','version','name','map','facilities'],[],'酒店布局');
  if(raw.format!==HOTEL_DOCUMENT_FORMAT||raw.version!==HOTEL_DOCUMENT_VERSION)throw new TypeError('不支持此酒店布局格式或版本。');
  const f=raw.facilities;fields(f,['power','phones','rooms','batteries','console','patrol','halls','cameras'],['powerPanels'],'酒店设施');
  return{format:HOTEL_DOCUMENT_FORMAT,version:1,name:text(raw.name,'酒店名',80)||'未命名酒店',map:mapDocument(raw.map),facilities:{
    ...(f.powerPanels===undefined?{}:{powerPanels:list(f.powerPanels,'分区配电箱',24).map(p=>{fields(p,['id','sector','x','z','wall'],[],'分区配电箱');const {sector,...site}=p;return{...fixture(site,'分区配电箱',{wall:true}),sector:text(sector,'供电区域',64)};})}),
    power:fixture(f.power,'配电箱',{wall:true}),console:fixture(f.console,'监控台',{wall:true}),
    phones:list(f.phones,'电话',8).map(p=>fixture(p,'电话',{wall:true,phone:true})),batteries:list(f.batteries,'电池').map(p=>fixture(p,'电池')),
    patrol:list(f.patrol,'巡逻点').map(p=>point(p,'巡逻点')),
    rooms:list(f.rooms,'客房',8).map(r=>{fields(r,['id','room','bounds','door'],[],'客房');fields(r.door,['x','z','axis','inside','outside'],[],'客房门');if(!['x','z'].includes(r.door.axis))throw new TypeError('客房门轴须为 x 或 z。');return{id:text(r.id,'客房 ID',64),room:text(r.room,'房号',40),bounds:bounds(r.bounds,'客房'),door:{x:number(r.door.x,'客房门'),z:number(r.door.z,'客房门'),axis:r.door.axis,inside:point(r.door.inside,'客房门内'),outside:point(r.door.outside,'客房门外')}};}),
    halls:list(f.halls,'大厅',24).map(h=>{fields(h,['id','label','bounds'],['type'],'大厅');const type=h.type??'lounge';if(!HALL_TYPES.includes(type))throw new TypeError('不支持此大厅类型。');return{id:text(h.id,'大厅 ID',64),label:text(h.label,'大厅名称'),type,bounds:bounds(h.bounds,'大厅')};}),
    cameras:list(f.cameras,'摄像头',32).map((c,index)=>{fields(c,['id','label','description','position','target','fov'],['code'],'摄像头');const pose=(p,label)=>{fields(p,['x','z','y'],[],label);return{x:number(p.x,label),z:number(p.z,label),y:number(p.y,label)};};return{id:text(c.id,'摄像头 ID',64),label:text(c.label,'摄像头名称'),description:text(c.description,'摄像头说明',240),code:c.code===undefined?`CAM ${String(index+1).padStart(2,'0')}`:text(c.code,'摄像头编号',30),position:pose(c.position,'机位'),target:pose(c.target,'镜头目标'),fov:number(c.fov,'镜头视角')};}),
  }};
}
export const createDefaultHotelDocument=()=>normalizeHotelDocument(HOTEL_DEFAULT_DOCUMENT);
export const cloneHotelDocument=normalizeHotelDocument;
export const serializeHotelDocument=doc=>JSON.stringify(normalizeHotelDocument(doc),null,2)+'\n';

export function validateHotelDocument(raw){
  const errors=[],warnings=[];let document,analysis=null;
  const issue=(code,message,cells=[],warning=false)=>(warning?warnings:errors).push({code,message,cells:cells.map(copy)});
  try{document=normalizeHotelDocument(raw);}catch(error){issue('invalid-shape',error.message);return{valid:false,errors,warnings,analysis};}
  const map=document.map,f=document.facilities,base=HOTEL_DEFAULT_DOCUMENT.map,nodes=[];
  const inMap=p=>p.x>=0&&p.z>=0&&p.x<map.width&&p.z<map.height;
  const safe=p=>inside(map.safeRoom,p)||key(p)===key(map.entryGate.inside);
  for(let z=0;z<map.height;z++)for(let x=0;x<map.width;x++)if(map.tiles[z][x]!=='#'){
    const p={x,z};nodes.push(p);if(x===0||z===0||x===map.width-1||z===map.height-1)issue('open-boundary','酒店外边界必须封闭。',[p]);
  }
  if(JSON.stringify(map.safeRoom)!==JSON.stringify(base.safeRoom)||JSON.stringify(map.entryGate)!==JSON.stringify(base.entryGate))issue('control-structure','本版本监控室边界及机械门位置必须保留。');
  const markers=[map.start,map.enemy,map.exit];
  for(const p of markers)if(!open(map,p))issue('marker-terrain','出生点、敌人和出口必须在可走地形。',[p]);
  if(new Set(markers.map(key)).size!==3)issue('marker-overlap','出生点、敌人和出口不能重叠。',markers);
  if(!inside(map.safeRoom,map.start))issue('start-room','出生点必须在监控室内。',[map.start]);
  if(safe(map.enemy)||safe(map.exit))issue('unsafe-marker','敌人和出口必须在监控室外。',[map.enemy,map.exit]);
  if(!adjacent(map.exit).some(p=>inMap(p)&&map.tiles[p.z][p.x]==='#'))issue('exit-wall','出口须邻接实体墙。',[map.exit]);
  const blocked=new Set();
  for(const {a,b} of map.barriers){const token=edge(a,b);if(!open(map,a)||!open(map,b)||Math.abs(a.x-b.x)+Math.abs(a.z-b.z)!==1)issue('barrier-endpoints','隔断须连接相邻可走格。',[a,b]);if(blocked.has(token))issue('duplicate-barrier','隔断不能重复。',[a,b]);blocked.add(token);}
  const neighbors=p=>adjacent(p).filter(n=>open(map,n)&&!blocked.has(edge(p,n)));
  const exits=nodes.filter(safe).flatMap(p=>neighbors(p).filter(n=>!safe(n)).map(n=>({a:p,b:n})));
  if(exits.length!==1||edge(exits[0].a,exits[0].b)!==edge(map.entryGate.inside,map.entryGate.outside))issue('control-exits','监控室必须只经机械门连接酒店。',exits.flatMap(e=>[e.a,e.b]));
  for(let z=Math.max(0,map.safeRoom.minZ);z<=Math.min(map.height-1,map.safeRoom.maxZ);z++)for(let x=Math.max(0,map.safeRoom.minX);x<=Math.min(map.width-1,map.safeRoom.maxX);x++)if(!open(map,{x,z}))issue('control-terrain','监控室内部必须保持可走。',[{x,z}]);
  if(nodes.some(p=>safe(p)&&map.tiles[p.z][p.x]==='*'))issue('control-shards','监控室内不放置水晶。');
  const seen=new Set(),queue=[];if(open(map,map.start)){seen.add(key(map.start));queue.push(map.start);}
  for(let i=0;i<queue.length;i++)for(const n of neighbors(queue[i]))if(!seen.has(key(n))){seen.add(key(n));queue.push(n);}
  const unreachable=nodes.filter(p=>!seen.has(key(p)));if(unreachable.length)issue('unreachable','酒店存在不可到达的区域。',unreachable);
  const usable=(p,label)=>{if(!open(map,p)||!seen.has(key(p)))issue('facility-terrain',`${label}必须位于可到达的可走格。`,[p]);};
  const ids=new Set(),id=(value,label)=>{if(!/^[a-zA-Z0-9_-]{1,64}$/.test(value)||['__proto__','constructor','prototype'].includes(value)||ids.has(value))issue('facility-id',`${label} ID 无效或重复。`);ids.add(value);};
  const checkWall=(p,label)=>{usable(p,label);if(Math.abs(p.wall.x)+Math.abs(p.wall.z)!==1||!inMap({x:p.x+p.wall.x,z:p.z+p.wall.z})||map.tiles[p.z+p.wall.z]?.[p.x+p.wall.x]!=='#')issue('fixture-wall',`${label}朝向必须指向相邻实体墙。`,[p]);};
  for(const [p,label] of [...(f.powerPanels?[]:[[f.power,'配电箱']]),[f.console,'监控台'],...f.phones.map(p=>[p,'电话'])]){id(p.id,label);checkWall(p,label);}
  if(!f.powerPanels&&safe(f.power))issue('power-room','配电箱应位于监控室外。',[f.power]);
  if(!inside(map.safeRoom,f.console))issue('console-room','监控台须位于监控室内。',[f.console]);
  for(const p of f.batteries){id(p.id,'电池');usable(p,'电池');}
  if(f.rooms.length!==2||f.phones.length!==2)issue('room-count','本版本需要两间客房和对应的两部电话。');
  const rectangle=(b,label,min=2)=>{
    if(b.maxX-b.minX+1<min||b.maxZ-b.minZ+1<min||b.minX<1||b.minZ<1||b.maxX>=map.width-1||b.maxZ>=map.height-1){issue('region-bounds',`${label}边界无效或尺寸太小。`);return false;}
    const closed=[];for(let z=b.minZ;z<=b.maxZ;z++)for(let x=b.minX;x<=b.maxX;x++)if(!open(map,{x,z}))closed.push({x,z});if(closed.length)issue('region-terrain',`${label}内部必须全部开放。`,closed);return true;
  };
  const overlap=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
  const roomNames=new Set();
  for(const room of f.rooms){
    id(room.id,'客房');if(!room.room||roomNames.has(room.room))issue('room-number','客房房号不能空缺或重复。');roomNames.add(room.room);
    if(!rectangle(room.bounds,'客房'))continue;
    const d=room.door;usable(d.inside,'门内');usable(d.outside,'门外');
    if(!inside(room.bounds,d.inside)||inside(room.bounds,d.outside)||Math.abs(d.inside.x-d.outside.x)+Math.abs(d.inside.z-d.outside.z)!==1||d.x!==(d.inside.x+d.outside.x)/2||d.z!==(d.inside.z+d.outside.z)/2||d.axis!==(d.inside.x===d.outside.x?'z':'x'))issue('room-door','客房门须正好位于房内与房外相邻格之间。',[d.inside,d.outside]);
    const connections=nodes.filter(p=>inside(room.bounds,p)).flatMap(p=>neighbors(p).filter(n=>!inside(room.bounds,n)).map(n=>({a:p,b:n})));
    if(connections.length!==1||edge(connections[0].a,connections[0].b)!==edge(d.inside,d.outside))issue('room-entry','每间客房必须只通过指定房门连接走廊。',connections.flatMap(e=>[e.a,e.b]));
    const phones=f.phones.filter(p=>p.room===room.room);if(phones.length!==1||!inside(room.bounds,phones[0]))issue('room-phone','每间客房需要一部位于室内的对应电话。');
    if(overlap(room.bounds,map.safeRoom))issue('region-overlap','客房不能与监控室重叠。');
  }
  for(const phone of f.phones)if(!roomNames.has(phone.room))issue('unknown-room','电话引用了不存在的客房。',[phone]);
  for(let i=0;i<f.rooms.length;i++)for(let j=0;j<i;j++)if(overlap(f.rooms[i].bounds,f.rooms[j].bounds))issue('region-overlap','客房不能重叠。');
  for(let i=0;i<f.halls.length;i++){
    const h=f.halls[i];id(h.id,'大厅');rectangle(h.bounds,'大厅',3);
    if(overlap(h.bounds,map.safeRoom)||f.rooms.some(r=>overlap(h.bounds,r.bounds))||f.halls.slice(0,i).some(r=>overlap(h.bounds,r.bounds)))issue('region-overlap','大厅不能与客房、监控室或其他大厅重叠。');
  }
  const power=resolvePowerLayout(document),sectors=f.halls.length?f.halls.map(h=>h.id):['hotel'];
  if(f.powerPanels){
    const assigned=new Set(),sites=new Set();
    for(const p of f.powerPanels){
      id(p.id,'分区配电箱');checkWall(p,'分区配电箱');
      if(!sectors.includes(p.sector)||assigned.has(p.sector))issue('power-sector','每个供电区域须对应唯一配电箱。',[p]);assigned.add(p.sector);
      if(sites.has(key(p))||[f.console,...f.phones,...f.batteries].some(other=>key(other)===key(p)))issue('power-overlap','配电箱不能与其他设施重叠。',[p]);sites.add(key(p));
      if(safe(p)||f.rooms.some(r=>inside(r.bounds,p)))issue('power-room','分区配电箱须位于公共区域。',[p]);
      if(power.sectorAt(p)?.sector!==p.sector)issue('power-location','配电箱必须放在其对应的供电区域内。',[p]);
    }
    if(sectors.some(id=>!assigned.has(id)))issue('power-missing','部分供电区域缺少配电箱。');
  }
  if(power.sectors.length!==sectors.length)issue('power-missing','供电区域缺少可达的墙面，无法放置配电箱。');
  if(!f.patrol.length)issue('patrol-empty','至少需要一个巡逻点。');
  for(const p of f.patrol){usable(p,'巡逻点');if(safe(p)||f.rooms.some(r=>inside(r.bounds,p)))issue('patrol-room','巡逻点须在公共区域。',[p]);}
  if(!f.cameras.length)issue('camera-empty','至少需要一台摄像头。');
  const cameraIds=new Set();
  for(const c of f.cameras){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(c.id)||cameraIds.has(c.id))issue('camera-id','摄像头 ID 无效或重复。');cameraIds.add(c.id);
    const p={x:Math.round(c.position.x),z:Math.round(c.position.z)};usable(p,'摄像头');
    if(inMap(p))for(let z=p.z-1;z<=p.z+1;z++)for(let x=p.x-1;x<=p.x+1;x++)if(!open(map,{x,z})&&Math.abs(c.position.x-x)<.625&&Math.abs(c.position.z-z)<.625)issue('camera-wall','摄像头镜头不能嵌入墙体。',[p]);
    if(f.rooms.some(r=>c.position.x>=r.bounds.minX-.5&&c.position.x<=r.bounds.maxX+.5&&c.position.z>=r.bounds.minZ-.5&&c.position.z<=r.bounds.maxZ+.5))issue('camera-private-room','摄像头只能布置在大厅和公共交通区域，不能放在客房内。',[p]);
    if(!inMap(c.target)||c.fov<20||c.fov>120||c.position.y<.5||c.position.y>4||c.target.y<0||c.target.y>4||Math.hypot(c.position.x-c.target.x,c.position.z-c.target.z,c.position.y-c.target.y)<.1)issue('camera-pose','镜头位置、朝向或视角无效。',[p]);
  }
  try{analysis=analyzeMap(map);if(analysis.shortTurns.length)issue('short-turns',`${analysis.shortTurns.length} 段短折弯，可在编辑器中继续调整。`,analysis.shortTurns.flatMap(t=>t.cells),true);}catch(error){issue('analysis-failed',error.message);}
  return{valid:errors.length===0,errors,warnings,analysis};
}
