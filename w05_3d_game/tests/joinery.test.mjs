import test from 'node:test';
import assert from 'node:assert/strict';
import {beveledBoxGeometry} from '../src/joinery.js';

const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('beveled joinery retains exact outer dimensions within a 44-triangle budget',()=>{
  for(const [w,h,d,b] of [[1,2,.08,.006],[.045,1.04,.09,.004],[.025,.65,.04,.003],[2.4,.05,.06,.006]]){
    const g=beveledBoxGeometry(w,h,d,b);
    assert.equal(g.type,'BeveledBoxGeometry');assert.equal(g.index.count/3,44);
    for(const [axis,value] of [['x',w],['y',h],['z',d]]){close(g.boundingBox.min[axis],-value/2);close(g.boundingBox.max[axis],value/2);}
    assert.ok(Number.isFinite(g.boundingSphere.radius)&&g.boundingSphere.radius>0);
    assert.deepEqual(g.parameters,{width:w,height:h,depth:d,bevel:b});g.dispose();
  }
});

test('all joinery triangles have finite outward normals, nonzero area and normalized UVs',()=>{
  const g=beveledBoxGeometry(.11,2.35,.16),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(const a of [p,n,uv])assert.ok([...a.array].every(Number.isFinite));
  for(let i=0;i<p.count;i++){
    close(Math.hypot(n.getX(i),n.getY(i),n.getZ(i)),1);
    assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
  }
  for(let i=0;i<g.index.count;i+=3){
    const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];
    const [a,b,c]=ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]),ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const normal=[n.getX(ids[0]),n.getY(ids[0]),n.getZ(ids[0])];
    assert.ok(Math.hypot(...cross)>1e-10);
    assert.ok(cross.reduce((sum,v,k)=>sum+v*normal[k],0)>0,'winding matches outward normal');
    assert.ok(normal.reduce((sum,v,k)=>sum+v*(a[k]+b[k]+c[k])/3,0)>0,'face points away from center');
  }
  g.dispose();
});

test('major faces keep BoxGeometry UV orientation and full face texture scale',()=>{
  const [w,h,d]=[.4,1.8,.1],g=beveledBoxGeometry(w,h,d,.006),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  let faceVertices=0;
  for(let i=0;i<p.count;i++){
    const normal=[n.getX(i),n.getY(i),n.getZ(i)],axis=normal.findIndex(v=>Math.abs(v)===1);if(axis<0)continue;
    const sign=normal[axis],x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const expected=axis===0?[(d/2-z*sign)/d,(y+h/2)/h]:axis===1?[(x+w/2)/w,(d/2-z*sign)/d]:[(w/2+x*sign)/w,(y+h/2)/h];
    close(uv.getX(i),expected[0]);close(uv.getY(i),expected[1]);faceVertices++;
  }
  assert.equal(faceVertices,24);g.dispose();
});

test('zero and excessive bevels remain valid; invalid dimensions are rejected',()=>{
  const flat=beveledBoxGeometry(1,2,.1,0);assert.equal(flat.index.count/3,12);flat.dispose();
  const thin=beveledBoxGeometry(.001,1,1,10);assert.equal(thin.parameters.bevel,.000499);assert.ok([...thin.attributes.position.array].every(Number.isFinite));thin.dispose();
  for(const args of [[0,1,1],[-1,1,1],[NaN,1,1],[1,Infinity,1],[1,1,1,-1],[1,1,1,NaN]])assert.throws(()=>beveledBoxGeometry(...args),RangeError);
  assert.notDeepEqual(beveledBoxGeometry(1,2,3).parameters,beveledBoxGeometry(2,2,3).parameters);
});
