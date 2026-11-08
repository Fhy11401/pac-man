import {createDefaultMapDocument,normalizeMapDocument,validateMapDocument,isProtectedCell} from './map-document.js';
import {saveDraft,loadDraft,createPreview} from './map-draft.js';
import {EditorHistory,paintCell,placeMarker,setBarrier,hasBarrier,edgeKey,strokeCells,inBounds} from './map-editor-state.js';
import {DEFAULT_EDITOR_SETTINGS} from './map-editor-defaults.js';

const $=id=>document.getElementById(id),canvas=$('map-canvas'),viewport=$('map-viewport'),context=canvas.getContext('2d');
const restored=loadDraft(),history=new EditorHistory(restored.document??createDefaultMapDocument());
const tools={select:'选择 / 拖动标记',path:'画通道',wall:'封墙',shard:'放水晶','erase-shard':'擦除水晶',barrier:'格间隔墙',line:'直线通道',pan:'拖动画布',start:'放置出生点',enemy:'放置敌人',exit:'放置出口'};
const hints={select:'点击查看坐标；拖动 S / E / X 标记调整位置。',path:'按住拖动画通道。快速拉直长路线可用 L 直线工具。',wall:'按住拖动封墙；标记所在格须先移走标记。',shard:'在已有通道上点击或拖动放水晶。','erase-shard':'只擦除水晶，保留通道。',barrier:'点击两格通道之间的边，添加或移除隔墙；拖动可连续设置。',line:'按住拖动，创建水平或竖直长通道；自动对齐同一条轴。',pan:'拖动平移；滚轮缩放。任何工具都可按住空格临时拖图。',start:'点击安全屋内的格子移动出生点，或用选择工具拖动 S。',enemy:'点击安全屋外的通道放置敌人，或拖动 E。',exit:'点击靠实体墙的通道放置出口，或拖动 X。'};
let activeTool='select',hover=null,selected=null,gesture=null,spaceHeld=false,validation,saveTimer,flashTimer,drawPending=false,focusCells=[];
const camera={zoom:1,unit:20,base:20,x:32,y:32,width:0,height:0};
const doc=()=>history.document;
const equal=(a,b)=>Boolean(a&&b&&a.x===b.x&&a.z===b.z);
const open=p=>inBounds(doc(),p)&&doc().tiles[p.z][p.x]!=='#';
const checkbox=id=>$(id)?.checked!==false;
const markerAt=p=>['start','enemy','exit'].find(k=>equal(doc()[k],p));

function status(message,error=false){$('status-message').textContent=message;$('status-message').classList.toggle('is-error',error);clearTimeout(flashTimer);}
function updateHistory(){ $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length; }
function scheduleSave(){clearTimeout(saveTimer);$('save-state').textContent='等待保存…';$('save-state').dataset.state='pending';saveTimer=setTimeout(flushSave,350);}
function flushSave(){clearTimeout(saveTimer);try{saveDraft(doc());$('save-state').textContent='已保存到此浏览器';$('save-state').dataset.state='saved';return true;}catch(error){$('save-state').textContent='未能保存 · 请导出备份';$('save-state').dataset.state='error';status(error.message,true);return false;}}
function commit(){if(history.finish()){updateHistory();scheduleSave();checkMap();}requestDraw();}
function checkedMutation(result){if(result.message&&gesture?.message!==result.message){status(result.message,true);if(gesture)gesture.message=result.message;}return result.changed;}
function afterReplace(message,resetView=true){$('map-name').value=doc().name;selected=null;focusCells=[];updateHistory();checkMap();scheduleSave();if(resetView)fit();status(message);}

