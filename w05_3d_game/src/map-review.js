import {MAP,START,ENEMY_START,EXIT,SAFE_ROOM,ENTRY_GATE,BLOCKED_TRANSITIONS,edgeIsOpen} from './world.js';

const NS='http://www.w3.org/2000/svg';
const key=p=>`${p.x},${p.z}`;
const pairKey=(a,b)=>[key(a),key(b)].sort().join('|');
const open=(map,x,z)=>Number.isInteger(x)&&Number.isInteger(z)&&map[z]?.[x]!==undefined&&map[z][x]!=='#';
const adjacent=p=>[{x:p.x-1,z:p.z},{x:p.x+1,z:p.z},{x:p.x,z:p.z-1},{x:p.x,z:p.z+1}];

export function mapStatistics(map,blockers=[],canStep){
  const blocked=new Set(blockers.map(t=>pairKey(t.a,t.b)));
  const points=map.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x,z}]));
  const graph=new Map(points.map(p=>[key(p),adjacent(p).filter(q=>open(map,q.x,q.z)&&(canStep?canStep(p,q):!blocked.has(pairKey(p,q))))]));
  const unseen=new Set(graph.keys());let components=0,corners=0,degreeSum=0;
  for(const p of points){const ns=graph.get(key(p));degreeSum+=ns.length;if(ns.length===2&&(ns[0].x-p.x)*(ns[1].x-p.x)+(ns[0].z-p.z)*(ns[1].z-p.z)===0)corners++;}
  while(unseen.size){const first=unseen.values().next().value,queue=[first];unseen.delete(first);components++;for(let i=0;i<queue.length;i++)for(const q of graph.get(queue[i]))if(unseen.delete(key(q)))queue.push(key(q));}
  return{shards:map.reduce((sum,row)=>sum+[...row].filter(t=>t==='*').length,0),cells:points.length,corners,cycles:degreeSum/2-points.length+components,components,edges:degreeSum/2};
}

const svgNode=(tag,attrs={},text)=>{const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;};
const rectangle=(x,z,inset=0)=>`M${x-.5+inset} ${z-.5+inset}h${1-inset*2}v${1-inset*2}h${-1+inset*2}Z`;
const ui=typeof document==='undefined'?null:{grid:document.querySelector('#plan-grid'),status:document.querySelector('#review-status'),readout:document.querySelector('#coordinate-readout')};
const views=[];
let original,revised,differences,selection=null,pinned=false,drag=null;
let mode=typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches?'revised':'compare';
const camera={x:0,z:0,zoom:1,width:0,height:0,homeX:0,homeZ:0};

