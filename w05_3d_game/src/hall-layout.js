// Metres for object sizes; grid coordinates for centres/collision footprints.
// No renderer or world import: navigation and scenery consume the same plan.
export function hallKind(hall){const value=hall.type??hall.id;return value==='ballroom'?'banquet':['reception','lounge','banquet','atrium'].includes(value)?value:'lounge';}
export function hallAt(halls,x,z){return halls.find(({bounds:b})=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);}
export function hallDimensions(hall,width=1.8,unit=2.4,ceiling=2.7){
  const b=hall.bounds,kind=hallKind(hall),extra={reception:.45,lounge:.20,banquet:1.05,atrium:1.40}[kind];
  return{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,width:(b.maxX-b.minX)*unit+width,depth:(b.maxZ-b.minZ)*unit+width,height:ceiling+extra,kind};
}
export function hallFurniture(halls,width=1.8,unit=2.4,isOpen){
  if(!Number.isFinite(width)||width<=0||width>unit||!Number.isFinite(unit)||unit<=0)throw new RangeError('Invalid hall scale');
  if(typeof isOpen!=='function')throw new TypeError('Hall furniture requires the actual map openings');
  const result=[];
  for(const hall of halls){
    const b=hall.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,kind=hallKind(hall);
    const add=(type,side,tangent,w,d,height)=>{
      const alongX=side==='north'||side==='south',negative=side==='north'||side==='west';
      const normal={x:alongX?0:negative?-1:1,z:alongX?negative?-1:1:0};
      const lo=alongX?b.minX:b.minZ,hi=alongX?b.maxX:b.maxZ,edge=alongX?(negative?b.minZ:b.maxZ):(negative?b.minX:b.maxX);
      if(tangent-w/(2*unit)<lo-width/(2*unit)+.10||tangent+w/(2*unit)>hi+width/(2*unit)-.10)return;
      // Check every adjacent cell touched by the object, including its ends.
      // No counter/sofa/column is allowed in front of a passage or room door.
      for(let t=tangent-w/(2*unit)-.08;t<=tangent+w/(2*unit)+.08;t+=.08){
        const a=Math.max(lo,Math.min(hi,Math.round(t))),x=alongX?a:edge+normal.x,z=alongX?edge+normal.z:a;
        if(isOpen(x,z))return;
      }
      const centre=edge+(negative?-1:1)*(width-d)/(2*unit),x=alongX?tangent:centre,z=alongX?centre:tangent;
      const item={id:`${hall.id}-${type}-${result.length}`,type:'furniture',kind:type,hall:hall.id,x,z,halfX:(alongX?w:d)/(2*unit),halfZ:(alongX?d:w)/(2*unit),width:w,depth:d,height,blocksSight:type==='pilaster',angle:Math.atan2(-normal.x,-normal.z),wall:normal};
      // Separate nearby furniture even when a resized hall becomes compact.
      if(result.some(other=>other.hall===hall.id&&Math.abs(other.x-x)<other.halfX+item.halfX+.05&&Math.abs(other.z-z)<other.halfZ+item.halfZ+.05))return;
      result.push(item);return item;
    };
    const frontDepth=Math.min(.65,Math.max(.25,width/2-.30)),tx=Math.floor(cx)+.5,tz=Math.floor(cz)+.5;
    if(kind==='reception'){
      let placed=0;for(const side of ['north','west','east','south']){const centre=side==='north'||side==='south'?tx:tz;for(const offset of [-1,0,1]){if(add('counter',side,centre+offset,1.6,frontDepth,1.08))placed++;if(placed>=2)break;}if(placed>=2)break;}
    }else if(kind==='lounge'){
      for(const side of ['west','east'])for(const offset of [-1,1])add('sofa',side,tz+offset,1.6,frontDepth,.90);
      for(const side of ['north','south'])add('floor-lamp',side,tx,.34,.34,1.88);
    }else{
      const depth=Math.min(.34,Math.max(.13,width/2-.46));
      for(const side of ['north','south'])for(const t of [b.minX+.5,b.maxX-.5])add(kind==='banquet'?'pilaster':'pedestal',side,t,.46,depth,kind==='banquet'?3.75:1.12);
    }
  }
  return result;
}
export function hallFurnitureWalls(halls,width=1.8,unit=2.4,isOpen){return hallFurniture(halls,width,unit,isOpen).map(({id,type,x,z,halfX,halfZ,blocksSight})=>({id,type,x,z,halfX,halfZ,blocksSight}));}
