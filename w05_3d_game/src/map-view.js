import {MAP, SHARDS, EXIT, isOpen} from './world.js';
import {DEFAULT_TUNING} from './tuning.js';

// Canvas axes are east/down. Rotating by camera yaw makes forward point up.
export function mapTransform(size, player, yaw, zoom=true,localScale=DEFAULT_TUNING.localMapScale){
  const unit=(size-24)/MAP.length, scale=zoom?localScale:.8;
  const anchor=zoom?{x:player.x+.5,z:player.z+.5}:{x:MAP[0].length/2,z:MAP.length/2};
  return {size,unit,scale,yaw,anchor};
}
export function mapPoint(point, transform){
  const {size,unit,scale,yaw,anchor}=transform;
  const x=(point.x+.5-anchor.x)*unit*scale,z=(point.z+.5-anchor.z)*unit*scale;
  return {x:size/2+Math.cos(yaw)*x-Math.sin(yaw)*z,y:size/2+Math.sin(yaw)*x+Math.cos(yaw)*z};
}
const cacheByCanvas=new WeakMap();
export function drawMap(canvas,game,yaw=-Math.PI/2,zoom=true,localScale=DEFAULT_TUNING.localMapScale){
  const c=canvas.getContext('2d'),w=canvas.width,t=mapTransform(w,game.player,yaw,zoom,localScale),u=t.unit;
  let cache=cacheByCanvas.get(canvas);
  if(cache?.game===game&&cache.count===game.collected.size&&cache.width===w&&cache.x===game.player.x&&cache.z===game.player.z&&cache.yaw===yaw&&cache.zoom===zoom&&cache.localScale===localScale)return;
  if(!cache||cache.game!==game||cache.count!==game.collected.size||cache.width!==w){
    const base=cache?.canvas??document.createElement('canvas');base.width=base.height=w;const b=base.getContext('2d');
    b.clearRect(0,0,w,w);
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#')return;
      b.fillStyle='#070707';b.fillRect(x*u,z*u,u+.2,u+.2);
      b.strokeStyle='#aaa9a4';b.lineWidth=1.1;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!isOpen(x+dx,z+dz)){
        b.beginPath();if(dx){const xx=(x+(dx>0?1:0))*u;b.moveTo(xx,z*u);b.lineTo(xx,(z+1)*u);}
        else{const zz=(z+(dz>0?1:0))*u;b.moveTo(x*u,zz);b.lineTo((x+1)*u,zz);}b.stroke();
      }
    }));
    b.shadowColor='#b128e2';b.shadowBlur=2.5;b.fillStyle='#b72ddd';
    SHARDS.forEach((p,i)=>{if(game.collected.has(i))return;b.fillRect((p.x+.35)*u,(p.z+.35)*u,u*.3,u*.3);});
    b.shadowBlur=0;b.strokeStyle=game.collected.size===SHARDS.length?'#a2e8b4':'#c4b68e';b.lineWidth=2.5;
    b.strokeRect((EXIT.x+.22)*u,(EXIT.z+.22)*u,u*.56,u*.56);
    cache={canvas:base,game,count:game.collected.size,width:w};cacheByCanvas.set(canvas,cache);
  }
  c.fillStyle='#030303';c.fillRect(0,0,w,w);
  c.save();c.beginPath();c.rect(7,7,w-14,w-14);c.clip();
  c.translate(w/2,w/2);c.rotate(yaw);c.scale(t.scale,t.scale);c.translate(-t.anchor.x*u,-t.anchor.z*u);c.drawImage(cache.canvas,0,0);c.restore();
  const player=mapPoint(game.player,t);
  c.save();c.translate(player.x,player.y);
  c.fillStyle='#e1637430';c.beginPath();c.moveTo(0,0);c.arc(0,0,27,-Math.PI*.66,-Math.PI*.34);c.closePath();c.fill();
  c.shadowColor='#f14c70';c.shadowBlur=13;c.fillStyle='#f98c9b';c.beginPath();c.arc(0,0,4.5,0,Math.PI*2);c.fill();
  c.shadowBlur=0;c.fillStyle='#fff0dd';c.beginPath();c.arc(0,-.5,1.7,0,Math.PI*2);c.fill();c.restore();
  Object.assign(cache,{x:game.player.x,z:game.player.z,yaw,zoom,localScale});
}
