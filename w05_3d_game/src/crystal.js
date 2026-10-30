import * as THREE from '../vendor/three.module.js';

// Six-sided cut crystal with a short waist and long, slightly asymmetric points.
// Flat facet normals catch real scene lights; there is no transmission render pass.
export function crystalGeometry(){
  const positions=[],colours=[],sides=6;
  const ring=(i,y,r,twist=0)=>{const a=i/sides*Math.PI*2+twist;return [Math.cos(a)*r,y,Math.sin(a)*r];};
  const triangle=(a,b,c,shade)=>{positions.push(...a,...c,...b);for(let n=0;n<3;n++)colours.push(shade,shade*.94,1);};
  for(let i=0;i<sides;i++){
    const a=ring(i,.065,.083),b=ring(i+1,.065,.083),c=ring(i,-.085,.064,.08),d=ring(i+1,-.085,.064,.08),shade=.70+(i%3)*.11;
    triangle([.012,.255,-.008],a,b,shade);triangle(a,c,b,shade*.96);triangle(b,c,d,shade*.96);triangle(c,[0,-.235,0],d,shade*.9);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.computeVertexNormals();return geometry;
}