function buildMap(model,container,isOverlay=false){
  const width=model.map[0].length,height=model.map.length;
  const svg=svgNode('svg',{role:'img',tabindex:0,'aria-label':isOverlay?'通路改动叠加地图':model.title,'aria-describedby':'map-help'});
  svg.style.aspectRatio=`${camera.width} / ${camera.height}`;
  svg.append(svgNode('title',{},`${model.title}，${width} 列、${height} 行；支持缩放、平移和点选坐标`));
  svg.append(svgNode('rect',{x:-.5,y:-.5,width,height,class:'map-boundary'}));
  let road='';for(let z=0;z<height;z++)for(let x=0;x<width;x++)if(open(model.map,x,z))road+=rectangle(x,z);
  svg.append(svgNode('path',{d:road,class:'map-road'}));
  let grid='';for(let x=-.5;x<width;x++)grid+=`M${x} -.5V${height-.5}`;for(let z=-.5;z<height;z++)grid+=`M-.5 ${z}H${width-.5}`;
  svg.append(svgNode('path',{d:grid,class:'map-grid'}));
  if(isOverlay){svg.append(svgNode('path',{d:differences.added.map(p=>rectangle(p.x,p.z,.04)).join(''),class:'map-added'}));svg.append(svgNode('path',{d:differences.removed.map(p=>rectangle(p.x,p.z,.07)).join(''),class:'map-removed'}));}
  if(model.safeRoom){const r=model.safeRoom;svg.append(svgNode('rect',{x:r.minX-.45,y:r.minZ-.45,width:r.maxX-r.minX+.90,height:r.maxZ-r.minZ+.90,class:'map-safe-room'}));}
  const coordinates=svgNode('g',{class:'map-coordinates'});
  for(let x=0;x<width;x++)coordinates.append(svgNode('text',{x,y:-1.02,class:x%2?'fine-coordinate':''},x));
  for(let z=0;z<height;z++)coordinates.append(svgNode('text',{x:-1.02,y:z,class:z%2?'fine-coordinate':''},z));
  coordinates.append(svgNode('text',{x:width-.1,y:-1.02,class:'axis-label'},'X'),svgNode('text',{x:-1.02,y:height-.1,class:'axis-label'},'Z'));svg.append(coordinates);
  const crystals=svgNode('g',{class:'map-shards',visibility:'hidden'});let shardPath='';
  for(let z=0;z<height;z++)for(let x=0;x<width;x++)if(model.map[z][x]==='*')shardPath+=`M${x} ${z-.22}l.15 .22-.15 .22-.15-.22Z`;
  crystals.append(svgNode('path',{d:shardPath}));svg.append(crystals);
  let barriers='';for(const {a,b} of model.blockers){const x=(a.x+b.x)/2,z=(a.z+b.z)/2;barriers+=a.x===b.x?`M${x-.49} ${z}h.98`:`M${x} ${z-.49}v.98`;}
  svg.append(svgNode('path',{d:barriers,class:'map-blockers'}));
  if(model.entryGate){const g=model.entryGate;svg.append(svgNode('path',{d:`M${g.x-.48} ${g.z}h.96`,class:'map-entry-gate'}));}
  for(const [type,letter,point] of [['start','S',model.start],['enemy','E',model.enemy],['exit','X',model.exit]]){
    if(!point)continue;const marker=svgNode('g',{class:`map-marker ${type}`,transform:`translate(${point.x} ${point.z})`});
    marker.append(svgNode('circle',{r:.43}),svgNode('text',{x:0,y:.015},letter));svg.append(marker);
  }
  const cursor=svgNode('g',{class:'map-selection',visibility:'hidden'});cursor.append(svgNode('path'),svgNode('rect',{width:.9,height:.9}));svg.append(cursor);
  container.replaceChildren(svg);views.push({svg,coordinates,crystals,cursor});
  svg.addEventListener('wheel',event=>{event.preventDefault();zoomTo(camera.zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.006),screenPoint(svg,event.clientX,event.clientY));},{passive:false});
  svg.addEventListener('pointerdown',event=>{if(event.button!==0)return;const matrix=svg.getScreenCTM();drag={id:event.pointerId,svg,startX:event.clientX,startY:event.clientY,x:camera.x,z:camera.z,scaleX:matrix.a,scaleZ:matrix.d,moved:false};svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');});
  svg.addEventListener('pointermove',event=>{
    if(drag?.svg===svg&&drag.id===event.pointerId){const dx=event.clientX-drag.startX,dz=event.clientY-drag.startY;if(Math.hypot(dx,dz)>4)drag.moved=true;if(drag.moved){camera.x=drag.x-dx/drag.scaleX;camera.z=drag.z-dz/drag.scaleZ;updateCamera();}return;}
    if(!pinned)setSelection(screenPoint(svg,event.clientX,event.clientY));
  });
  svg.addEventListener('pointerup',event=>{if(drag?.id!==event.pointerId||drag.svg!==svg)return;const moved=drag.moved;endDrag();if(!moved){const point=screenPoint(svg,event.clientX,event.clientY),x=Math.round(point.x),z=Math.round(point.z),same=pinned&&selection?.x===x&&selection?.z===z;pinned=!same;setSelection(same?null:point);}});
  svg.addEventListener('pointercancel',endDrag);
  svg.addEventListener('lostpointercapture',endDrag);
  svg.addEventListener('pointerleave',()=>{if(!pinned&&!drag)setSelection(null);});
  svg.addEventListener('keydown',event=>{
    if(event.key==='Home'){event.preventDefault();fit();return;}
    if(event.key==='+'||event.key==='='){event.preventDefault();zoomTo(camera.zoom*1.3);return;}
    if(event.key==='-'){event.preventDefault();zoomTo(camera.zoom/1.3);return;}
    if(event.key==='Escape'){pinned=false;setSelection(null);return;}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(directions[event.key]){event.preventDefault();const p=selection??revised.start,[dx,dz]=directions[event.key];pinned=true;setSelection({x:Math.max(0,Math.min(width-1,p.x+dx)),z:Math.max(0,Math.min(height-1,p.z+dz))});if(camera.zoom>1){camera.x=selection.x;camera.z=selection.z;updateCamera();}}
  });
}

function screenPoint(svg,x,y){const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());return{x:p.x,z:p.y};}
function endDrag(){if(!drag)return;drag.svg.classList.remove('is-dragging');if(drag.svg.hasPointerCapture(drag.id))drag.svg.releasePointerCapture(drag.id);drag=null;}
function updateCamera(){
  const w=camera.width/camera.zoom,h=camera.height/camera.zoom;
  camera.x=Math.max(camera.homeX-(camera.width-w)/2,Math.min(camera.homeX+(camera.width-w)/2,camera.x));camera.z=Math.max(camera.homeZ-(camera.height-h)/2,Math.min(camera.homeZ+(camera.height-h)/2,camera.z));
  for(const {svg} of views)svg.setAttribute('viewBox',`${camera.x-w/2} ${camera.z-h/2} ${w} ${h}`);
  document.querySelector('#zoom-value').textContent=`${Math.round(camera.zoom*100)}%`;document.querySelector('#zoom-out').disabled=camera.zoom<=1;document.querySelector('#zoom-in').disabled=camera.zoom>=4;
}
function zoomTo(value,point={x:camera.x,z:camera.z}){const zoom=Math.max(1,Math.min(4,value)),ratio=camera.zoom/zoom;camera.x=point.x+(camera.x-point.x)*ratio;camera.z=point.z+(camera.z-point.z)*ratio;camera.zoom=zoom;updateCamera();}
function fit(){camera.x=camera.homeX;camera.z=camera.homeZ;camera.zoom=1;updateCamera();}
function setSelection(point){
  const x=point?Math.round(point.x):-1,z=point?Math.round(point.z):-1;
  selection=x>=0&&z>=0&&x<revised.map[0].length&&z<revised.map.length?{x,z}:null;
  for(const {cursor} of views){cursor.setAttribute('visibility',selection?'visible':'hidden');cursor.classList.toggle('is-pinned',pinned);if(selection){cursor.children[0].setAttribute('d',`M-.5 ${z}H${revised.map[0].length-.5}M${x} -.5V${revised.map.length-.5}`);cursor.children[1].setAttribute('x',x-.45);cursor.children[1].setAttribute('y',z-.45);}}
  ui.readout.textContent=selection?`X ${String(x).padStart(2,'0')} · Z ${String(z).padStart(2,'0')}  历史 ${open(original.map,x,z)?'通道':'墙体'} / 当前默认 ${open(revised.map,x,z)?'通道':'墙体'}${pinned?' · 已固定':''}`:'X — · Z —';
}
function setMode(next){
  mode=next;ui.grid.dataset.mode=mode;document.querySelector('.plan-desk').classList.toggle('is-overlay',mode==='overlay');
  for(const item of document.querySelectorAll('.safe-key'))item.hidden=mode==='original';
  for(const id of ['original','revised','overlay'])document.querySelector(`#${id}-panel`).hidden=mode!=='compare'?mode!==id:id==='overlay';
  for(const button of document.querySelectorAll('[data-mode]'))if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
}
function showStatistics(){
  const a=mapStatistics(original.map,original.blockers),b=mapStatistics(revised.map,revised.blockers,edgeIsOpen),fields=['shards','cells','corners','cycles'],body=document.querySelector('#statistics-body');
  for(const [name,stats,difference] of [['历史地图',a,false],['当前默认地图',b,false],['变化',Object.fromEntries(fields.map(k=>[k,b[k]-a[k]])),true]]){
    const row=document.createElement('tr');if(difference)row.className='difference';const heading=document.createElement('th');heading.scope='row';heading.textContent=name;row.append(heading);
    for(const field of fields){const cell=document.createElement('td'),value=stats[field];cell.textContent=difference?(value>0?`+${value}`:value===0?'—':`−${Math.abs(value)}`):String(value);if(difference&&field==='corners'&&value<0)cell.className='is-reduced';row.append(cell);}body.append(row);
  }
  const added=differences.added.length,removed=differences.removed.length;
  const r=revised.safeRoom,roomMap=revised.map.map((row,z)=>[...row].map((tile,x)=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ?tile:'#').join(''));
  const roomCycles=mapStatistics(roomMap,revised.blockers).cycles;
  document.querySelector('#room-cycle-note').textContent=b.cycles-a.cycles===roomCycles?`新增的 ${roomCycles} 个小环路来自安全屋，主迷宫仍保留原来的 ${a.cycles} 个环路。`:`安全屋本身包含 ${roomCycles} 个小环路。`;
  document.querySelector('#change-count').textContent=`+${added} / −${removed} 格`;
  document.querySelector('#difference-summary').textContent=added||removed?`新增 ${added} 格通道，封回 ${removed} 格旧路。${b.corners<a.corners?`度 2 转角减少 ${a.corners-b.corners} 处。`:b.corners>a.corners?`度 2 转角增加 ${b.corners-a.corners} 处。`:'度 2 转角数量不变。'}`:'两份地图的通道布局目前一致。';
  document.querySelector('.comparison').hidden=false;
}

