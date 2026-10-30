import {MAP, SHARDS, EXIT, isOpen} from './world.js';

// Canvas axes are east/down. Rotating by camera yaw makes forward point up.
export function mapTransform(size, player, yaw, zoom=false){
  const unit=(size-24)/MAP.length, scale=zoom?1.8:.8;
  const anchor=zoom?{x:player.x+.5,z:player.z+.5}:{x:MAP[0].length/2,z:MAP.length/2};
  return {size,unit,scale,yaw,anchor};
}
export function mapPoint(point, transform){
  const {size,unit,scale,yaw,anchor}=transform;
  const x=(point.x+.5-anchor.x)*unit*scale,z=(point.z+.5-anchor.z)*unit*scale;
  return {x:size/2+Math.cos(yaw)*x-Math.sin(yaw)*z,y:size/2+Math.sin(yaw)*x+Math.cos(yaw)*z};
}
const cacheByCanvas=new WeakMap();
export function drawMap(canvas,game,yaw=-Math.PI/2,zoom=false){
  const c=canvas.getContext('2d'),w=canvas.width,t=mapTransform(w,game.player,yaw,zoom),u=t.unit;
  let cache=cacheByCanvas.get(canvas);
  if(!cache||cache.game!==game||cache.count!==game.collected.size||cache.width!==w){
    const base=cache?.canvas??document.createElement('canvas');base.width=base.height=w;const b=base.getContext('2d');
    b.clearRect(0,0,w,w);
    MAP.forEach((row,z)=>[...row].forEach((tile,x)=>{
      if(tile==='#')return;
      b.fillStyle='#261b32';b.fillRect(x*u,z*u,u+.2,u+.2);
      b.strokeStyle='#8f729e';b.lineWidth=1.2;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!isOpen(x+dx,z+dz)){
        b.beginPath();if(dx){const xx=(x+(dx>0?1:0))*u;b.moveTo(xx,z*u);b.lineTo(xx,(z+1)*u);}
        else{const zz=(z+(dz>0?1:0))*u;b.moveTo(x*u,zz);b.lineTo((x+1)*u,zz);}b.stroke();
      }
    }));
    b.shadowColor='#ce75ff';b.shadowBlur=5;b.fillStyle='#df94ff';
    SHARDS.forEach((p,i)=>{if(!game.collected.has(i))b.fillRect((p.x+.36)*u,(p.z+.36)*u,u*.28,u*.28);});
    b.shadowBlur=0;b.strokeStyle=game.collected.size===SHARDS.length?'#92efc7':'#c4b68e';b.lineWidth=2.5;
    b.strokeRect((EXIT.x+.22)*u,(EXIT.z+.22)*u,u*.56,u*.56);
    cache={canvas:base,game,count:game.collected.size,width:w};cacheByCanvas.set(canvas,cache);
  }
  c.fillStyle='#09080e';c.fillRect(0,0,w,w);
  c.strokeStyle='#ae7bd309';c.lineWidth=1;
  for(let q=0;q<w;q+=w/12){c.beginPath();c.moveTo(q,0);c.lineTo(q,w);c.moveTo(0,q);c.lineTo(w,q);c.stroke();}
  c.save();c.beginPath();c.rect(7,7,w-14,w-14);c.clip();
  c.translate(w/2,w/2);c.rotate(yaw);c.scale(t.scale,t.scale);c.translate(-t.anchor.x*u,-t.anchor.z*u);c.drawImage(cache.canvas,0,0);c.restore();
  const player=mapPoint(game.player,t);
  c.save();c.translate(player.x,player.y);c.shadowColor='#f36c93';c.shadowBlur=12;
  c.strokeStyle='#ff7eac66';c.lineWidth=1.5;c.beginPath();c.arc(0,0,11,0,Math.PI*2);c.stroke();
  c.fillStyle='#fff3f8';c.beginPath();c.moveTo(0,-8);c.lineTo(5.5,5);c.lineTo(0,2.5);c.lineTo(-5.5,5);c.closePath();c.fill();c.restore();
  c.strokeStyle='#d4afd83b';c.lineWidth=1;
  for(const [x,y,sx,sy] of [[4,4,1,1],[w-4,4,-1,1],[4,w-4,1,-1],[w-4,w-4,-1,-1]]){c.beginPath();c.moveTo(x+sx*15,y);c.lineTo(x,y);c.lineTo(x,y+sy*15);c.stroke();}
}
