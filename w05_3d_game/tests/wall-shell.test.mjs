import test from 'node:test';
import assert from 'node:assert/strict';
import {createWallShell} from '../src/wall-shell.js';
import {MAP,isOpen,CELL_SIZE,wallInset} from '../src/world.js';

const close=(a,b,eps=2e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const triangleData=g=>{const p=g.attributes.position,n=g.attributes.normal,result=[];for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],points=ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]),normal=[n.getX(ids[0]),n.getY(ids[0]),n.getZ(ids[0])];result.push({points,normal});}return result;};
const areaOf=({points:[a,b,c]})=>{const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);return Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2;};
const occupied=(walls,unit,inset,pad,x,z)=>{const half=(unit+2*inset*unit+pad)/2;return walls.some(p=>Math.abs(x-(p.x-7)*unit)<=half&&Math.abs(z-(p.z-7)*unit)<=half);};
const topCovers=(triangles,x,z)=>triangles.some(({points:[a,b,c],normal})=>{
  if(normal[1]!==1)return false;const cross=(p,q)=>(q[0]-p[0])*(z-p[2])-(q[2]-p[2])*(x-p[0]);const values=[cross(a,b),cross(b,c),cross(c,a)];return values.every(v=>v>=-1e-7)||values.every(v=>v<=1e-7);
});

function verifyExterior(g,walls,unit,inset,height,y,pad=0){
  const triangles=triangleData(g);
  for(const triangle of triangles){
    assert.ok(areaOf(triangle)>1e-9,'no degenerate triangles');
    const {points:[a,b,c],normal:n}=triangle,ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert.ok(cross.reduce((sum,v,k)=>sum+v*n[k],0)>0,'winding follows outward normal');
    const centre=a.map((v,k)=>(v+b[k]+c[k])/3),inside=centre.map((v,k)=>v-n[k]*1e-4),outside=centre.map((v,k)=>v+n[k]*1e-4);
    const insideVolume=p=>p[1]>y-height/2&&p[1]<y+height/2&&occupied(walls,unit,inset,pad,p[0],p[2]);
    assert.ok(insideVolume(inside),'inward probe is in the old wall union');assert.ok(!insideVolume(outside),'outward probe is outside; no internal face');
  }
  // Quads on the same plane can meet at their borders, but never overlap in area.
  const p=g.attributes.position,n=g.attributes.normal,quads=[];
  for(let i=0;i<p.count;i+=4){const normal=[n.getX(i),n.getY(i),n.getZ(i)],axis=normal.findIndex(v=>v!==0),other=[0,1,2].filter(k=>k!==axis);const points=Array.from({length:4},(_,j)=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)]);quads.push({axis,sign:normal[axis],plane:points[0][axis],bounds:other.map(k=>[Math.min(...points.map(a=>a[k])),Math.max(...points.map(a=>a[k]))])});}
  for(let i=0;i<quads.length;i++)for(let j=i+1;j<quads.length;j++){
    const a=quads[i],b=quads[j];if(a.axis!==b.axis||a.sign!==b.sign||Math.abs(a.plane-b.plane)>1e-6)continue;
    const overlaps=a.bounds.map((v,k)=>Math.min(v[1],b.bounds[k][1])-Math.max(v[0],b.bounds[k][0]));assert.ok(overlaps.some(v=>v<=1e-6),'no duplicate coplanar surface area');
  }
  return triangles;
}

test('overlapping adjacent walls become one exterior with the correct area and no internal faces',()=>{
  const walls=[{x:7,z:7},{x:8,z:7}],unit=2.4,inset=.1875,height=.94,pad=.018,size=unit+2*inset*unit+pad,width=size+unit;
  const g=createWallShell(walls,unit,inset,height,height/2,pad),triangles=verifyExterior(g,walls,unit,inset,height,height/2,pad);
  close(triangles.filter(t=>t.normal[1]===1).reduce((sum,t)=>sum+areaOf(t),0),width*size);
  close(triangles.reduce((sum,t)=>sum+areaOf(t),0),2*width*size+2*(width+size)*height);
  close(g.boundingBox.min.x,-size/2);close(g.boundingBox.max.x,unit+size/2);
  assert.equal(triangles.filter(t=>t.normal[0]!==0).length,4,'only the two outside X faces remain');g.dispose();
});

