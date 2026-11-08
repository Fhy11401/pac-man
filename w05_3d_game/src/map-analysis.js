// Pure grid analysis shared by the editor and map checks; no runtime/world imports.
const key=p=>`${p.x},${p.z}`;
const point=k=>{const [x,z]=k.split(',').map(Number);return{x,z};};
const edge=(a,b)=>[key(a),key(b)].sort().join('|');
const adjacent=(a,b)=>a&&b&&Number.isInteger(a.x)&&Number.isInteger(a.z)&&Number.isInteger(b.x)&&Number.isInteger(b.z)&&Math.abs(a.x-b.x)+Math.abs(a.z-b.z)===1;
const pathKey=cells=>{const route=cells.map(key);return[route.join('|'),route.reverse().join('|')].sort()[0];};

export function analyzeMap(definition){
  const tiles=definition?.tiles??[],nodes=new Map();
  tiles.forEach((row,z)=>[...row].forEach((tile,x)=>{if('.*SEX'.includes(tile))nodes.set(`${x},${z}`,{x,z});}));
  const barriers=new Set((definition?.barriers??[]).filter(t=>adjacent(t.a,t.b)).map(t=>edge(t.a,t.b)));
  const graph=new Map([...nodes].map(([k,p])=>[k,[{x:p.x+1,z:p.z},{x:p.x,z:p.z+1},{x:p.x-1,z:p.z},{x:p.x,z:p.z-1}].filter(n=>nodes.has(key(n))&&!barriers.has(edge(p,n)))]));
  const linked=(a,b)=>graph.get(key(a))?.some(n=>key(n)===key(b))??false;
  const safe=p=>{const r=definition?.safeRoom,g=definition?.entryGate;return Boolean(r&&p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ)||Boolean(g?.inside&&key(p)===key(g.inside));};
  // A square counts as open floor only when all four perimeter edges are open.
  const plazas=new Set();
  for(const p of nodes.values()){
    const right={x:p.x+1,z:p.z},down={x:p.x,z:p.z+1},diagonal={x:p.x+1,z:p.z+1};
    if(linked(p,right)&&linked(p,down)&&linked(right,diagonal)&&linked(down,diagonal))for(const n of[p,right,down,diagonal])plazas.add(key(n));
  }
  const corners=new Set([...nodes].filter(([k,p])=>{const ns=graph.get(k);return!safe(p)&&!plazas.has(k)&&ns.length===2&&ns[0].x!==ns[1].x&&ns[0].z!==ns[1].z;}).map(([k])=>k));
  const shortTurns=[],seenTurns=new Set();
  for(const corner of corners)for(const first of graph.get(corner)){
    let previous=nodes.get(corner),current=first;const cells=[{...previous}];
    for(let traversed=0;traversed<nodes.size;traversed++){
      const k=key(current);if(safe(current)||plazas.has(k)||graph.get(k).length!==2)break;
      cells.push({...current});
      if(corners.has(k)){
        const distance=cells.length-1,id=pathKey(cells);
        if(k!==corner&&distance<4&&!seenTurns.has(id)){seenTurns.add(id);shortTurns.push({cells,distance,message:`连续转弯之间只有 ${distance} 格直线（建议至少 4 格）`});}
        break;
      }
      const next=graph.get(k).find(n=>key(n)!==key(previous));previous=current;current=next;
    }
  }
  // Optional Z-shaped routes through a junction are warnings, never forced turns.
  const warnings=[],seenWarnings=new Set();
  for(const p of nodes.values())if(!safe(p)&&!plazas.has(key(p)))for(const [dx,dz]of[[1,0],[0,1]]){
    const sides=graph.get(key(p)).filter(n=>dx?n.z!==p.z:n.x!==p.x);if(!sides.length)continue;
    let previous=p;const cells=[{...p}];
    for(let distance=1;distance<4;distance++){
      const next={x:p.x+dx*distance,z:p.z+dz*distance};if(!linked(previous,next)||safe(next)||plazas.has(key(next)))break;
      cells.push(next);previous=next;
      if(seenTurns.has(pathKey(cells)))continue;
      const opposite=graph.get(key(next)).some(n=>sides.some(s=>(n.x-next.x)*(s.x-p.x)+(n.z-next.z)*(s.z-p.z)<0));
      const id=pathKey(cells);
      if(opposite&&!seenWarnings.has(id)){seenWarnings.add(id);warnings.push({cells:cells.map(n=>({...n})),distance,message:`岔路附近存在间隔 ${distance} 格的可选 Z 字绕行`});}
    }
  }
  const flood=start=>{
    const visited=new Set();if(!start||!nodes.has(key(start)))return visited;
    const queue=[key(start)];visited.add(queue[0]);
    for(let i=0;i<queue.length;i++)for(const n of graph.get(queue[i]))if(!visited.has(key(n))){visited.add(key(n));queue.push(key(n));}
    return visited;
  };
  const remaining=new Set(nodes.keys());let components=0;
  while(remaining.size){components++;for(const k of flood(point(remaining.values().next().value)))remaining.delete(k);}
  const reached=flood(definition?.start),edges=[...graph.values()].reduce((sum,ns)=>sum+ns.length,0)/2;
  return{
    stats:{cells:nodes.size,shards:tiles.reduce((sum,row)=>sum+[...row].filter(c=>c==='*').length,0),components,cycles:edges-nodes.size+components,corners:corners.size},
    shortTurns,warnings,
    unreachable:[...nodes].filter(([k])=>!reached.has(k)).map(([,p])=>({...p})),
    deadEnds:[...nodes].filter(([k])=>graph.get(k).length===1).map(([,p])=>({...p})),
  };
}
