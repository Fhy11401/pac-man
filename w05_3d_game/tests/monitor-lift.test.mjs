import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorLiftPose} from '../src/monitor-lift.js';

const phone={left:40,top:180,width:240,height:500},viewport={width:1280,height:720};
test('monitor rises from the actual phone rectangle to full viewport without overshoot',()=>{
  const start=monitorLiftPose(0,phone,viewport),end=monitorLiftPose(1,phone,viewport);
  assert.equal(start.x,phone.left);assert.equal(start.y,phone.top);
  assert.equal(start.sx,phone.width/viewport.width);assert.equal(start.sy,phone.height/viewport.height);
  assert.deepEqual(end,{x:0,y:0,sx:1,sy:1,tilt:-0,opacity:1});
  let previous=start;
  for(let i=1;i<=100;i++){const pose=monitorLiftPose(i/100,phone,viewport);assert(pose.x<=previous.x&&pose.y<=previous.y);assert(pose.sx>=previous.sx&&pose.sy>=previous.sy&&pose.sx<=1&&pose.sy<=1);previous=pose;}
  assert.deepEqual(monitorLiftPose(-1,phone,viewport),start);assert.deepEqual(monitorLiftPose(2,phone,viewport),end);
});
test('reduced motion fades without moving or scaling the view',()=>{
  for(const progress of [0,.25,.5,.75,1]){const pose=monitorLiftPose(progress,phone,viewport,true);assert.equal(pose.x,0);assert.equal(pose.y,0);assert.equal(pose.sx,1);assert.equal(pose.sy,1);assert.equal(pose.tilt,0);assert(pose.opacity>=0&&pose.opacity<=1);}
});