function issueButton(issue,parent){
 const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=issue.message;
 const cells=issue.cells??[];button.disabled=!cells.length;button.addEventListener('click',()=>focus(cells));item.append(button);parent.append(item);
}
function checkMap(){
 validation=validateMapDocument(doc());const a=validation.analysis??{},s=a.stats??{};
 for(const [id,key] of [['stat-cells','cells'],['stat-shards','shards'],['stat-corners','corners'],['stat-cycles','cycles']])$(id).textContent=s[key]??'—';
 const list=$('validation-list');list.replaceChildren();
 if(!validation.errors.length){const item=document.createElement('li');item.className='validation-ok';item.textContent='通道连通、标记有效，可以试玩。';list.append(item);}
 validation.errors.forEach(issue=>{issueButton(issue,list);list.lastElementChild.dataset.severity='error';});
 for(const warning of (validation.warnings??[]).filter(w=>!['short-turn','short-turns'].includes(w.code)).slice(0,4))issueButton(warning,list);
 const turns=a.shortTurns??[];$('turn-count').textContent=String(turns.length);$('turn-list').replaceChildren();
 if(!turns.length){const item=document.createElement('li');item.className='validation-ok';item.textContent='没有不足 4 格的连续短折弯。';$('turn-list').append(item);}
 turns.slice(0,24).forEach(turn=>issueButton({...turn,message:turn.message??`相邻拐角只隔 ${turn.distance} 格直路`},$('turn-list')));
 if(turns.length>24){const item=document.createElement('li');item.textContent=`另有 ${turns.length-24} 处；启用高亮查看。`;$('turn-list').append(item);}
 $('play-draft').disabled=!validation.valid;$('play-draft').title=validation.valid?'在新标签页试玩当前地图':'先修复右侧布局检查中的错误';
 requestDraw();
}

function resize(){
 const bounds=viewport.getBoundingClientRect(),previous={...camera};camera.width=Math.max(1,bounds.width);camera.height=Math.max(1,bounds.height);
 const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(camera.width*ratio);canvas.height=Math.round(camera.height*ratio);canvas.style.width=camera.width+'px';canvas.style.height=camera.height+'px';
 camera.base=Math.max(4,Math.min((camera.width-64)/doc().width,(camera.height-64)/doc().height));camera.unit=camera.base*camera.zoom;
 if(!previous.width)fit();else{const centerX=(previous.width/2-previous.x)/previous.unit,centerZ=(previous.height/2-previous.y)/previous.unit;camera.x=camera.width/2-centerX*camera.unit;camera.y=camera.height/2-centerZ*camera.unit;requestDraw();}
}
function fit(){camera.zoom=1;camera.unit=camera.base;camera.x=(camera.width-doc().width*camera.unit)/2;camera.y=(camera.height-doc().height*camera.unit)/2;updateZoom();}
function updateZoom(){$('zoom-value').textContent=Math.round(camera.zoom*100)+'%';$('zoom-out').disabled=camera.zoom<=.65;$('zoom-in').disabled=camera.zoom>=6;requestDraw();}
function zoom(value,point={x:camera.width/2,y:camera.height/2}){
 const next=Math.max(.65,Math.min(6,value)),old=camera.unit;camera.zoom=next;camera.unit=camera.base*next;
 camera.x=point.x-(point.x-camera.x)/old*camera.unit;camera.y=point.y-(point.y-camera.y)/old*camera.unit;updateZoom();
}
function focus(cells){if(!cells.length)return;focusCells=cells;selected={...cells[0]};camera.zoom=Math.max(camera.zoom,1.7);camera.unit=camera.base*camera.zoom;camera.x=camera.width/2-(selected.x+.5)*camera.unit;camera.y=camera.height/2-(selected.z+.5)*camera.unit;updateCell();updateZoom();}
function point(event){const r=canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
function cellAt(p,clamp=false){const result={x:Math.floor((p.x-camera.x)/camera.unit),z:Math.floor((p.y-camera.y)/camera.unit)};if(clamp){result.x=Math.max(0,Math.min(doc().width-1,result.x));result.z=Math.max(0,Math.min(doc().height-1,result.z));}return result;}
function nearestEdge(p){
 const x=(p.x-camera.x)/camera.unit,z=(p.y-camera.y)/camera.unit,a={x:Math.floor(x),z:Math.floor(z)},fx=x-a.x,fz=z-a.z;
 const sides=[{d:fx,b:{x:a.x-1,z:a.z}},{d:1-fx,b:{x:a.x+1,z:a.z}},{d:fz,b:{x:a.x,z:a.z-1}},{d:1-fz,b:{x:a.x,z:a.z+1}}];sides.sort((a,b)=>a.d-b.d);return{a,b:sides[0].b};
}
function updateCell(){
 const p=selected??hover;if(!p||!inBounds(doc(),p)){$('cell-info').textContent='点击地图选择一格';return;}
 const type=doc().tiles[p.z][p.x],roles=['start','enemy','exit'].filter(k=>equal(doc()[k],p)).map(k=>({start:'出生点',enemy:'敌人',exit:'出口'})[k]);
 $('cell-info').textContent=`X ${String(p.x).padStart(2,'0')} / Z ${String(p.z).padStart(2,'0')} · ${type==='#'?'墙体':type==='*'?'通道 + 水晶':'通道'}${roles.length?' · '+roles.join(' / '):''}${isProtectedCell(doc(),p)?' · 结构锁定':''}`;
}
function setTool(tool){if(!tools[tool])return;activeTool=tool;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===tool));$('tool-help').textContent=hints[tool];viewport.dataset.tool=tool;requestDraw();}

