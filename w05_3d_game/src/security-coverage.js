// Plan-view guidance, not a GPU visibility buffer. The camera's actual 16:9
// perspective is sampled on the floor. Walls are conservative solid occluders;
// moving doors use their rendered lift / double-leaf poses, at eight animation
// steps. Furniture, darkness and individual pixels are deliberately not inferred.
export const SECURITY_COVERAGE_RANGE=40;
export const SECURITY_COVERAGE_ASPECT=16/9;
const EPS=1e-8,FLOOR_Y=.035,STEPS=8,SUBDIVISIONS=3;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const normal=v=>{const d=Math.hypot(v.x,v.y,v.z);return{x:v.x/d,y:v.y/d,z:v.z/d};};
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const clamp=p=>Number.isFinite(p)?Math.max(0,Math.min(1,p)):1;
const progress=p=>{const value=clamp(p);return{value:value===0?0:Math.ceil(value*STEPS)/STEPS,key:value===0?'open':value===1?'closed':`moving-${Math.ceil(value*STEPS)}`};};
const intersects=(a,b,axes)=>{
  let lo=0,hi=1;
  for(const [key,min,max] of axes){const origin=a[key],delta=b[key]-origin;if(Math.abs(delta)<EPS){if(origin<min||origin>max)return false;continue;}
    const t0=(min-origin)/delta,t1=(max-origin)/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}
  return true;
};
const rectAxes=r=>[['x',r.x-r.halfX,r.x+r.halfX],['z',r.z-r.halfZ,r.z+r.halfZ]];
function cutRect(r,wall){
  const x0=Math.max(r.x0,wall.x-wall.halfX),x1=Math.min(r.x1,wall.x+wall.halfX),z0=Math.max(r.z0,wall.z-wall.halfZ),z1=Math.min(r.z1,wall.z+wall.halfZ);
  if(x0>=x1-EPS||z0>=z1-EPS)return[r];
  return[{...r,x1:x0},{...r,x0:x1},{...r,x0,x1,z1:z0},{...r,x0,x1,z0:z1}].filter(p=>p.x1-p.x0>EPS&&p.z1-p.z0>EPS);
}
function pathFor(rectangles){
  const rows=[...rectangles].sort((a,b)=>a.z0-b.z0||a.z1-b.z1||a.x0-b.x0),merged=[];
  for(const rect of rows){const last=merged.at(-1);if(last&&Math.abs(last.z0-rect.z0)<EPS&&Math.abs(last.z1-rect.z1)<EPS&&Math.abs(last.x1-rect.x0)<EPS)last.x1=rect.x1;else merged.push({...rect});}
  const n=value=>String(Math.round(value*10000)/10000);
  return merged.map(r=>`M${n(r.x0)} ${n(r.z0)}H${n(r.x1)}V${n(r.z1)}H${n(r.x0)}Z`).join('');
}

