import test from 'node:test';
import assert from 'node:assert/strict';
import {crystalGeometry} from '../src/crystal.js';
import {createCrystalMaterial} from '../src/crystal-material.js';

test('Slender crystal has outward-facing finite facets and fits inside its pickup cell',()=>{
  const geometry=crystalGeometry(),p=geometry.attributes.position,n=geometry.attributes.normal;
  geometry.computeBoundingBox();const bounds=geometry.boundingBox;
  assert.ok(bounds.max.y-bounds.min.y>.45);assert.ok(bounds.max.x-bounds.min.x<.18);
  for(let i=0;i<p.count;i+=3){
    const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
    assert.ok(x*n.getX(i)+y*n.getY(i)+z*n.getZ(i)>0,'facet must face outwards');
  }
  geometry.dispose();
});

test('The leaning fragment retains a small closed-facet budget and a consistent optical attribute',()=>{
 const g=crystalGeometry(),p=g.attributes.position,n=g.attributes.normal,facet=g.attributes.crystalFacet;
 assert.ok(p.count/3>20&&p.count/3<=180);assert.equal(facet.count,p.count);
 let upper,lower;const edges=new Map();
 for(let i=0;i<p.count;i++){
  const v=[p.getX(i),p.getY(i),p.getZ(i)];if(!upper||v[1]>upper[1])upper=v;if(!lower||v[1]<lower[1])lower=v;
  assert.ok(v.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
  assert.ok(facet.getX(i)>=0&&facet.getX(i)<1);
 }
 const point=i=>[p.getX(i),p.getY(i),p.getZ(i)].join(',');const winding=new Map();
 for(let i=0;i<p.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){const from=point(a),to=point(b),key=[from,to].sort().join('|');edges.set(key,(edges.get(key)||0)+1);winding.set(key,(winding.get(key)||0)+(from<to?1:-1));}
 assert.ok([...edges.values()].every(count=>count===2),'each edge must belong to exactly two facets');
 assert.ok([...winding.values()].every(sum=>sum===0),'adjacent facets must wind oppositely around every shared edge');
 assert.ok(upper[1]>.314&&upper[1]<=.32&&lower[1]<-.274&&lower[1]>=-.28,'tiny bevels must preserve the long pointed silhouette');
 assert.ok(Math.hypot(upper[0]-lower[0],upper[2]-lower[2])>.04,'the tips must not form a regular upright diamond');g.dispose();
});

test('Crystal optics use bounded physical transmission with shared external texture resources',()=>{
 const material=createCrystalMaterial();assert.ok(material.transmission>0&&material.transmission<=1);assert.ok(material.thickness>0&&material.thickness<.3);assert.ok(material.attenuationDistance>0);assert.equal(material.depthTest,true);assert.equal(material.depthWrite,true);
 assert.equal(material.transparent,false);assert.equal(material.side,0);assert.ok(material.roughness<.15);assert.ok(material.metalness<.05);
 assert.equal(Object.values(material).some(value=>value?.isTexture),false);material.dispose();
});
