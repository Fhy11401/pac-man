import {POWER_SECTORS,circuitProgress,nextPowerPanel,powerSignature} from './power-grid.js';
import {MAP, MAP_WIDTH, MAP_HEIGHT, SHARDS, EXIT, ENTRY_GATE, isInSafeRoom, edgeIsOpen} from './world.js';
import {DEFAULT_TUNING} from './tuning.js';
import {BLACKOUT_LAYOUT} from './blackout-layout.js';

// Canvas axes are east/down. Rotating by camera yaw makes forward point up.
export function mapTransform(size, player, yaw, zoom=true,localScale=DEFAULT_TUNING.localMapScale){
  // Keep local corridors the same readable size as the smaller map. The full
  // map fits its diagonal, so rotating a rectangular floor plan never clips it.
  const unit=(size-24)/15, scale=zoom?localScale:.88*15/Math.hypot(MAP_WIDTH,MAP_HEIGHT);
  const anchor=zoom?{x:player.x+.5,z:player.z+.5}:{x:MAP[0].length/2,z:MAP.length/2};
  return {size,unit,scale,yaw,anchor};
}
export function mapPoint(point, transform){
  const {size,unit,scale,yaw,anchor}=transform;
  const x=(point.x+.5-anchor.x)*unit*scale,z=(point.z+.5-anchor.z)*unit*scale;
  return {x:size/2+Math.cos(yaw)*x-Math.sin(yaw)*z,y:size/2+Math.sin(yaw)*x+Math.cos(yaw)*z};
}
export function mapObjectiveEdge(point,transform){
  const target=mapPoint(point,transform),size=transform.size;
  // A complete marker fits inside the seven-pixel clipping border. Its
  // offscreen replacement leaves enough room for the outward arrow tip.
  if(target.x>=20&&target.x<=size-20&&target.y>=20&&target.y<=size-20)return null;
  const dx=target.x-size/2,dy=target.y-size/2,scale=Math.max(1,size/2-27)/Math.max(Math.abs(dx),Math.abs(dy),.001);
  return{x:size/2+dx*scale,y:size/2+dy*scale,angle:Math.atan2(dy,dx)};
}
const cacheByCanvas=new WeakMap();
export function drawMap(canvas,game,yaw=-Math.PI/2,zoom=true,localScale=DEFAULT_TUNING.localMapScale){
  const c=canvas.getContext('2d'),w=canvas.width,t=mapTransform(w,game.player,yaw,zoom,localScale),u=t.unit;
  const blackout=game.blackout;
  const baseSignature=[w,Boolean(blackout),blackout?'':game.collected.size,blackout?'':game.entryOpened].join('|');
  const state=blackout?[powerSignature(blackout),blackout.powerOn,blackout.hasLeftRoom,blackout.doorClosed,Number(blackout.doorProgress??0).toFixed(2),...BLACKOUT_LAYOUT.phones.map((_,i)=>Boolean(blackout.phones?.[i]?.remaining))].join('|'):'';
  let cache=cacheByCanvas.get(canvas);
  if(cache?.game===game&&cache.baseSignature===baseSignature&&cache.state===state&&cache.x===game.player.x&&cache.z===game.player.z&&cache.yaw===yaw&&cache.zoom===zoom&&cache.localScale===localScale)return;
  if(!cache||cache.game!==game||cache.baseSignature!==baseSignature){
    const base=cache?.canvas??document.createElement('canvas');base.width=Math.ceil(MAP_WIDTH*u+2);base.height=Math.ceil(MAP_HEIGHT*u+2);const b=base.getContext('2d');
    b.clearRect(0,0,base.width,base.height);
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#')return;
      b.fillStyle=isInSafeRoom({x,z})?'#12211b':'#070707';b.fillRect(x*u,z*u,u+.2,u+.2);
      b.strokeStyle='#aaa9a4';b.lineWidth=1.1;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!edgeIsOpen({x,z},{x:x+dx,z:z+dz})){
        b.beginPath();if(dx){const xx=(x+(dx>0?1:0))*u;b.moveTo(xx,z*u);b.lineTo(xx,(z+1)*u);}
        else{const zz=(z+(dz>0?1:0))*u;b.moveTo(x*u,zz);b.lineTo((x+1)*u,zz);}b.stroke();
      }
    }));
    if(!blackout){
      b.shadowColor='#b128e2';b.shadowBlur=2.5;b.fillStyle='#b72ddd';
      SHARDS.forEach((p,i)=>{if(game.collected.has(i))return;b.fillRect((p.x+.35)*u,(p.z+.35)*u,u*.3,u*.3);});
      if(!game.entryOpened){b.shadowBlur=0;b.strokeStyle='#d9a04d';b.lineWidth=3;b.beginPath();b.moveTo(ENTRY_GATE.x*u,(ENTRY_GATE.z+.5)*u);b.lineTo((ENTRY_GATE.x+1)*u,(ENTRY_GATE.z+.5)*u);b.stroke();}
      b.shadowBlur=0;b.strokeStyle=game.collected.size===SHARDS.length?'#a2e8b4':'#c4b68e';b.lineWidth=2.5;
      b.strokeRect((EXIT.x+.22)*u,(EXIT.z+.22)*u,u*.56,u*.56);
    }
    cache={canvas:base,game,baseSignature};cacheByCanvas.set(canvas,cache);
  }
  c.fillStyle='#030303';c.fillRect(0,0,w,w);
  c.save();c.beginPath();c.rect(7,7,w-14,w-14);c.clip();
  c.translate(w/2,w/2);c.rotate(yaw);c.scale(t.scale,t.scale);c.translate(-t.anchor.x*u,-t.anchor.z*u);c.drawImage(cache.canvas,0,0);
  if(blackout&&blackout.doorProgress>.02){
    c.strokeStyle=blackout.doorProgress>.95?'#d5a86e':'#aaa18a';c.lineWidth=2.5;c.beginPath();c.moveTo(ENTRY_GATE.x*u,(ENTRY_GATE.z+.5)*u);c.lineTo((ENTRY_GATE.x+blackout.doorProgress)*u,(ENTRY_GATE.z+.5)*u);c.stroke();
  }
  c.restore();
  if(blackout){
    c.save();c.beginPath();c.rect(7,7,w-14,w-14);c.clip();
    const needsNewReturn=blackout.powerOn&&blackout.hasLeftRoom===false;
    const objective=needsNewReturn?{...ENTRY_GATE.outside,id:'return-threshold'}:blackout.powerOn?BLACKOUT_LAYOUT.console:nextPowerPanel(blackout,game.player),edge=mapObjectiveEdge(objective,t),objectiveLabel=needsNewReturn?'门':blackout.powerOn?'C':`P${objective.number}`;
    const markers=[...POWER_SECTORS.map(point=>({point,label:`P${point.number}`,color:circuitProgress(blackout,point)>=1?'#8eb997':'#c7ad78'})),...BLACKOUT_LAYOUT.phones.map((point,i)=>({point,label:String(i+1),color:blackout.phones?.[i]?.remaining>0?'#e2c478':'#c4bea9'})),...BLACKOUT_LAYOUT.lockers.map(point=>({point,label:'L',color:'#a1b0a6'})),{point:BLACKOUT_LAYOUT.console,label:'C',color:'#c8bf9e'}];
    if(needsNewReturn)markers.push({point:objective,label:objectiveLabel,color:'#d8bb7f'});
    for(const marker of markers){
      if(edge&&marker.point.id===objective.id)continue;
      const p=mapPoint(marker.point,t);if(p.x<0||p.y<0||p.x>w||p.y>w)continue;
      c.fillStyle='#070a08';c.beginPath();c.arc(p.x,p.y,12,0,Math.PI*2);c.fill();c.strokeStyle=`${marker.color}99`;c.lineWidth=1;c.stroke();
      c.font='600 17px Consolas,monospace';c.textAlign='center';c.textBaseline='middle';c.fillStyle=marker.color;c.fillText(marker.label,p.x,p.y+.5);
    }
    if(edge){
      c.save();c.translate(edge.x,edge.y);c.rotate(edge.angle);c.fillStyle='#d8bb7f';c.beginPath();c.moveTo(16,0);c.lineTo(10,-4);c.lineTo(10,4);c.closePath();c.fill();c.restore();
      c.fillStyle='#10130d';c.beginPath();c.arc(edge.x,edge.y,10,0,Math.PI*2);c.fill();c.strokeStyle='#d8bb7f';c.lineWidth=1.3;c.stroke();c.font='600 16px Consolas,monospace';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#e2c78d';c.fillText(objectiveLabel,edge.x,edge.y+.5);
    }
    c.restore();
  }
  const player=mapPoint(game.player,t);
  c.save();c.translate(player.x,player.y);
  c.fillStyle='#e1637430';c.beginPath();c.moveTo(0,0);c.arc(0,0,27,-Math.PI*.66,-Math.PI*.34);c.closePath();c.fill();
  c.shadowColor='#f14c70';c.shadowBlur=13;c.fillStyle='#f98c9b';c.beginPath();c.arc(0,0,4.5,0,Math.PI*2);c.fill();
  c.shadowBlur=0;c.fillStyle='#fff0dd';c.beginPath();c.arc(0,-.5,1.7,0,Math.PI*2);c.fill();c.restore();
  Object.assign(cache,{state,x:game.player.x,z:game.player.z,yaw,zoom,localScale});
}
