import test from 'node:test';
import assert from 'node:assert/strict';
import {MonitorExitGuard} from '../src/monitor-exit.js';
import {createGame} from '../src/core.js';
import {closeBlackoutMonitor} from '../src/blackout-state.js';
test('Escape closes viewing or connecting immediately, preserving bed hiding and game phase',()=>{
 for(const connecting of [false,true]){const g=createGame({}, {mode:'blackout'}),b=g.blackout;b.monitor=!connecting;b.monitorConnecting=connecting?1:0;b.phoneOpen=true;b.hidden='bed:room-201';
 assert(closeBlackoutMonitor(g));assert.equal(b.monitor,false);assert.equal(b.monitorConnecting,0);assert.equal(b.phoneOpen,false);assert.equal(b.hidden,'bed:room-201');assert.equal(g.phase,'playing');assert.equal(closeBlackoutMonitor(g),false);}
});
test('one press cannot both close surveillance and pause across key repeats or delayed fullscreen events',()=>{
 const guard=new MonitorExitGuard();assert(guard.press());guard.mark(100);assert.equal(guard.press(true),false);assert.equal(guard.browserExit(false,120),'ignore');guard.release();assert(guard.press());guard.release();assert.equal(guard.browserExit(false,1000),'pause');
});
test('browser fullscreen exit arriving before keydown consumes the same Escape but not the next press',()=>{
 const guard=new MonitorExitGuard();assert.equal(guard.browserExit(true,100),'close');assert.equal(guard.press(false,120),false);guard.release();assert(guard.press(false,160));
});
test('a browser-consumed keyup cannot leave future Escape presses disabled',()=>{
 const guard=new MonitorExitGuard();guard.browserExit(true,100);assert(guard.press(false,1000));
});