test('L-shaped wall union preserves its notch and exact area',()=>{
  const walls=[{x:7,z:7},{x:8,z:7},{x:7,z:8}],unit=2.4,inset=.1875,size=unit+2*inset*unit,height=2.7;
  const g=createWallShell(walls,unit,inset,height,height/2),triangles=verifyExterior(g,walls,unit,inset,height,height/2),area=size*size+2*size*unit,perimeter=4*(size+unit);
  close(triangles.filter(t=>t.normal[1]===1).reduce((sum,t)=>sum+areaOf(t),0),area);
  close(triangles.reduce((sum,t)=>sum+areaOf(t),0),2*area+perimeter*height,1e-4);
  assert.equal(topCovers(triangles,2.5,2.5),false,'open concave corner remains open');assert.equal(topCovers(triangles,2.5,0),true);
  for(let x=-1.57;x<4;x+=.23)for(let z=-1.59;z<4;z+=.21)assert.equal(topCovers(triangles,x,z),occupied(walls,unit,inset,0,x,z));g.dispose();
});

test('side UVs are continuous in world metres instead of restarting on every cube',()=>{
  const unit=2.4,height=.94,g=createWallShell([{x:7,z:7},{x:8,z:7},{x:9,z:7}],unit,.1875,height,height/2),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){
    const nx=n.getX(i),nz=n.getZ(i);if(!nx&&!nz)continue;
    close(uv.getX(i),nx?-nx*p.getZ(i)/unit:nz*p.getX(i)/unit);close(uv.getY(i),p.getY(i)/height);
  }
  assert.ok([...uv.array].every(Number.isFinite));g.dispose();
});

test('full-maze caps match the former AABB union and keep every walkable tile centre clear',()=>{
  const walls=MAP.flatMap((row,z)=>[...row].flatMap((tile,x)=>tile==='#'?[{x,z}]:[])),unit=CELL_SIZE,inset=wallInset(1.5),pad=.018;
  const g=createWallShell(walls,unit,inset,.94,.47,pad),triangles=verifyExterior(g,walls,unit,inset,.94,.47,pad);
  for(let z=0;z<MAP.length;z++)for(let x=0;x<MAP[z].length;x++)if(isOpen(x,z))assert.equal(topCovers(triangles,(x-7)*unit,(z-7)*unit),false);
  for(let x=-18.19;x<18;x+=.83)for(let z=-18.17;z<18;z+=.79)assert.equal(topCovers(triangles,x,z),occupied(walls,unit,inset,pad,x,z));
  assert.ok(Number.isFinite(g.boundingSphere.radius));g.dispose();
});

test('touching, separated, duplicate and empty walls are handled without nonfinite geometry',()=>{
  for(const walls of [[{x:7,z:7},{x:8,z:7}],[{x:7,z:7},{x:9,z:7}],[{x:7,z:7},{x:7,z:7}]]){
    const g=createWallShell(walls,2.4,0,2.7,1.35);verifyExterior(g,walls,2.4,0,2.7,1.35);assert.ok([...g.attributes.position.array].every(Number.isFinite));g.dispose();
  }
  const empty=createWallShell([],2.4,0,2.7,1.35);assert.equal(empty.index.count,0);assert.equal(empty.boundingSphere.radius,0);empty.dispose();
  assert.throws(()=>createWallShell([{x:NaN,z:0}],2.4,0,2.7,1.35),TypeError);assert.throws(()=>createWallShell([],0,0,2.7,1.35),RangeError);
});
