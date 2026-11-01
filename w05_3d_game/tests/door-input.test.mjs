import test from 'node:test';
import assert from 'node:assert/strict';
import {DoorInput} from '../src/door-input.js';
test('mouse clicks cannot restart or release an existing keyboard quiet hold',()=>{
 const door=new DoorInput();assert.equal(door.press('keyboard'),'door-press');assert.equal(door.press('pointer:1'),null);assert.equal(door.release('pointer:1'),null);assert.equal(door.held,true);assert.equal(door.release('keyboard'),'door-release');assert.equal(door.held,false);
});
test('unrelated releases, repeated keys and cancelled input never create extra door actions',()=>{
 const door=new DoorInput();assert.equal(door.press('pointer:7'),'door-press');assert.equal(door.press('pointer:7'),null);assert.equal(door.release('pointer:2'),null);assert.equal(door.release('keyboard'),null);assert.equal(door.held,true);door.clear();assert.equal(door.held,false);assert.equal(door.release('pointer:7'),null);assert.equal(door.press('keyboard'),'door-press');assert.equal(door.release('keyboard'),'door-release');
});
