import * as THREE from '../vendor/three.module.js';

// One bevel segment: 6 inset faces, 12 edge strips and 8 triangular corners.
// UVs retain BoxGeometry's normalized face scale so existing wood/paint maps fit.
export function beveledBoxGeometry(width,height,depth,bevel=.006){
  const dimensions=[width,height,depth];
  if(dimensions.some(value=>!Number.isFinite(value)||value<=0))throw new RangeError('Box dimensions must be finite and positive.');
  if(!Number.isFinite(bevel)||bevel<0)throw new RangeError('Bevel must be finite and nonnegative.');
  const half=dimensions.map(value=>value/2),radius=Math.min(bevel,Math.min(...dimensions)*.499);
  if(radius===0)return new THREE.BoxGeometry(width,height,depth);
  const inset=half.map(value=>value-radius),positions=[],normals=[],uvs=[],indices=[];
  const uvFor=(p,axis,sign)=>{
    if(axis===0)return [(half[2]-p[2]*sign)/depth,(p[1]+half[1])/height];
    if(axis===1)return [(p[0]+half[0])/width,(half[2]-p[2]*sign)/depth];
    return [(half[0]+p[0]*sign)/width,(p[1]+half[1])/height];
  };
  const polygon=(points,normal,uvAxis)=>{
    // Explicit winding also covers negative faces without mirrored inward normals.
    const ab=new THREE.Vector3().fromArray(points[1]).sub(new THREE.Vector3().fromArray(points[0]));
    const ac=new THREE.Vector3().fromArray(points[2]).sub(new THREE.Vector3().fromArray(points[0]));
    if(ab.cross(ac).dot(new THREE.Vector3(...normal))<0)points.reverse();
    const start=positions.length/3,sign=Math.sign(normal[uvAxis]);
    for(const point of points){positions.push(...point);normals.push(...normal);uvs.push(...uvFor(point,uvAxis,sign));}
    for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
  };
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const b=(axis+1)%3,c=(axis+2)%3,normal=[0,0,0];normal[axis]=sign;
    const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sb,sc])=>{
      const p=[0,0,0];p[axis]=sign*half[axis];p[b]=sb*inset[b];p[c]=sc*inset[c];return p;
    });
    polygon(points,normal,axis);
  }
  for(let axis=0;axis<3;axis++)for(const sb of [-1,1])for(const sc of [-1,1]){
    const b=(axis+1)%3,c=(axis+2)%3,normal=[0,0,0];normal[b]=sb*Math.SQRT1_2;normal[c]=sc*Math.SQRT1_2;
    const point=(along,onB)=>{const p=[0,0,0];p[axis]=along*inset[axis];p[b]=sb*(onB?half[b]:inset[b]);p[c]=sc*(onB?inset[c]:half[c]);return p;};
    polygon([point(-1,true),point(-1,false),point(1,false),point(1,true)],normal,b);
  }
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
    const signs=[sx,sy,sz],normal=signs.map(sign=>sign/Math.sqrt(3));
    const points=[0,1,2].map(axis=>signs.map((sign,i)=>sign*(i===axis?half[i]:inset[i])));
    polygon(points,normal,2);
  }
  const geometry=new THREE.BufferGeometry();
  // Static batching keys include dimensions, preventing differently sized trim from merging as one shape.
  geometry.type='BeveledBoxGeometry';geometry.parameters={width,height,depth,bevel:radius};
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
