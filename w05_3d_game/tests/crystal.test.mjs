import test from 'node:test';
import assert from 'node:assert/strict';
import {crystalGeometry} from '../src/crystal.js';

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
