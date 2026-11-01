import * as THREE from '../vendor/three.module.js';

// A leaning five-sided fragment: uneven shoulders, a twisted lower waist and long points.
// Narrow solid bevels catch the fixtures while retaining the twenty large optical facets.
// All faces, edge strips and closed corner caps still share one instanced draw.
export function crystalGeometry(){
  const positions=[],colours=[],facets=[],sides=5,bevel=.0007;
  const radii=[.077,.070,.083,.074,.068],heights=[.102,.080,.062,.086,.113];
  const ring=(i,lower=false)=>{i%=sides;const a=i/sides*Math.PI*2+.27+(lower?.19:0),r=radii[i]*(lower?.76:1);return [Math.cos(a)*r+(lower?-.010:.005),lower?-.066-(i%3)*.012:heights[i],Math.sin(a)*r+(lower?.008:-.004)];};
  const vertices=[...Array.from({length:sides},(_,i)=>ring(i)),...Array.from({length:sides},(_,i)=>ring(i,true)),[.032,.32,-.023],[-.020,-.28,.021]].map(p=>new THREE.Vector3(...p));
  const faces=[];
  for(let i=0;i<sides;i++){
    const next=(i+1)%sides;
    faces.push([10,next,i],[i,next,5+i],[next,5+next,5+i],[5+i,5+next,11]);
  }
  const shade=face=>[.62,.88,.72,.96,.52][face%5];
  const emit=(a,b,c,facet,colour)=>{
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
    if(normal.dot(new THREE.Vector3().copy(a).add(b).add(c))<0)[b,c]=[c,b];
    for(const p of [a,b,c]){positions.push(p.x,p.y,p.z);colours.push(colour,colour,colour);facets.push(facet/20);}
  };
  // Intersect the triangle's three inward-offset edge lines in its own plane.
  // Adjacent inset edges stay parallel, so their connecting strip is planar.
  const inset=faces.map(face=>face.map((id,i)=>{
    const point=vertices[id],a=new THREE.Vector3().subVectors(vertices[face[(i+1)%3]],point).normalize(),b=new THREE.Vector3().subVectors(vertices[face[(i+2)%3]],point).normalize();
    const sinHalf=Math.sqrt((1-THREE.MathUtils.clamp(a.dot(b),-1,1))/2);
    return point.clone().add(a.add(b).normalize().multiplyScalar(bevel/sinHalf));
  }));
  const edges=new Map(),incident=vertices.map(()=>[]),neighbors=vertices.map(()=>new Map());
  faces.forEach((face,index)=>{
    emit(...inset[index],index,shade(index));
    face.forEach(id=>incident[id].push(index));
    for(let i=0;i<3;i++){const a=face[i],b=face[(i+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');if(!edges.has(key))edges.set(key,{a,b,faces:[]});edges.get(key).faces.push(index);}
  });
  const corner=(face,id)=>inset[face][faces[face].indexOf(id)];
  for(const {a,b,faces:[left,right]} of edges.values()){
    const p=corner(left,a),q=corner(left,b),r=corner(right,b),s=corner(right,a),facet=(left+right)/2,colour=(shade(left)+shade(right))/2;
    emit(p,q,r,facet,colour);emit(p,r,s,facet,colour);
    for(const id of [a,b])for(const [from,to] of [[left,right],[right,left]]){if(!neighbors[id].has(from))neighbors[id].set(from,[]);neighbors[id].get(from).push(to);}
  }
  // Follow actual face adjacency around each vertex; angular sorting could cross
  // very acute tips. A small centre fan closes each cap without a separate mesh.
  incident.forEach((around,id)=>{
    const ordered=[],start=around[0];let previous=-1,current=start;
    do{ordered.push(current);const next=neighbors[id].get(current).find(face=>face!==previous);previous=current;current=next;}while(current!==start);
    const points=ordered.map(face=>corner(face,id)),centre=new THREE.Vector3();points.forEach(p=>centre.add(p));centre.multiplyScalar(1/points.length);
    const facet=around.reduce((sum,face)=>sum+face,0)/around.length,colour=around.reduce((sum,face)=>sum+shade(face),0)/around.length;
    points.forEach((p,i)=>emit(centre,p,points[(i+1)%points.length],facet,colour));
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.setAttribute('crystalFacet',new THREE.Float32BufferAttribute(facets,1));geometry.computeVertexNormals();return geometry;
}