function edgePath(ctx,a,b,u,ox,oy){
 ctx.beginPath();if(a.x!==b.x){const x=ox+Math.max(a.x,b.x)*u;ctx.moveTo(x,oy+a.z*u);ctx.lineTo(x,oy+(a.z+1)*u);}else{const y=oy+Math.max(a.z,b.z)*u;ctx.moveTo(ox+a.x*u,y);ctx.lineTo(ox+(a.x+1)*u,y);}ctx.stroke();
}
function paintMap(ctx,model,{u,ox,oy,grid=true,shards=true,turns=true,selection=true,labels=true}){
 ctx.fillStyle='#344b58';ctx.fillRect(ox,oy,model.width*u,model.height*u);
 for(let z=0;z<model.height;z++)for(let x=0;x<model.width;x++){
  if(model.tiles[z][x]==='#')continue;
  const r=model.safeRoom,safe=(x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ)||equal({x,z},model.entryGate.inside);
  ctx.fillStyle=safe?'#c8e0d4':'#ede7d3';ctx.fillRect(ox+x*u,oy+z*u,u+.15,u+.15);
  if(shards&&model.tiles[z][x]==='*'){
   const cx=ox+(x+.5)*u,cy=oy+(z+.5)*u,radius=Math.max(1.4,u*.14);ctx.fillStyle='#9254ad';ctx.beginPath();ctx.moveTo(cx,cy-radius*1.3);ctx.lineTo(cx+radius,cy);ctx.lineTo(cx,cy+radius*1.3);ctx.lineTo(cx-radius,cy);ctx.closePath();ctx.fill();
  }
 }
 if(grid){ctx.strokeStyle='#102a3930';ctx.lineWidth=.6;ctx.beginPath();for(let x=0;x<=model.width;x++){ctx.moveTo(ox+x*u,oy);ctx.lineTo(ox+x*u,oy+model.height*u);}for(let z=0;z<=model.height;z++){ctx.moveTo(ox,oy+z*u);ctx.lineTo(ox+model.width*u,oy+z*u);}ctx.stroke();}
 if(turns){ctx.fillStyle='#db9d4666';for(const turn of validation?.analysis?.shortTurns??[])for(const p of turn.cells??[])ctx.fillRect(ox+p.x*u+u*.1,oy+p.z*u+u*.1,u*.8,u*.8);}
 ctx.strokeStyle='#ed7e75';ctx.lineWidth=Math.max(2,u*.12);ctx.lineCap='square';for(const e of model.barriers)edgePath(ctx,e.a,e.b,u,ox,oy);
 ctx.strokeStyle='#b78331';ctx.lineWidth=Math.max(3,u*.15);ctx.setLineDash([Math.max(2,u*.17),Math.max(1,u*.06)]);edgePath(ctx,model.entryGate.inside,model.entryGate.outside,u,ox,oy);ctx.setLineDash([]);
 const r=model.safeRoom;ctx.strokeStyle='#439b7d';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.strokeRect(ox+r.minX*u+2,oy+r.minZ*u+2,(r.maxX-r.minX+1)*u-4,(r.maxZ-r.minZ+1)*u-4);ctx.setLineDash([]);
 for(const [kind,label,color] of [['start','S','#58b99a'],['enemy','E','#e9998e'],['exit','X','#dbc180']]){
  const p=selection&&gesture?.kind==='marker'&&gesture.marker===kind?gesture.last:model[kind],cx=ox+(p.x+.5)*u,cy=oy+(p.z+.5)*u;
  ctx.fillStyle=color;ctx.strokeStyle='#1c3443';ctx.lineWidth=Math.max(1,u*.05);ctx.beginPath();ctx.arc(cx,cy,u*.32,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#172c3b';ctx.font=`700 ${Math.max(9,u*.43)}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,cx,cy+.5);
 }
 if(labels){const step=u<12?4:u<20?2:1;ctx.font=`${Math.max(9,Math.min(12,u*.38))}px Consolas,monospace`;ctx.fillStyle='#a4bbc4';ctx.textBaseline='middle';ctx.textAlign='center';for(let x=0;x<model.width;x+=step)ctx.fillText(x,ox+(x+.5)*u,oy-13);ctx.textAlign='right';for(let z=0;z<model.height;z+=step)ctx.fillText(z,ox-10,oy+(z+.5)*u);}
 if(selection){
  ctx.fillStyle='#ee9c7244';ctx.strokeStyle='#ffc99b';ctx.lineWidth=2;for(const p of focusCells){ctx.fillRect(ox+p.x*u+1,oy+p.z*u+1,u-2,u-2);ctx.strokeRect(ox+p.x*u+1,oy+p.z*u+1,u-2,u-2);}
  if(gesture?.kind==='line'){ctx.fillStyle='#53c4ad88';for(const p of strokeCells(gesture.start,gesture.last,true))ctx.fillRect(ox+p.x*u+1,oy+p.z*u+1,u-2,u-2);}
  if(selected&&inBounds(model,selected)){ctx.strokeStyle='#7ee0ce';ctx.lineWidth=2;ctx.strokeRect(ox+selected.x*u+1,oy+selected.z*u+1,u-2,u-2);}
  if(hover&&inBounds(model,hover)){ctx.strokeStyle='#e9f4ef';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);ctx.strokeRect(ox+hover.x*u+2,oy+hover.z*u+2,u-4,u-4);ctx.setLineDash([]);}
  if(activeTool==='barrier'&&hoverPoint){const e=nearestEdge(hoverPoint);if(inBounds(model,e.a)&&inBounds(model,e.b)){ctx.strokeStyle='#ffcf86';ctx.lineWidth=4;edgePath(ctx,e.a,e.b,u,ox,oy);}}
 }
}
let hoverPoint=null;
function requestDraw(){if(drawPending)return;drawPending=true;requestAnimationFrame(()=>{drawPending=false;draw();});}
function draw(){
 const ratio=canvas.width/camera.width;context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,camera.width,camera.height);context.fillStyle='#172c3b';context.fillRect(0,0,camera.width,camera.height);
 paintMap(context,doc(),{u:camera.unit,ox:camera.x,oy:camera.y,grid:checkbox('show-grid'),shards:checkbox('show-shards'),turns:checkbox('show-turns')});
}

