import * as THREE from '../vendor/three.module.js';

// A leaning five-sided fragment: uneven shoulders, a twisted lower waist and long points.
// Twenty flat facets share one instanced draw. Local coordinates support a cheap optical core.
export function crystalGeometry(){
  const positions=[],colours=[],facets=[],sides=5;
  const radii=[.077,.070,.083,.074,.068],heights=[.102,.080,.062,.086,.113];
  const ring=(i,lower=false)=>{i%=sides;const a=i/sides*Math.PI*2+.27+(lower?.19:0),r=radii[i]*(lower?.76:1);return [Math.cos(a)*r+(lower?-.010:.005),lower?-.066-(i%3)*.012:heights[i],Math.sin(a)*r+(lower?.008:-.004)];};
  const triangle=(a,b,c,facet)=>{positions.push(...a,...c,...b);const shade=[.62,.88,.72,.96,.52][facet%5];for(let n=0;n<3;n++){colours.push(shade,shade,shade);facets.push(facet/20);}};
  for(let i=0;i<sides;i++){
    const a=ring(i),b=ring(i+1),c=ring(i,true),d=ring(i+1,true);
    triangle([.032,.32,-.023],a,b,i*4);triangle(a,c,b,i*4+1);triangle(b,c,d,i*4+2);triangle(c,[-.020,-.28,.021],d,i*4+3);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.setAttribute('crystalFacet',new THREE.Float32BufferAttribute(facets,1));geometry.computeVertexNormals();return geometry;
}
