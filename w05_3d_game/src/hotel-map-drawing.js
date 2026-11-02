import {resolvePowerLayout,POWER_COLORS} from './power-layout.js';
import {hotelEntities,entityPosition} from './hotel-editor-state.js';
export const HOTEL_COLORS={start:'#20876b',enemy:'#bd4153',power:'#d68a18',console:'#336caa',phones:'#a65f3c',batteries:'#54854b',cameras:'#227ab1',patrol:'#8b6fa5',rooms:'#e7d8bc',halls:'#c5dce0'};
const symbols={start:'S',enemy:'E',power:'P',console:'M',phones:'☎',batteries:'B',cameras:'C',patrol:'·'};
export function drawHotelMap(ctx,doc,{scale=22,offsetX=0,offsetY=0,selected=null,grid=true,labels=true,cameraRays=true,powerZones=true}={}){
  ctx.save();ctx.translate(offsetX,offsetY);const m=doc.map,s=scale;
  ctx.fillStyle='#35464b';ctx.fillRect(0,0,m.width*s,m.height*s);
  for(let z=0;z<m.height;z++)for(let x=0;x<m.width;x++)if(m.tiles[z][x]!=='#'){ctx.fillStyle='#f2eee4';ctx.fillRect(x*s,z*s,s,s);}
  const zone=(b,color)=>{ctx.fillStyle=color;ctx.fillRect(b.minX*s,b.minZ*s,(b.maxX-b.minX+1)*s,(b.maxZ-b.minZ+1)*s);};
  for(const room of doc.facilities.rooms)zone(room.bounds,HOTEL_COLORS.rooms);
  for(const hall of doc.facilities.halls)zone(hall.bounds,HOTEL_COLORS.halls);
  if(powerZones){const layout=resolvePowerLayout(doc);for(const p of layout.cells){ctx.fillStyle=POWER_COLORS[(layout.owners.get(`${p.x},${p.z}`)??0)%POWER_COLORS.length];ctx.fillRect(p.x*s,p.z*s,s,s);}}
  zone(m.safeRoom,'#b3d9c7');
  if(grid){ctx.lineWidth=.5;ctx.strokeStyle='rgba(25,49,58,.17)';ctx.beginPath();for(let x=0;x<=m.width;x++){ctx.moveTo(x*s,0);ctx.lineTo(x*s,m.height*s);}for(let z=0;z<=m.height;z++){ctx.moveTo(0,z*s);ctx.lineTo(m.width*s,z*s);}ctx.stroke();}
  for(const room of doc.facilities.rooms){const d=room.door;ctx.lineWidth=Math.max(2,s*.12);ctx.strokeStyle='#805c31';ctx.beginPath();const x=(d.x+.5)*s,y=(d.z+.5)*s;ctx.moveTo(x-(d.axis==='z'?s*.5:0),y-(d.axis==='x'?s*.5:0));ctx.lineTo(x+(d.axis==='z'?s*.5:0),y+(d.axis==='x'?s*.5:0));ctx.stroke();}
  const g=m.entryGate;ctx.lineWidth=3;ctx.strokeStyle='#20876b';ctx.beginPath();ctx.moveTo(g.x*s,(g.z+.5)*s);ctx.lineTo((g.x+1)*s,(g.z+.5)*s);ctx.stroke();
  if(cameraRays)for(const cam of doc.facilities.cameras){const p=cam.position,t=cam.target,a=Math.atan2(t.z-p.z,t.x-p.x),half=cam.fov*Math.PI/360,r=Math.min(6,Math.hypot(t.x-p.x,t.z-p.z))*s,cx=(p.x+.5)*s,cy=(p.z+.5)*s;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a-half,a+half);ctx.closePath();ctx.fillStyle='rgba(34,122,177,.11)';ctx.fill();ctx.strokeStyle='rgba(34,122,177,.32)';ctx.lineWidth=1;ctx.stroke();}
  for(const e of hotelEntities(doc)){
    const p=entityPosition(e),x=(p.x+.5)*s,y=(p.z+.5)*s,isSelected=selected?.kind===e.kind&&selected?.id===e.id;
    if(e.value.bounds){
      if(labels&&s>=11){ctx.font=`600 ${Math.max(10,Math.min(14,s*.53))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#25464d';ctx.fillText(e.label.split(' / ')[0],x,y,Math.max(s,(e.value.bounds.maxX-e.value.bounds.minX+.8)*s));}
      if(isSelected){const b=e.value.bounds;ctx.strokeStyle='#008db0';ctx.lineWidth=3;ctx.strokeRect(b.minX*s+1,b.minZ*s+1,(b.maxX-b.minX+1)*s-2,(b.maxZ-b.minZ+1)*s-2);}continue;
    }
    const r=e.kind==='patrol'?Math.max(2,s*.10):Math.max(5,s*.32);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=HOTEL_COLORS[e.kind]??'#314c59';ctx.fill();ctx.lineWidth=isSelected?3:1;ctx.strokeStyle=isSelected?'#00b4db':'#f8f7ef';ctx.stroke();
    if(e.kind!=='patrol'){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(8,s*.34)}px system-ui`;ctx.fillText(e.kind==='power'?`P${e.number}`:symbols[e.kind],x,y+.5);}
    if(e.kind==='cameras'&&isSelected){ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo((e.value.target.x+.5)*s,(e.value.target.z+.5)*s);ctx.strokeStyle='#167ea5';ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#167ea5';ctx.fillRect((e.value.target.x+.5)*s-4,(e.value.target.z+.5)*s-4,8,8);}
  }
  ctx.restore();
}
export function exportHotelImage(doc){
  const s=25,margin=48,top=108,canvas=document.createElement('canvas');canvas.width=doc.map.width*s+margin*2;canvas.height=doc.map.height*s+top+85;
  const c=canvas.getContext('2d');c.fillStyle='#e9eeeb';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#193f48';c.font='700 28px system-ui';c.fillText(doc.name,margin,42);c.font='14px system-ui';c.fillText(`${doc.map.width} × ${doc.map.height} · 大厅 / 客房 / 摄像头与设施`,margin,70);
  drawHotelMap(c,doc,{scale:s,offsetX:margin,offsetY:top});c.font='11px monospace';c.textAlign='center';for(let x=0;x<doc.map.width;x+=2)c.fillText(x,margin+(x+.5)*s,top-10);c.textAlign='right';for(let z=0;z<doc.map.height;z+=2)c.fillText(z,margin-10,top+(z+.65)*s);
  c.textAlign='left';c.font='13px system-ui';c.fillText('S 出生点  ·  E 敌人  ·  P1–Pn 分区配电  ·  M 监控台  ·  ☎ 诱敌电话  ·  B 电池  ·  C 摄像头',margin,canvas.height-44);c.fillText('通道底色表示供电区域；P 编号为对应配电箱。蓝色扇形为镜头方向，绿色房间为监控室。',margin,canvas.height-20);return canvas;
}
