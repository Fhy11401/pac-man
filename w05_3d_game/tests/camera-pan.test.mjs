import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraPan} from '../src/camera-pan.js';
test('automatic scanning passes a complete turn without angle snapping',()=>{const p=new CameraPan();for(let i=0;i<1800;i++)p.step(1/60);assert(p.yaw>Math.PI*2);assert(p.yaw<9);});
test('near-wall limits reverse scanning and keep the camera within bounds',()=>{const p=new CameraPan();let reversed=false;for(let i=0;i<600;i++){p.step(1/60,{blocked:y=>Math.abs(y)>.3});assert(Math.abs(p.yaw)<=.3);if(p.direction<0)reversed=true;}assert(reversed);});
test('tracking eases to the shortest angle and scanning resumes when a target is lost',()=>{const p=new CameraPan(Math.PI-.1);for(let i=0;i<240;i++)p.step(1/60,{targetYaw:-Math.PI+.1});assert(Math.abs(Math.atan2(Math.sin(p.yaw-(-Math.PI+.1)),Math.cos(p.yaw-(-Math.PI+.1))))<.001);const before=p.yaw;for(let i=0;i<60;i++)p.step(1/60);assert(p.yaw>before+.15);});
