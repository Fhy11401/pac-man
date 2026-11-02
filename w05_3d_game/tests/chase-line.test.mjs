import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireChaseLine,advanceChaseLine} from '../src/chase-line.js';
import {createGame,tick} from '../src/core.js';
const origin={x:0,z:0},north={x:0,z:-2},east={x:2,z:0};
const fresh=(lit=false)=>acquireChaseLine(origin,north,lit,{x:0,z:2});
const update=(line,overrides={})=>advanceChaseLine(line,{point:{x:0,z:-1},velocity:north,lit:false,visible:false,now:0,sight:()=>true,project:(p,d)=>({x:p.x+d.x*5,z:p.z+d.z*5}),...overrides});

test('dark straight movement and a stationary player retain the line without a timeout',()=>{
 const line=fresh(true);assert.equal(update(line).kind,'track');
 assert.equal(update(line,{point:{x:0,z:-20},now:20}).kind,'track');
 assert.equal(update(line,{point:{x:0,z:-20},velocity:{x:0,z:0},now:50}).kind,'track');assert.equal(line.missingSince,null);
});
test('dark corners keep the original forward target and expire at exactly 1.5 seconds',()=>{
 const line=fresh();const turn={point:{x:.1,z:0},velocity:east};
 const first=update(line,turn);assert.deepEqual(first,{kind:'rush',point:{x:0,z:-5}});
 assert.equal(update(line,{...turn,point:{x:2,z:0},now:1.49}).kind,'rush');
 assert.equal(update(line,{...turn,point:{x:3,z:0},now:1.5}).kind,'lost');assert.deepEqual(line.direction,{x:0,z:-1});
});
test('a lit corner updates the remembered direction, including a turn into darkness',()=>{
 const line=fresh(true);assert.equal(update(line,{point:{x:.2,z:0},velocity:east}).kind,'track');
 assert.deepEqual(line.direction,{x:1,z:0});assert.equal(update(line,{point:{x:5,z:0},velocity:east,now:5}).kind,'track');
});
test('light beyond an unseen dark corner does not reveal the turn retroactively',()=>{
 const line=fresh();assert.equal(update(line,{point:{x:.2,z:0},velocity:east,lit:true}).kind,'rush');
});
test('reacquiring visible contact cancels the missed-turn timer',()=>{
 const line=fresh();update(line,{point:{x:.2,z:0},velocity:east});
 assert.equal(update(line,{point:{x:1,z:0},velocity:east,visible:true,lit:true,now:1.3}).kind,'track');assert.equal(line.missingSince,null);
 assert.equal(update(line,{point:{x:2,z:0},velocity:east,now:3}).kind,'track');
});
test('closed barriers and concealment break a line; visual contact while stopped preserves direction',()=>{
 const line=fresh();update(line,{point:origin,velocity:{x:0,z:0},visible:true});assert.deepEqual(line.direction,{x:0,z:-1});
 assert.equal(update(line,{sight:()=>false}).kind,'rush');
 assert.equal(update(fresh(),{hidden:true}).kind,'rush');
});
test('actual dark sprint turns cannot redirect the enemy with footsteps, then resume patrol',()=>{
 const g=createGame({}, {mode:'blackout'});g.enemyDelay=10000;g.enemy={x:18,z:8};g.player={x:18,z:10};g.blackout.enemyHeading=0;
 tick(g,{x:0,z:0,heading:0,action:'flashlight'},.1);assert.equal(g.blackout.enemyMode,'chase');
 tick(g,{x:0,z:0,heading:0,action:'flashlight'},.1);
 g.player={x:18.15,z:10};g.motionVelocity={x:0,z:0};
 for(let i=0;i<5;i++)tick(g,{x:1,z:0,run:true},.1);
 assert.equal(g.blackout.enemyMode,'chase');assert.notEqual(g.blackout.chaseLine.missingSince,null);assert(Math.abs(g.blackout.enemyTarget.x-18)<.36);
 for(let i=0;i<16;i++)tick(g,{x:0,z:0},.1);
 assert.equal(g.blackout.enemyMode,'patrol');assert.equal(g.blackout.chaseLine,null);
});
