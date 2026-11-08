import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REFERENCE_PHOTO,referencePhotoUv} from '../src/reference-photo.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pixels=(u,v)=>{const p=referencePhotoUv(u,v);return[p.x*REFERENCE_PHOTO.width,(1-p.y)*REFERENCE_PHOTO.height];};

test('photo UV corners select the four stated original-image pixel positions without a Y flip',()=>{
  const cases=[[0,1,'topLeft'],[1,1,'topRight'],[1,0,'bottomRight'],[0,0,'bottomLeft']];
  for(const [u,v,key] of cases){const p=pixels(u,v),expected=REFERENCE_PHOTO.corners[key];near(p[0],expected[0]);near(p[1],expected[1]);}
});

test('all projected samples stay inside the selected convex photo region and source image',()=>{
  const corners=['topLeft','topRight','bottomRight','bottomLeft'].map(key=>REFERENCE_PHOTO.corners[key]);
  for(let row=0;row<=40;row++)for(let col=0;col<=40;col++){
    const [x,y]=pixels(col/40,row/40);assert.ok(Number.isFinite(x)&&Number.isFinite(y));
    assert.ok(x>=0&&x<=REFERENCE_PHOTO.width&&y>=0&&y<=REFERENCE_PHOTO.height);
    for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];assert.ok((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-7,'sample escaped quadrilateral');}
  }
});

test('projective sampling keeps straight wallpaper lines straight and avoids a two-triangle affine seam',()=>{
  for(const line of [t=>[t,.35],t=>[.6,t],t=>[t,t]]){
    const a=pixels(...line(0)),b=pixels(...line(1));
    for(let i=1;i<20;i++){const p=pixels(...line(i/20));assert.ok(Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<1e-7);}
  }
  const centre=pixels(.5,.5),tl=REFERENCE_PHOTO.corners.topLeft,br=REFERENCE_PHOTO.corners.bottomRight;
  assert.ok(Math.hypot(centre[0]-(tl[0]+br[0])/2,centre[1]-(tl[1]+br[1])/2)>20,'a simple affine diagonal would retain the source perspective');
  const left=pixels(.5-1e-7,.5),right=pixels(.5+1e-7,.5);assert.ok(Math.hypot(left[0]-right[0],left[1]-right[1])<.001);
});

test('the committed source PNG dimensions match the homography coordinate system',()=>{
  const png=readFileSync(new URL('../assets/materials/reference/source-reference.png',import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),REFERENCE_PHOTO.width);assert.equal(png.readUInt32BE(20),REFERENCE_PHOTO.height);
});
