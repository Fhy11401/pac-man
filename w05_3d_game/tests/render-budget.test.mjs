import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPixelRatio} from '../src/presentation.js';

test('3D rendering stays within its pixel budget while standard full-HD remains native',()=>{
 assert.equal(renderPixelRatio(1920,1080,1),1);
 for(const [width,height,dpr] of [[1280,720,2],[1600,900,2],[1920,1080,2],[3840,2160,2],[900,1600,3]]){
  const ratio=renderPixelRatio(width,height,dpr);
  assert.ok(ratio>0&&ratio<=dpr&&ratio<=1.6);
  assert.ok(width*height*ratio*ratio<=2400000.001);
 }
});
