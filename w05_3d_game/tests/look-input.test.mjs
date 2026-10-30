import test from 'node:test';
import assert from 'node:assert/strict';
import {MouseLook} from '../src/look-input.js';
const down={button:0,pointerId:1,clientX:200,clientY:150};
const move=(x,y,buttons=1)=>({pointerId:1,clientX:x,clientY:y,buttons});
test('Unlocked drag uses canvas coordinates even when browser movementX jumps',()=>{
  const look=new MouseLook();look.beginDrag(down);
  assert.deepEqual(look.drag({...move(204,152),movementX:2400,movementY:-900}),{x:4,y:2});
});
test('Releasing outside without mouseup cannot leave the camera dragging',()=>{
  const look=new MouseLook();look.beginDrag(down);look.drag(move(210,155));
  assert.equal(look.drag(move(350,200,0)),null);
  assert.equal(look.drag(move(360,220,1)),null,'a new canvas press is required');
  look.beginDrag({...down,clientX:360,clientY:220});assert.deepEqual(look.drag(move(365,220)),{x:5,y:0});
});
test('Hover and UI clicks do not rotate an unlocked camera',()=>{
  const look=new MouseLook();assert.equal(look.drag(move(300,200,0)),null);
  assert.equal(look.beginDrag({...down,button:2}),false);assert.equal(look.drag(move(310,220)),null);
});
test('Capture cancellation stops look input and other pointers cannot steer',()=>{
  const look=new MouseLook();look.beginDrag(down);assert.equal(look.drag({...move(205,150),pointerId:2}),null);
  look.cancelDrag();assert.equal(look.drag(move(220,150)),null);
});
test('Pointer lock recenter and abnormal spikes never change the view',()=>{
  const look=new MouseLook();look.setLocked(true);
  assert.equal(look.relative({movementX:600,movementY:300}),null);
  assert.deepEqual(look.relative({movementX:12,movementY:-4}),{x:12,y:-4});
  for(const x of [900,-3000,NaN,Infinity])assert.equal(look.relative({movementX:x,movementY:0}),null);
  assert.deepEqual(look.relative({movementX:3,movementY:2}),{x:3,y:2});
});
test('Normal fast motion is preserved and lock loss immediately stops relative look',()=>{
  const look=new MouseLook();look.setLocked(true);look.relative({movementX:0,movementY:0});
  assert.deepEqual(look.relative({movementX:180,movementY:20}),{x:180,y:20});
  look.setLocked(false);assert.equal(look.relative({movementX:20,movementY:10}),null);
});
test('An unlocked cursor re-entry discontinuity is ignored, then tracking resumes',()=>{
  const look=new MouseLook();look.beginDrag(down);assert.equal(look.drag(move(900,150)),null);
  assert.deepEqual(look.drag(move(905,148)),{x:5,y:-2});
});
