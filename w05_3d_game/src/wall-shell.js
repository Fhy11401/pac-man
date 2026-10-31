import * as THREE from '../vendor/three.module.js';

// Exact exterior of the union of the former expanded wall AABBs. Adjacent boxes
// overlap along their corridor faces; drawing both faces causes texture/depth
// fighting. Coordinate compression removes those duplicate and internal faces.
export function createWallShell(walls,unit,wallInset,height,y,pad=0){
  if(!Array.isArray(walls)||walls.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.z)))throw new TypeError('walls must contain finite x/z coordinates');
  if(!Number.isFinite(unit)||unit<=0||!Number.isFinite(height)||height<=0||![wallInset,y,pad].every(Number.isFinite))throw new RangeError('Invalid wall dimensions');
  const size=unit+2*wallInset*unit+pad;if(size<=0)throw new RangeError('Expanded wall size must be positive');
  const geometry=new THREE.BufferGeometry(),positions=[],normals=[],uvs=[],indices=[];
  geometry.type='WallShellGeometry';
  const half=size/2,lowY=y-height/2,highY=y+height/2;
  const boxes=walls.map(p=>{const x=(p.x-7)*unit,z=(p.z-7)*unit;return {minX:x-half,maxX:x+half,minZ:z-half,maxZ:z+half};});
  // Only collapse floating-point aliases of the same mathematical coordinate.
  const tolerance=value=>Number.EPSILON*64*Math.max(1,Math.abs(value),unit);
  const sortedUnique=values=>{const result=[];for(const value of values.sort((a,b)=>a-b))if(!result.length||Math.abs(value-result.at(-1))>tolerance(value))result.push(value);return result;};
  const xs=sortedUnique(boxes.flatMap(b=>[b.minX,b.maxX])),zs=sortedUnique(boxes.flatMap(b=>[b.minZ,b.maxZ]));
  const nx=Math.max(0,xs.length-1),nz=Math.max(0,zs.length-1),filled=new Uint8Array(nx*nz);
  const coordinateIndex=(values,value)=>values.findIndex(candidate=>Math.abs(candidate-value)<=tolerance(value));
  for(const box of boxes){
    const x0=coordinateIndex(xs,box.minX),x1=coordinateIndex(xs,box.maxX),z0=coordinateIndex(zs,box.minZ),z1=coordinateIndex(zs,box.maxZ);
    for(let z=z0;z<z1;z++)filled.fill(1,z*nx+x0,z*nx+x1);
  }
  const occupied=(x,z)=>x>=0&&x<nx&&z>=0&&z<nz&&filled[z*nx+x]===1;
  const quad=(points,normal)=>{
    const a=new THREE.Vector3(...points[0]),ab=new THREE.Vector3(...points[1]).sub(a),ac=new THREE.Vector3(...points[2]).sub(a);
    if(ab.cross(ac).dot(new THREE.Vector3(...normal))<0)points.reverse();
    const start=positions.length/3;
    for(const p of points){
      positions.push(...p);normals.push(...normal);
      if(normal[0])uvs.push(-normal[0]*p[2]/unit,p[1]/height);
      else if(normal[2])uvs.push(normal[2]*p[0]/unit,p[1]/height);
      else uvs.push(p[0]/unit,-normal[1]*p[2]/unit);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  };
  // Maximal collinear exterior runs. No face exists between two occupied cells.
  for(let x=0;x<=nx;x++){
    const direction=z=>Number(occupied(x-1,z))-Number(occupied(x,z));
    for(let z=0;z<nz;){const sign=direction(z);if(!sign){z++;continue;}const start=z;while(z<nz&&direction(z)===sign)z++;
      quad([[xs[x],lowY,zs[start]],[xs[x],highY,zs[start]],[xs[x],highY,zs[z]],[xs[x],lowY,zs[z]]],[sign,0,0]);
    }
  }
  for(let z=0;z<=nz;z++){
    const direction=x=>Number(occupied(x,z-1))-Number(occupied(x,z));
    for(let x=0;x<nx;){const sign=direction(x);if(!sign){x++;continue;}const start=x;while(x<nx&&direction(x)===sign)x++;
      quad([[xs[start],lowY,zs[z]],[xs[start],highY,zs[z]],[xs[x],highY,zs[z]],[xs[x],lowY,zs[z]]],[0,0,sign]);
    }
  }
  // Each occupied row is covered once. Caps share the exact coordinate table
  // with the side runs, so their borders meet without offsets or overlapping area.
  for(let z=0;z<nz;z++)for(let x=0;x<nx;){
    if(!occupied(x,z)){x++;continue;}const start=x;while(x<nx&&occupied(x,z))x++;
    for(const sign of [-1,1]){const yy=sign>0?highY:lowY;quad([[xs[start],yy,zs[z]],[xs[x],yy,zs[z]],[xs[x],yy,zs[z+1]],[xs[start],yy,zs[z+1]]],[0,sign,0]);}
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.userData.wallShell={sourceBoxes:walls.length,rectangles:indices.length/6,compressedCells:nx*nz};
  if(positions.length){geometry.computeBoundingBox();geometry.computeBoundingSphere();}
  else{geometry.boundingBox=new THREE.Box3(new THREE.Vector3(),new THREE.Vector3());geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),0);}
  return geometry;
}