function applyStroke(from,to){for(const p of strokeCells(from,to))checkedMutation(paintCell(doc(),p,activeTool,checkbox('auto-shards')));requestDraw();}
function applyEdge(pointer){const e=nearestEdge(pointer),key=edgeKey(e.a,e.b);if(gesture.visited.has(key))return;gesture.visited.add(key);checkedMutation(setBarrier(doc(),e.a,e.b,gesture.present));requestDraw();}
function applyEdgeStroke(pointer){const previous=gesture.lastPointer??pointer,steps=Math.max(1,Math.ceil(Math.hypot(pointer.x-previous.x,pointer.y-previous.y)/(camera.unit*.3)));for(let i=1;i<=steps;i++)applyEdge({x:previous.x+(pointer.x-previous.x)*i/steps,y:previous.y+(pointer.y-previous.y)*i/steps});gesture.lastPointer=pointer;}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0&&event.button!==1)return;event.preventDefault();canvas.focus({preventScroll:true});const pointer=point(event),p=cellAt(pointer);hoverPoint=pointer;hover=p;focusCells=[];
 if(event.button===1||spaceHeld||activeTool==='pan'){gesture={kind:'pan',id:event.pointerId,origin:pointer,x:camera.x,y:camera.y};}
 else if(!inBounds(doc(),p))return;
 else{
  selected=p;updateCell();const marker=activeTool==='select'?markerAt(p):['start','enemy','exit'].includes(activeTool)?activeTool:null;
  if(marker){history.begin('移动'+tools[marker]);gesture={kind:'marker',id:event.pointerId,marker,start:p,last:p};}
  else if(activeTool==='select'){gesture={kind:'select',id:event.pointerId};}
  else if(activeTool==='line'){history.begin('画直线通道');gesture={kind:'line',id:event.pointerId,start:p,last:p};}
  else if(activeTool==='barrier'){const e=nearestEdge(pointer);history.begin('调整隔墙');gesture={kind:'barrier',id:event.pointerId,visited:new Set(),present:!hasBarrier(doc(),e.a,e.b)};applyEdgeStroke(pointer);}
  else{history.begin(tools[activeTool]);gesture={kind:'paint',id:event.pointerId,last:p};applyStroke(p,p);}
 }
 canvas.setPointerCapture(event.pointerId);requestDraw();
});
canvas.addEventListener('pointermove',event=>{
 const pointer=point(event),p=cellAt(pointer);hoverPoint=pointer;hover=inBounds(doc(),p)?p:null;
 if(gesture){const clipped=cellAt(pointer,true);
  if(gesture.kind==='pan'){camera.x=gesture.x+pointer.x-gesture.origin.x;camera.y=gesture.y+pointer.y-gesture.origin.y;}
  else if(gesture.kind==='paint'){applyStroke(gesture.last,clipped);gesture.last=clipped;}
  else if(gesture.kind==='line'||gesture.kind==='marker')gesture.last=clipped;
  else if(gesture.kind==='barrier')applyEdgeStroke(pointer);
 }updateCell();requestDraw();
});
function finishGesture(cancel=false){
 if(!gesture)return;const g=gesture;
 if(cancel&&['marker','line'].includes(g.kind))history.cancel();
 else if(g.kind==='marker')checkedMutation(placeMarker(doc(),g.last,g.marker));
 else if(g.kind==='line')for(const p of strokeCells(g.start,g.last,true))checkedMutation(paintCell(doc(),p,'line',checkbox('auto-shards')));
 gesture=null;if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);commit();updateCell();
}
canvas.addEventListener('pointerup',()=>finishGesture());canvas.addEventListener('pointercancel',()=>finishGesture(true));canvas.addEventListener('lostpointercapture',()=>finishGesture(true));
canvas.addEventListener('pointerleave',()=>{if(!gesture){hover=null;hoverPoint=null;requestDraw();}});canvas.addEventListener('auxclick',e=>e.preventDefault());canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(camera.zoom*Math.exp(-e.deltaY*.0014),point(e));},{passive:false});
document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{finishGesture();setTool(button.dataset.tool);}));
for(const id of ['show-grid','show-shards','show-turns'])$(id).addEventListener('change',requestDraw);
$('zoom-in').onclick=()=>zoom(camera.zoom*1.25);$('zoom-out').onclick=()=>zoom(camera.zoom/1.25);$('zoom-fit').onclick=fit;
function undo(){finishGesture();const label=history.undo();if(label){afterReplace('已撤销：'+label,false);}}
function redo(){finishGesture();const label=history.redo();if(label){afterReplace('已重做：'+label,false);}}
$('undo').onclick=undo;$('redo').onclick=redo;
$('map-name').addEventListener('focus',()=>history.begin('修改草稿名称'));
$('map-name').addEventListener('input',()=>{if(!history.pending)history.begin('修改草稿名称');doc().name=$('map-name').value.slice(0,80)||'未命名地图';scheduleSave();});
$('map-name').addEventListener('change',commit);$('map-name').addEventListener('blur',commit);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function filename(){return(doc().name||'地图').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60);}
$('export-json').onclick=()=>{finishGesture();download(new Blob([JSON.stringify(normalizeMapDocument(doc()),null,2)],{type:'application/json'}),filename()+'.json');status('地图文件已导出；发回这个 JSON 就能准确还原。');};
$('export-png').onclick=()=>{
 const image=document.createElement('canvas'),u=64,ox=80,oy=160;image.width=doc().width*u+160;image.height=doc().height*u+270;const c=image.getContext('2d');
 c.fillStyle='#172c3b';c.fillRect(0,0,image.width,image.height);c.fillStyle='#efe8d6';c.font='600 40px Microsoft YaHei,sans-serif';c.fillText(doc().name,ox,70);c.fillStyle='#a3bac1';c.font='22px Microsoft YaHei,sans-serif';c.fillText('旅馆地图 · S 出生点 / E 敌人 / X 出口 · 金色虚线为木板入口',ox,111);
 paintMap(c,doc(),{u,ox,oy,shards:checkbox('show-shards'),grid:true,turns:false,selection:false});c.textAlign='left';c.fillStyle='#a3bac1';c.font='21px Microsoft YaHei,sans-serif';c.fillText('坐标从 0 开始 · 深色墙体 / 浅色通道 / 红色固定隔墙 / 绿色安全屋',ox,image.height-38);
 image.toBlob(blob=>{if(blob){download(blob,filename()+'.png');status('高清地图图片已导出。');}else status('图片导出失败，请重试。',true);},'image/png');
};
$('import-json-button').onclick=()=>$('import-json').click();
$('import-json').addEventListener('change',async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{if(file.size>256000)throw new Error('地图文件太大，请选择编辑器导出的 JSON。');const next=normalizeMapDocument(JSON.parse(await file.text()));finishGesture();history.replace(next,'导入地图');afterReplace('已导入地图。可以撤销返回原来的草稿。');}catch(error){status('导入失败：'+error.message,true);}
});
function resetEditorSettings(){for(const [id,key] of [['show-grid','showGrid'],['show-shards','showShards'],['show-turns','showTurns'],['auto-shards','autoShards']])$(id).checked=DEFAULT_EDITOR_SETTINGS[key];setTool(DEFAULT_EDITOR_SETTINGS.tool);}
$('reset-map').onclick=()=>{finishGesture();history.replace(createDefaultMapDocument(),'还原默认地图');resetEditorSettings();afterReplace('已还原默认地图与显示设置；Ctrl+Z 可以找回刚才的草稿。');};
$('load-original').onclick=async()=>{
 if(!confirm('载入所选旧图并替换当前草稿？可以撤销恢复。'))return;
 try{const previous=$('map-preset')?.value==='previous';const response=await fetch(previous?'./assets/maps/maplab-before-editor.json':'./assets/maps/original-map.json');if(!response.ok)throw new Error('旧图读取失败');const raw=await response.json();let next;
  if(previous)next=normalizeMapDocument(raw);else{
   next=createDefaultMapDocument();next.name='同学原图 · 含安全屋';next.tiles=raw.map.map(row=>row.replace(/[SE]/g,'.'));next.enemy={...raw.enemy};next.exit={...raw.exit};next.barriers=raw.blockers.map(({a,b})=>({a,b}));
   const base=createDefaultMapDocument();for(let z=0;z<base.height;z++)for(let x=0;x<base.width;x++)if(isProtectedCell(base,{x,z}))next.tiles[z]=next.tiles[z].slice(0,x)+base.tiles[z][x]+next.tiles[z].slice(x+1);
   next=normalizeMapDocument(next);
  }finishGesture();history.replace(next,'载入旧图');afterReplace('已载入旧图。短折弯会在右侧列出。');
 }catch(error){status(error.message,true);}
};
$('play-draft').onclick=()=>{
 finishGesture();checkMap();if(!validation.valid){status('请先修复右侧标出的布局错误。',true);return;}
 try{flushSave();const preview=createPreview(doc());window.open(preview.url,'_blank','noopener');status('已打开独立试玩。继续编辑不会改变正在试玩的地图。');}catch(error){status('试玩未打开：'+error.message,true);}
};
window.addEventListener('keydown',event=>{
 const target=event.target;if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable)return;
 const key=event.key.toLowerCase();
 if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
 if((event.ctrlKey||event.metaKey)&&key==='y'){event.preventDefault();redo();return;}
 if((event.ctrlKey||event.metaKey)&&key==='s'){event.preventDefault();if(flushSave())status('地图草稿已保存到此浏览器。');return;}
 if(event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code==='Space'){event.preventDefault();spaceHeld=true;viewport.classList.add('is-panning');return;}
 if(key==='escape'){finishGesture(true);focusCells=[];setTool('select');return;}
 if(key==='home'){event.preventDefault();fit();return;}if(key==='+'||key==='='){zoom(camera.zoom*1.25);return;}if(key==='-'){zoom(camera.zoom/1.25);return;}
 const shortcut={v:'select',p:'path',w:'wall',c:'shard',x:'erase-shard',b:'barrier',l:'line',h:'pan',s:'start',e:'enemy',o:'exit'}[key];if(shortcut){event.preventDefault();finishGesture();setTool(shortcut);}
});
window.addEventListener('keyup',event=>{if(event.code==='Space'){spaceHeld=false;viewport.classList.remove('is-panning');}});
window.addEventListener('blur',()=>{spaceHeld=false;viewport.classList.remove('is-panning');finishGesture(true);});
window.addEventListener('pagehide',()=>{history.finish();flushSave();});
$('map-name').value=doc().name;$('save-state').textContent=restored.document?'已恢复本机草稿':'新草稿 · 编辑后自动保存';updateHistory();setTool('select');checkMap();new ResizeObserver(resize).observe(viewport);
if(restored.error)status(restored.error+' 已载入默认路线。',true);else status('选工具后在地图上拖动。Ctrl+Z 撤销；完成后点击试玩草稿。');
