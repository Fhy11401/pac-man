import {DEFAULT_MAP_DOCUMENT} from './default-map-data.js';
import {analyzeMap} from './map-analysis.js';

export const MAP_DOCUMENT_FORMAT='night-hotel-map',MAP_DOCUMENT_VERSION=1;
const ROOM=DEFAULT_MAP_DOCUMENT.safeRoom,GATE=DEFAULT_MAP_DOCUMENT.entryGate;
const point=p=>({x:p.x,z:p.z}),key=p=>`${p.x},${p.z}`;
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');
const adjacent=p=>[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}];
const inBounds=(doc,p)=>p.x>=0&&p.z>=0&&p.x<doc.width&&p.z<doc.height;
const open=(doc,p)=>inBounds(doc,p)&&doc.tiles[p.z][p.x]!=='#';
const roomCell=p=>p.x>=ROOM.minX&&p.x<=ROOM.maxX&&p.z>=ROOM.minZ&&p.z<=ROOM.maxZ;
const safeCell=p=>roomCell(p)||key(p)===key(GATE.inside);
function fields(raw,names,label){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new TypeError(`${label}必须是普通对象。`);
  if(Object.keys(raw).some(name=>!names.includes(name))||names.some(name=>!Object.hasOwn(raw,name)))throw new TypeError(`${label}字段不完整或含不支持的字段。`);
}
function parsePoint(raw,label){
  fields(raw,['x','z'],label);
  if(!Number.isSafeInteger(raw.x)||!Number.isSafeInteger(raw.z))throw new TypeError(`${label}坐标必须是有限整数。`);
  return point(raw);
}
export function createDefaultMapDocument(){
  return normalizeMapDocument(DEFAULT_MAP_DOCUMENT);
}
export function normalizeMapDocument(raw){
  fields(raw,['format','version','name','width','height','tiles','start','enemy','exit','barriers','safeRoom','entryGate'],'地图');
  if(raw.format!==MAP_DOCUMENT_FORMAT||raw.version!==1)throw new TypeError('不支持此地图格式或版本。');
  if(raw.width!==32||raw.height!==27)throw new TypeError('地图必须为 32 × 27 格。');
  if(typeof raw.name!=='string'||raw.name.length>80)throw new TypeError('地图名称必须为不超过 80 字的文本。');
  if(!Array.isArray(raw.tiles)||raw.tiles.length!==raw.height||raw.tiles.some(row=>typeof row!=='string'||row.length!==raw.width||!/^[#.*]+$/.test(row)))throw new TypeError('地形必须是等宽的 #、.、* 字符行。');
  if(!Array.isArray(raw.barriers)||raw.barriers.length>raw.width*raw.height*2)throw new TypeError('隔断列表无效。');
  fields(raw.safeRoom,['minX','maxX','minZ','maxZ'],'安全屋');
  if(Object.values(raw.safeRoom).some(value=>!Number.isSafeInteger(value)))throw new TypeError('安全屋边界必须是整数。');
  fields(raw.entryGate,['x','z','inside','outside'],'入口');
  if(!Number.isFinite(raw.entryGate.x)||!Number.isFinite(raw.entryGate.z))throw new TypeError('入口坐标无效。');
  return {format:MAP_DOCUMENT_FORMAT,version:1,name:raw.name.trim()||'未命名地图',width:raw.width,height:raw.height,tiles:[...raw.tiles],
    start:parsePoint(raw.start,'出生点'),enemy:parsePoint(raw.enemy,'敌人'),exit:parsePoint(raw.exit,'出口'),
    barriers:raw.barriers.map((barrier,index)=>{fields(barrier,['a','b'],`隔断 ${index+1}`);return {a:parsePoint(barrier.a,'隔断端点'),b:parsePoint(barrier.b,'隔断端点')};}),
    safeRoom:{minX:raw.safeRoom.minX,maxX:raw.safeRoom.maxX,minZ:raw.safeRoom.minZ,maxZ:raw.safeRoom.maxZ},
    entryGate:{x:raw.entryGate.x,z:raw.entryGate.z,inside:parsePoint(raw.entryGate.inside,'门内侧'),outside:parsePoint(raw.entryGate.outside,'门外侧')}};
}
export const cloneMapDocument=doc=>normalizeMapDocument(doc);
function protectedCells(){
  const cells=new Map(),add=p=>cells.set(key(p),point(p));
  for(let z=ROOM.minZ;z<=ROOM.maxZ;z++)for(let x=ROOM.minX;x<=ROOM.maxX;x++)add({x,z});
  add(GATE.inside);add(GATE.outside);
  for(const p of [...cells.values()].filter(safeCell))for(const next of adjacent(p))if(DEFAULT_MAP_DOCUMENT.tiles[next.z]?.[next.x]==='#')add(next);
  return cells;
}
export function isProtectedCell(doc,p){
  if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.z))return false;
  return p.x===0||p.z===0||p.x===doc.width-1||p.z===doc.height-1||protectedCells().has(key(p));
}
export const isProtectedEdge=(doc,a,b)=>isProtectedCell(doc,a)||isProtectedCell(doc,b);
export function validateMapDocument(raw){
  const errors=[],warnings=[];let doc,analysis=null;
  const issue=(list,code,message,cells=[])=>list.push({code,message,cells:cells.map(point)});
  try{doc=normalizeMapDocument(raw);}catch(error){issue(errors,'invalid-shape',error.message);return {valid:false,errors,warnings,analysis};}
  if(JSON.stringify(doc.safeRoom)!==JSON.stringify(ROOM)||JSON.stringify(doc.entryGate)!==JSON.stringify(GATE))issue(errors,'protected-structure','安全屋和入口结构不可移动。');
  const border=[],nodes=[];
  for(let z=0;z<doc.height;z++)for(let x=0;x<doc.width;x++)if(doc.tiles[z][x]!=='#'){
    const p={x,z};nodes.push(p);if(x===0||z===0||x===doc.width-1||z===doc.height-1)border.push(p);
  }
  if(border.length)issue(errors,'open-boundary','地图外边界必须保持封闭。',border);
  const defaultDoc=createDefaultMapDocument(),changed=[...protectedCells().values()].filter(p=>(doc.tiles[p.z][p.x]==='#')!==(defaultDoc.tiles[p.z][p.x]==='#'));
  if(changed.length)issue(errors,'protected-terrain','安全屋、门口及其周围墙体不可编辑。',changed);
  const markers=[['出生点',doc.start],['敌人',doc.enemy],['出口',doc.exit]];
  for(const [label,p] of markers)if(!open(doc,p))issue(errors,'marker-terrain',`${label}必须位于地图内的可走格。`,[p]);
  if(new Set(markers.map(([,p])=>key(p))).size!==markers.length)issue(errors,'marker-overlap','出生点、敌人与出口不能重叠。',markers.map(([,p])=>p));
  if(!roomCell(doc.start))issue(errors,'start-room','出生点必须位于安全屋的四个房间格中。',[doc.start]);
  if(safeCell(doc.enemy)||safeCell(doc.exit))issue(errors,'unsafe-marker','敌人与出口必须位于安全屋之外。',[doc.enemy,doc.exit].filter(safeCell));
  if(!adjacent(doc.exit).some(p=>inBounds(doc,p)&&doc.tiles[p.z][p.x]==='#'))issue(errors,'exit-wall','出口需要靠着一面实体墙。',[doc.exit]);
  const safeShards=nodes.filter(p=>safeCell(p)&&doc.tiles[p.z][p.x]==='*');
  if(safeShards.length)issue(errors,'safe-shard','安全屋内不能放置水晶。',safeShards);
  const blocked=new Set();
  for(const {a,b} of doc.barriers){
    const token=edgeKey(a,b);
    if(Math.abs(a.x-b.x)+Math.abs(a.z-b.z)!==1||!open(doc,a)||!open(doc,b))issue(errors,'barrier-endpoints','隔断必须连接两个相邻的可走格。',[a,b]);
    if(blocked.has(token))issue(errors,'duplicate-barrier','同一条边上存在重复隔断。',[a,b]);
    if(isProtectedEdge(doc,a,b))issue(errors,'protected-edge','不能封住安全屋或入口的保护边。',[a,b]);
    blocked.add(token);
  }
  const neighbors=p=>adjacent(p).filter(next=>open(doc,next)&&!blocked.has(edgeKey(p,next)));
  const exits=nodes.filter(safeCell).flatMap(p=>neighbors(p).filter(n=>!safeCell(n)).map(n=>({a:p,b:n})));
  if(exits.length!==1||edgeKey(exits[0].a,exits[0].b)!==edgeKey(GATE.inside,GATE.outside))issue(errors,'safe-exits','安全屋必须只通过木板入口连接迷宫。',exits.flatMap(({a,b})=>[a,b]));
  const queue=open(doc,doc.start)?[doc.start]:[],seen=new Set(queue.map(key));
  for(let head=0;head<queue.length;head++)for(const n of neighbors(queue[head]))if(!seen.has(key(n))){seen.add(key(n));queue.push(n);}
  const unreachable=nodes.filter(p=>!seen.has(key(p)));
  if(unreachable.length)issue(errors,'unreachable','存在无法从安全屋经过入口到达的通道或目标。',unreachable);
  try{
    analysis=analyzeMap(doc);
    if(analysis.deadEnds.length)issue(warnings,'dead-ends',`${analysis.deadEnds.length} 处死胡同；追逐时需要原路返回。`,analysis.deadEnds);
    if(analysis.shortTurns.length)issue(warnings,'short-turns',`${analysis.shortTurns.length} 段连续短折弯，可考虑拉直或延长通道。`,[...new Map(analysis.shortTurns.flatMap(turn=>turn.cells).map(p=>[key(p),p])).values()]);
    if(analysis.warnings?.length)issue(warnings,'optional-turns',`${analysis.warnings.length} 处岔路附近存在较短的 Z 字绕行。`,[...new Map(analysis.warnings.flatMap(turn=>turn.cells).map(p=>[key(p),p])).values()]);
    if(!analysis.stats.shards)issue(warnings,'no-shards','没有放置水晶；试玩时出口会直接开放。');
  }catch(error){issue(errors,'analysis-failed',`地图分析失败：${error.message}`);}
  return {valid:errors.length===0,errors,warnings,analysis};
}
