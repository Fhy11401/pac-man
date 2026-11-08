const key=p=>`${p.x},${p.z}`,edge=(a,b)=>[key(a),key(b)].sort().join('|');
export const POWER_COLORS=['#d5b98b','#90baa2','#8cbbd5','#c4a0c7','#d2a795','#a8b7d4'];
export function resolvePowerLayout(document){
 const {map,facilities:L}=document;
 const isOpen=(x,z)=>map.tiles[z]?.[x]!==undefined&&map.tiles[z][x]!=='#';
 const blocked=new Set(map.barriers.map(({a,b})=>edge(a,b)));
 const neighbors=p=>[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}].filter(n=>isOpen(n.x,n.z)&&!blocked.has(edge(p,n)));
 const isInSafeRoom=p=>p.x>=map.safeRoom.minX&&p.x<=map.safeRoom.maxX&&p.z>=map.safeRoom.minZ&&p.z<=map.safeRoom.maxZ||p.x===map.entryGate.inside.x&&p.z===map.entryGate.inside.z;
// Resolve circuits once from the active editor snapshot. Corridors inherit the
// nearest hall along walkable routes, rather than through intervening walls.
const cells=map.tiles.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[]:[{x,z}]));
const halls=L.halls?.length?L.halls:[{id:'hotel',label:'酒店',bounds:{minX:L.power.x,maxX:L.power.x,minZ:L.power.z,maxZ:L.power.z}}];
const centres=halls.map(h=>({x:(h.bounds.minX+h.bounds.maxX)/2,z:(h.bounds.minZ+h.bounds.maxZ)/2}));
const owners=new Map(),queue=[];
centres.forEach((centre,index)=>{
  if(!cells.length)return;
  const seed=cells.reduce((a,b)=>Math.hypot(a.x-centre.x,a.z-centre.z)<=Math.hypot(b.x-centre.x,b.z-centre.z)?a:b);
  if(!owners.has(key(seed))){owners.set(key(seed),index);queue.push(seed);}
});
for(let head=0;head<queue.length;head++)for(const n of neighbors(queue[head]))if(!owners.has(key(n))){owners.set(key(n),owners.get(key(queue[head])));queue.push(n);}
const primary=owners.get(key(L.power))??0,occupied=[L.power,L.console,...L.phones,...L.batteries];
const sectors=halls.map((hall,index)=>{
  let panel=L.power;
  const explicit=L.powerPanels?.find(p=>p.sector===hall.id);
  if(explicit){panel=explicit;}else if(index!==primary){
    const centre=centres[index],candidates=cells.filter(p=>owners.get(key(p))===index&&!isInSafeRoom(p)&&!occupied.some(o=>Math.hypot(p.x-o.x,p.z-o.z)<1.1)).flatMap(p=>
      [{x:0,z:-1},{x:-1,z:0},{x:1,z:0},{x:0,z:1}].filter(w=>!isOpen(p.x+w.x,p.z+w.z)).map(wall=>({...p,wall})));
    candidates.sort((a,b)=>Math.hypot(a.x-centre.x,a.z-centre.z)-Math.hypot(b.x-centre.x,b.z-centre.z));
    panel=candidates[0];
  }
  if(!panel)return null;
  occupied.push(panel);
  return Object.freeze({...panel,id:explicit?.id??(index===primary?L.power.id:`power-${hall.id}`),sector:hall.id,number:index+1,label:hall.label.split(' / ')[0],index});
}).filter(Boolean);

 return {sectors,cells,owners,sectorAt(point){return sectors.find(s=>s.index===owners.get(`${Math.round(point.x)},${Math.round(point.z)}`))??sectors[0];}};
}
// Old single-panel documents acquire explicit editable panel locations in the editor.
export function materializePowerPanels(doc){
 const layout=resolvePowerLayout(doc),existing=doc.facilities.powerPanels??=[];
 for(const p of layout.sectors)if(!existing.some(e=>e.sector===p.sector))existing.push({id:p.id,sector:p.sector,x:p.x,z:p.z,wall:{...p.wall}});
 return doc;
}