async function init(){
  try{
    const response=await fetch(new URL('../assets/maps/original-map.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Map unavailable');
    original={...await response.json(),title:'历史地图'};revised={map:MAP,blockers:BLOCKED_TRANSITIONS,start:START,enemy:ENEMY_START,exit:EXIT,safeRoom:SAFE_ROOM,entryGate:ENTRY_GATE,title:'当前默认地图'};
    if(!Array.isArray(original.map)||!original.map.length||!Array.isArray(original.blockers)||original.map.some(row=>typeof row!=='string'||row.length!==original.map[0].length))throw new Error('Invalid map');
    const width=Math.max(original.map[0].length,MAP[0].length),height=Math.max(original.map.length,MAP.length);
    camera.width=width+3;camera.height=height+3;camera.homeX=(width-1)/2;camera.homeZ=(height-1)/2;
    differences={added:[],removed:[]};for(let z=0;z<height;z++)for(let x=0;x<width;x++){const a=open(original.map,x,z),b=open(MAP,x,z);if(a!==b)differences[b?'added':'removed'].push({x,z});}
    buildMap(original,document.querySelector('#original-map'));buildMap(revised,document.querySelector('#revised-map'));buildMap(revised,document.querySelector('#overlay-map'),true);
    for(const id of ['original','revised']){const m=id==='original'?original.map:MAP;document.querySelector(`#${id}-dimensions`).textContent=`${m[0].length} × ${m.length}`;}
    for(const button of document.querySelectorAll('button[data-mode]'))button.addEventListener('click',()=>setMode(button.dataset.mode));
    document.querySelector('#show-shards').addEventListener('change',event=>{for(const {crystals} of views)crystals.setAttribute('visibility',event.target.checked?'visible':'hidden');document.querySelector('.shard-key').hidden=!event.target.checked;});
    document.querySelector('#show-coordinates').addEventListener('change',event=>{for(const {coordinates} of views)coordinates.setAttribute('visibility',event.target.checked?'visible':'hidden');});
    document.querySelector('#zoom-in').addEventListener('click',()=>zoomTo(camera.zoom*1.3));document.querySelector('#zoom-out').addEventListener('click',()=>zoomTo(camera.zoom/1.3));document.querySelector('#zoom-fit').addEventListener('click',fit);
    showStatistics();setMode(mode);fit();ui.grid.hidden=false;ui.status.hidden=true;
    document.querySelector('#safe-room-summary').textContent=`从安全屋 S (${START.x}, ${START.z}) 出发，击破入口木板后进入迷宫，集齐后前往出口 X (${EXIT.x}, ${EXIT.z})。历史地图起点为 (${original.start.x}, ${original.start.z})，出口为 (${original.exit.x}, ${original.exit.z})。`;
    const revision=String(original.commit??'').match(/^[a-f0-9]{7,40}$/i)?.[0];if(revision)document.querySelector('#source-note').textContent=`历史地图存档 ${revision.slice(0,7)} / 当前默认地图`;
  }catch(error){ui.status.textContent='地图未能载入，请刷新后重试。';const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载';retry.addEventListener('click',()=>location.reload());ui.status.append(retry);console.error('Map comparison could not load:',error);}
}
if(ui)init();