export class SecurityCoverage {
  constructor({tiles,center,unit=2.4,entryGate=null,rooms=[],barriers=[],maxCache=32}={}){
    if(!Array.isArray(tiles)||!tiles.length||!tiles[0].length||!tiles.every(row=>typeof row==='string'&&row.length===tiles[0].length))throw new TypeError('Coverage needs rectangular map rows');
    if(!Number.isFinite(unit)||unit<=0||!Number.isSafeInteger(maxCache)||maxCache<1||maxCache>32)throw new RangeError('Invalid coverage scale or cache size');
    this.tiles=tiles.slice();this.width=tiles[0].length;this.height=tiles.length;this.center={...(center??{x:(this.width-1)/2,z:(this.height-1)/2})};
    if(!Number.isFinite(this.center.x)||!Number.isFinite(this.center.z))throw new TypeError('Invalid map centre');
    this.unit=unit;this.entryGate=entryGate?structuredClone(entryGate):null;this.rooms=structuredClone(rooms);this.barriers=structuredClone(barriers);this.maxCache=maxCache;this.cache=new Map();this.staticViews=new Map();this.layouts=new Map();this.computations=0;this.staticComputations=0;this.cacheHits=0;
  }
  clear(){this.cache.clear();this.staticViews.clear();this.layouts.clear();}
  world(p,y=FLOOR_Y){return{x:(p.x-this.center.x)*this.unit,y,z:(p.z-this.center.z)*this.unit};}
  closed(x,z){return this.tiles[z]?.[x]===undefined||this.tiles[z][x]==='#';}
  layout(width){
    if(this.layouts.has(width))return this.layouts.get(width);
    const half=.5+(this.unit-width)/(2*this.unit),fixed=this.barriers.map(({a,b})=>{
      if(!a||!b||![a.x,a.z,b.x,b.z].every(Number.isInteger)||Math.abs(a.x-b.x)+Math.abs(a.z-b.z)!==1)throw new TypeError('Invalid coverage partition');
      return{x:(a.x+b.x)/2,z:(a.z+b.z)/2,halfX:a.x!==b.x?.19:half,halfZ:a.x!==b.x?half:.19};
    }),patches=[];
    for(let z=0;z<this.height;z++)for(let x=0;x<this.width;x++)if(!this.closed(x,z)){
      const walls=[...fixed];for(let nz=z-1;nz<=z+1;nz++)for(let nx=x-1;nx<=x+1;nx++)if(this.closed(nx,nz))walls.push({x:nx,z:nz,halfX:half,halfZ:half});
      for(let iz=0;iz<SUBDIVISIONS;iz++)for(let ix=0;ix<SUBDIVISIONS;ix++){
        let pieces=[{x0:x-.5+ix/SUBDIVISIONS,x1:x-.5+(ix+1)/SUBDIVISIONS,z0:z-.5+iz/SUBDIVISIONS,z1:z-.5+(iz+1)/SUBDIVISIONS,cellX:x,cellZ:z}];
        for(const wall of walls)pieces=pieces.flatMap(rect=>cutRect(rect,wall));patches.push(...pieces);
      }
    }
    const layout={half,fixed,patches};if(this.layouts.size>=4)this.layouts.delete(this.layouts.keys().next().value);this.layouts.set(width,layout);return layout;
  }
  wallBlocks(a,b,layout){
    for(const wall of layout.fixed)if(intersects(a,b,rectAxes(wall)))return true;
    const dx=b.x-a.x,dz=b.z-a.z,stepX=Math.sign(dx),stepZ=Math.sign(dz),endX=Math.floor(b.x+.5),endZ=Math.floor(b.z+.5);
    let x=Math.floor(a.x+.5),z=Math.floor(a.z+.5),tx=stepX?(x+stepX*.5-a.x)/dx:Infinity,tz=stepZ?(z+stepZ*.5-a.z)/dz:Infinity;
    const deltaX=stepX?Math.abs(1/dx):Infinity,deltaZ=stepZ?Math.abs(1/dz):Infinity,checked=new Set(),limit=Math.abs(endX-x)+Math.abs(endZ-z)+3;
    for(let i=0;i<limit;i++){
      for(let nz=z-1;nz<=z+1;nz++)for(let nx=x-1;nx<=x+1;nx++){
        const id=`${nx},${nz}`;if(checked.has(id))continue;checked.add(id);
        if(this.closed(nx,nz)&&intersects(a,b,[['x',nx-layout.half,nx+layout.half],['z',nz-layout.half,nz+layout.half]]))return true;
      }
      if(x===endX&&z===endZ)break;if(tx<tz){x+=stepX;tx+=deltaX;}else{z+=stepZ;tz+=deltaZ;}
    }
    return false;
  }
  doors(width,ceilingHeight,gateProgress,roomProgress){
    const boxes=[],add=(position,halfX,height,halfZ,yaw,y=height/2)=>boxes.push({position:{...position,y},halfX,halfY:height/2,halfZ,cos:Math.cos(yaw),sin:Math.sin(yaw)});
    if(this.entryGate){const h=Math.min(2.28,ceilingHeight-.29),gate=this.entryGate,yaw=Math.atan2(gate.inside.x-gate.outside.x,gate.inside.z-gate.outside.z);add(this.world(gate),width/2+.006,h,.025,yaw,h/2+(1-gateProgress)*(h+.055));}
    this.rooms.forEach((room,index)=>{
      const h=Math.min(2.24,ceilingHeight-.33),gate=room.door,yaw=Math.atan2(gate.inside.x-gate.outside.x,gate.inside.z-gate.outside.z),origin=this.world(gate),opening=(1-roomProgress[index])*Math.PI/2;
      for(const side of [-1,1]){const angle=yaw+side*opening,pivot=side*width/2,centre=-side*width/4;add({x:origin.x+Math.cos(yaw)*pivot+Math.cos(angle)*centre,z:origin.z-Math.sin(yaw)*pivot-Math.sin(angle)*centre},width/4-.003,h,.025,angle);}
    });return boxes;
  }
  get(channel,{corridorWidth=1.8,ceilingHeight=2.7,doorProgress=1,roomDoors={}}={}){
    if(!finite(channel?.position)||!finite(channel?.target)||!Number.isFinite(channel.fov)||channel.fov<20||channel.fov>120)throw new TypeError('Invalid coverage camera');
    if(!Number.isFinite(corridorWidth)||corridorWidth<=0||corridorWidth>this.unit||!Number.isFinite(ceilingHeight)||ceilingHeight<1)throw new RangeError('Invalid coverage room dimensions');
    const gate=progress(doorProgress),roomStates=this.rooms.map(room=>progress(roomDoors[room.id]?.progress)),viewKey=JSON.stringify([channel.id,channel.position.x,channel.position.y,channel.position.z,channel.target.x,channel.target.y,channel.target.z,channel.fov,corridorWidth]),key=JSON.stringify([viewKey,ceilingHeight,gate.key,...roomStates.map(s=>s.key)]);
    if(this.cache.has(key)){this.cacheHits++;const cached=this.cache.get(key);this.cache.delete(key);this.cache.set(key,cached);return cached;}
    const origin=this.world(channel.position,channel.position.y),target=this.world(channel.target,channel.target.y),delta=subtract(origin,target);
    if(dot(delta,delta)<1e-8)throw new RangeError('Camera target must differ from position');
    let back=normal(delta);if(Math.hypot(back.x,back.z)<EPS)back=normal({...back,z:back.z+.0001});
    const right=normal({x:back.z,y:0,z:-back.x}),up={x:back.y*right.z-back.z*right.y,y:back.z*right.x-back.x*right.z,z:back.x*right.y-back.y*right.x},forward={x:-back.x,y:-back.y,z:-back.z},tan=Math.tan(channel.fov*Math.PI/360);
    const layout=this.layout(corridorWidth),doors=this.doors(corridorWidth,ceilingHeight,gate.value,roomStates.map(s=>s.value)),rectangles=[],samples=[],cells=new Map();
    const visibleStatic=point=>{
      const world=this.world(point),relative=subtract(world,origin),depth=dot(relative,forward);
      if(depth<.045||depth>70||dot(relative,relative)>SECURITY_COVERAGE_RANGE**2||Math.abs(dot(relative,right))>depth*tan*SECURITY_COVERAGE_ASPECT||Math.abs(dot(relative,up))>depth*tan)return false;
      return !this.wallBlocks(channel.position,point,layout);
    };
    let candidates=this.staticViews.get(viewKey);
    if(!candidates){
      candidates=[];for(const patch of layout.patches){
        const sample={x:(patch.x0+patch.x1)/2,z:(patch.z0+patch.z1)/2};if(!visibleStatic(sample))continue;
        const inset=Math.min(.00001,(patch.x1-patch.x0)/4,(patch.z1-patch.z0)/4),corners=[{x:patch.x0+inset,z:patch.z0+inset},{x:patch.x1-inset,z:patch.z0+inset},{x:patch.x1-inset,z:patch.z1-inset},{x:patch.x0+inset,z:patch.z1-inset}];
        if(corners.every(visibleStatic))candidates.push({patch,sample,points:[sample,...corners].map(p=>this.world(p))});
      }
      if(this.staticViews.size>=this.maxCache)this.staticViews.delete(this.staticViews.keys().next().value);this.staticViews.set(viewKey,candidates);this.staticComputations++;
    }
    const occluders=doors.map(door=>{const local=p=>{const dx=p.x-door.position.x,dz=p.z-door.position.z;return{x:door.cos*dx-door.sin*dz,y:p.y-door.position.y,z:door.sin*dx+door.cos*dz};};return{local,origin:local(origin),axes:[['x',-door.halfX,door.halfX],['y',-door.halfY,door.halfY],['z',-door.halfZ,door.halfZ]]};});
    for(const {patch,sample,points} of candidates){
      if(points.some(point=>occluders.some(door=>intersects(door.origin,door.local(point),door.axes))))continue;
      samples.push(Object.freeze(sample));rectangles.push(Object.freeze({...patch}));cells.set(`${patch.cellX},${patch.cellZ}`,Object.freeze({x:patch.cellX,z:patch.cellZ}));
    }
    const result=Object.freeze({key,path:pathFor(rectangles),samples:Object.freeze(samples),cells:Object.freeze([...cells.values()]),rectangles:Object.freeze(rectangles),approximate:true,sampleHeight:FLOOR_Y,range:SECURITY_COVERAGE_RANGE});
    this.computations++;if(this.cache.size>=this.maxCache)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,result);return result;
  }
}
