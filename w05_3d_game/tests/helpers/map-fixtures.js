import {MAP,SHARDS,neighbors,isOpen,isInSafeRoom,edgeIsOpen} from '../../src/world.js';

const nodes=MAP.flatMap((row,z)=>[...row].flatMap((c,x)=>c==='#'?[]:[{x,z}]));
export const add=(p,v,scale=1)=>({x:p.x+v.x*scale,z:p.z+v.z*scale});
export const heading=v=>Math.atan2(-v.x,-v.z);
export const projection=(p,origin,v)=>(p.x-origin.x)*v.x+(p.z-origin.z)*v.z;

export function straightCorridor(steps=4){
  for(const origin of nodes){
    if(isInSafeRoom(origin))continue;
    const along={x:1,z:0},normal={x:0,z:1};
    let valid=true;
    for(let i=-1;i<=steps;i++){
      const a=add(origin,along,i),b=add(a,along);
      if(!edgeIsOpen(a,b)||(i>=0&&(isOpen(a.x,a.z-1)||isOpen(a.x,a.z+1)))){valid=false;break;}
    }
    if(valid)return{origin,along,normal,at:(x,z=0)=>({x:origin.x+x,z:origin.z+z})};
  }
  throw new Error(`Map needs a straight horizontal corridor with ${steps} clear steps for movement regression`);
}

export function rightAngle(){
  for(const corner of nodes){
    const ns=neighbors(corner);if(isInSafeRoom(corner)||ns.length!==2)continue;
    const u={x:ns[0].x-corner.x,z:ns[0].z-corner.z},v={x:ns[1].x-corner.x,z:ns[1].z-corner.z};
    if(u.x*v.x+u.z*v.z!==0||isOpen(corner.x+u.x+v.x,corner.z+u.z+v.z))continue;
    if(!edgeIsOpen(ns[0],add(ns[0],u))||!edgeIsOpen(ns[1],add(ns[1],v)))continue;
    const incoming={x:-u.x,z:-u.z},outgoing=v;
    return{corner,incoming,outgoing,
      at:(x,z)=>({x:corner.x+incoming.x*x+outgoing.x*z,z:corner.z+incoming.z*x+outgoing.z*z}),
      vector:(x,z)=>({x:incoming.x*x+outgoing.x*z,z:incoming.z*x+outgoing.z*z})};
  }
  throw new Error('Map needs a narrow right-angle corridor for corner regression');
}

export function separatedCorridors(axis,{crystals=false}={}){
  const choices=crystals?SHARDS:nodes,other=axis==='x'?'z':'x';
  for(const a of choices)for(const b of choices){
    const distance=b[axis]-a[axis];if(a[other]!==b[other]||distance<2)continue;
    if(Array.from({length:distance-1},(_,i)=>({...a,[axis]:a[axis]+i+1})).every(p=>!isOpen(p.x,p.z)))return[a,b];
  }
  throw new Error(`Map needs two real ${axis}-separated corridors behind solid walls for visibility regression`);
}
